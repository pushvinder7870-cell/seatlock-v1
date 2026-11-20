import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { pool } from './db';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  csrfTokenFor,
  signToken,
  verifyToken,
  type Role,
} from './token';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  sessionId: string;
  csrfToken: string;
};

/**
 * Resolves the logged-in user for this request, or null.
 * The signed cookie is only a pointer: the session row and the user's
 * *current* role and active flag are re-read from the database, so logout,
 * role changes and deactivation take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = verifyToken(token);
  if (!claims) return null;
  const { rows } = await pool.query<{ id: string; name: string; email: string; role: Role }>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2
        AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.is_active`,
    [claims.sid, claims.sub]
  );
  const u = rows[0];
  if (!u) return null;
  return { ...u, sessionId: claims.sid, csrfToken: csrfTokenFor(claims.sid) };
});

export async function createSession(user: { id: string; role: Role }): Promise<{ token: string; sessionId: string }> {
  const { rows } = await pool.query<{ id: string; exp: number }>(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES ($1, now() + make_interval(secs => $2))
     RETURNING id, extract(epoch FROM expires_at)::bigint AS exp`,
    [user.id, SESSION_TTL_SECONDS]
  );
  const { id, exp } = rows[0];
  return { token: signToken({ sid: id, sub: user.id, role: user.role, exp: Number(exp) }), sessionId: id };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function revokeSession(sessionId: string) {
  await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}
