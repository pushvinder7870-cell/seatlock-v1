import type { NextRequest } from 'next/server';
import { login } from '@/lib/services/auth';
import { setSessionCookie } from '@/lib/session';
import { csrfTokenFor } from '@/lib/token';
import { clientIp, errorResponse, isEnhanced, isFormPost, readBody, safePath, seeOther, str } from '@/lib/http';
import { homeFor } from '@/lib/home';

// Public endpoint (no session yet). Cross-site posts are rejected by the proxy's Origin check.
export async function POST(req: NextRequest) {
  const enhanced = isEnhanced(req);
  const form = isFormPost(req) && !enhanced;
  let requested = '';
  try {
    const body = await readBody(req);
    requested = str(body, 'next');
    const result = await login(str(body, 'email'), str(body, 'password'), { ip: clientIp(req) });
    await setSessionCookie(result.token);
    const next = safePath(requested, homeFor(result.user.role));
    if (form) return seeOther(next);
    return Response.json({ user: result.user, csrfToken: csrfTokenFor(result.sessionId), redirect: next });
  } catch (e) {
    if (form && (e as { status?: number }).status === 401) {
      return seeOther(`/login?error=invalid${requested ? `&next=${encodeURIComponent(safePath(requested))}` : ''}`);
    }
    return errorResponse(e, form, '/login');
  }
}
