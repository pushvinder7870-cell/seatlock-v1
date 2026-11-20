import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/lib/token';
import { PUBLIC_PATHS, eventIdFromPath, matchRule } from '@/lib/route-rules';
import { htmlErrorPage } from '@/lib/html';
import { writeAudit } from '@/lib/services/audit';

/*
 * Route middleware (Next.js 16 "proxy"): first line of defence.
 *  1. Same-origin check on state-changing requests (CSRF layer 1).
 *  2. Authentication: a valid signed session token is required everywhere
 *     except /login.
 *  3. Role-based route rules (src/lib/route-rules.ts) -> 403 + ACCESS_DENIED.
 *
 * Ownership checks need data, so they live in the service layer, which also
 * repeats the role check: the proxy is never the only guard.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function forbid(req: NextRequest, reason: string, actor: { id: string; role: string } | null, extra: Record<string, unknown> = {}) {
  const { pathname } = req.nextUrl;
  await writeAudit({
    action: 'ACCESS_DENIED',
    actor,
    eventId: eventIdFromPath(pathname) ?? null,
    details: { reason, path: pathname, method: req.method, layer: 'proxy', ...extra },
    fallbackKey: 'anonymous',
  }).catch((e) => console.error('audit write failed', e));

  const message =
    reason === 'cross_origin'
      ? 'Cross-site request blocked.'
      : `Your role (${actor?.role}) is not allowed to access ${pathname}.`;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'FORBIDDEN', message }, { status: 403 });
  }
  return htmlErrorPage(403, 'FORBIDDEN', message, '/events');
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const claims = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  const actor = claims ? { id: claims.sub, role: claims.role } : null;

  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && origin !== 'null') {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {}
      const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
      if (originHost !== host) return forbid(req, 'cross_origin', actor, { origin });
    }
  }

  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();

  if (!claims) {
    if (isApi) return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Please log in.' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const rule = matchRule(pathname, req.method);
  if (rule && !rule.roles.includes(claims.role)) {
    return forbid(req, 'role', actor, { requiredRoles: rule.roles });
  }
  // Authenticated content must never be stored by the browser or any proxy:
  // after logout the Back button must not show the old dashboard.
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|css|js)$).*)'],
};
