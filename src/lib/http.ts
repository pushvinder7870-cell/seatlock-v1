import 'server-only';
import type { NextRequest } from 'next/server';
import { getCurrentUser, type CurrentUser } from './session';
import { verifyCsrf } from './token';
import { ForbiddenError, UnauthorizedError, ValidationError, toAppError } from './errors';
import { htmlErrorPage } from './html';
import { writeAudit } from './services/audit';

/*
 * Route handlers are thin: parse input, call ONE service function (which does
 * its own authorization), and map the result or error onto HTTP.
 *
 * The same endpoint serves two kinds of client:
 *  - browser <form> posts (no JS needed): success -> 303 redirect back to the
 *    page with a notice code; failure -> an HTML error page carrying the real
 *    status code (403/409/503...).
 *  - JSON clients (load test, fetch): JSON body + status code.
 */

export type Body = Record<string, string | string[]>;
export type Result = { status?: number; json?: unknown; redirect?: string; notice?: string };
export type Handler<P> = (ctx: { req: NextRequest; params: P; user: CurrentUser; body: Body }) => Promise<Result>;

export function isFormPost(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

/** A form submitted by <ActionForm> via fetch (JS available): answer with JSON incl. redirect/notice. */
export function isEnhanced(req: NextRequest) {
  return req.headers.get('x-seatlock-enhanced') === '1';
}

export async function readBody(req: NextRequest): Promise<Body> {
  if (req.method === 'GET' || req.method === 'HEAD') return Object.fromEntries(req.nextUrl.searchParams);
  if (isFormPost(req)) {
    const out: Body = {};
    for (const [k, v] of (await req.formData()).entries()) {
      if (typeof v !== 'string') continue;
      const prev = out[k];
      out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
    return out;
  }
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Body;
  } catch {}
  throw new ValidationError('Request body must be a JSON object or a form submission.');
}

export function str(body: Body, key: string): string {
  const v = body[key];
  return Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v);
}

export function list(body: Body, key: string): string[] {
  const v = body[key];
  if (Array.isArray(v)) return v.map(String);
  if (v == null || v === '') return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Only same-site relative paths are allowed as redirect targets (no open redirects). */
export function safePath(path: unknown, fallback = '/events'): string {
  if (typeof path === 'string' && /^\/(?![/\\])/.test(path)) return path;
  return fallback;
}

function withNotice(path: string, notice?: string) {
  if (!notice) return path;
  const [base, hash] = path.split('#');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}notice=${encodeURIComponent(notice)}${hash ? `#${hash}` : ''}`;
}

export function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
}

export function errorResponse(e: unknown, form: boolean, backHref: string) {
  const err = toAppError(e);
  const res = form
    ? htmlErrorPage(err.status, err.code, err.message, backHref)
    : Response.json({ error: err.code, message: err.message, ...err.extra }, { status: err.status });
  if (err.status === 429 && typeof err.extra.retryAfterSeconds === 'number') {
    res.headers.set('Retry-After', String(err.extra.retryAfterSeconds));
  }
  return res;
}

export function apiRoute<P = Record<string, never>>(fn: Handler<P>, opts: { csrf?: boolean } = {}) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    const enhanced = isEnhanced(req);
    const form = isFormPost(req) && !enhanced;
    let body: Body = {};
    try {
      body = await readBody(req);
      const user = await getCurrentUser();
      if (!user) throw new UnauthorizedError();

      // CSRF layer 2 (layer 1 is the Origin check in the proxy): every
      // state-changing request must carry the session-bound token, as a hidden
      // form field or an X-CSRF-Token header.
      if (req.method !== 'GET' && req.method !== 'HEAD' && opts.csrf !== false) {
        const token = req.headers.get('x-csrf-token') ?? str(body, '_csrf');
        if (!verifyCsrf(user.sessionId, token)) {
          await writeAudit({
            action: 'ACCESS_DENIED',
            actor: { id: user.id, role: user.role },
            details: { reason: 'csrf', path: req.nextUrl.pathname, method: req.method, layer: 'route' },
          });
          throw new ForbiddenError('Missing or invalid CSRF token. Reload the page and try again.');
        }
      }

      const result = await fn({ req, params: await ctx.params, user, body });
      if (form) return seeOther(withNotice(safePath(result.redirect ?? body._redirect), result.notice));
      if (enhanced) {
        return Response.json(
          { ...((result.json as object) ?? { ok: true }), redirect: safePath(result.redirect ?? body._redirect), notice: result.notice ?? null },
          { status: result.status ?? 200 }
        );
      }
      return Response.json(result.json ?? { ok: true }, { status: result.status ?? 200 });
    } catch (e) {
      return errorResponse(e, form, safePath(body._redirect, req.headers.get('referer') ? new URL(req.headers.get('referer')!).pathname : '/events'));
    }
  };
}
