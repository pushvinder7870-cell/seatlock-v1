// Session token + CSRF token helpers. No database access here: this module
// is imported by the proxy (route middleware) as well as by server code.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'seatlock_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Role = 'admin' | 'organizer' | 'student';
export const ROLES: Role[] = ['admin', 'organizer', 'student'];

export type TokenClaims = {
  sid: string; // sessions.id. The server re-checks this row on every request.
  sub: string; // user id
  role: Role;
  exp: number; // unix seconds
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (16+ chars)');
  return s;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function hmac(data: string): Buffer {
  return createHmac('sha256', secret()).update(data).digest();
}

/** Signs an HS256 JWT. */
export function signToken(claims: TokenClaims): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  return `${header}.${payload}.${b64url(hmac(`${header}.${payload}`))}`;
}

/** Verifies signature + expiry. Returns null for anything invalid. */
export function verifyToken(token: string | undefined | null): TokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = hmac(`${header}.${payload}`);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    if (!ROLES.includes(claims.role)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** CSRF token bound to the session (synchronizer token derived via HMAC). */
export function csrfTokenFor(sessionId: string): string {
  return b64url(hmac(`csrf:${sessionId}`));
}

export function verifyCsrf(sessionId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(csrfTokenFor(sessionId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
