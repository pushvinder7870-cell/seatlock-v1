import 'server-only';
import { pool } from '../db';
import { ValidationError, AppError, RateLimitError } from '../errors';
import { LIMITS, hit, peek } from './ratelimit';
import type { Role } from '../token';
import { createSession, revokeSession, type CurrentUser } from '../session';
import { writeAudit } from './audit';

export async function login(email: string, password: string, meta: { ip?: string } = {}) {
  email = (email ?? '').trim().toLowerCase();
  if (!email || !password) throw new ValidationError('Email and password are required.');
  if (email.length > 255 || password.length > 200) throw new ValidationError('Invalid credentials format.');

  // Brute-force protection: per-IP request cap + per-email lockout after repeated failures.
  if (meta.ip) await hit(`login:ip:${meta.ip}`, LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowSec, 'Too many login attempts from your network. Try again shortly.');
  const failKey = `login:fail:${email}`;
  const fails = await peek(failKey, LIMITS.loginFailuresPerEmail.windowSec);
  if (fails.count >= LIMITS.loginFailuresPerEmail.limit) {
    await writeAudit({ action: 'LOGIN_LOCKED', fallbackKey: email, details: { email, ip: meta.ip, failures: fails.count } });
    throw new RateLimitError(`Too many failed attempts. This account is locked for ${Math.ceil(fails.retry / 60)} minute(s).`, fails.retry);
  }

  const { rows } = await pool.query<{ id: string; name: string; role: Role; is_active: boolean; ok: boolean }>(
    `SELECT id, name, role, is_active, (password_hash = crypt($2, password_hash)) AS ok
       FROM users WHERE lower(email) = $1`,
    [email, password]
  );
  const user = rows[0];
  // Unknown email: still pay for one bcrypt so response time doesn't reveal which emails exist.
  if (!user) await pool.query(`SELECT crypt($1, gen_salt('bf', 8))`, [password]);

  if (!user || !user.ok || !user.is_active) {
    await hit(failKey, Number.MAX_SAFE_INTEGER, LIMITS.loginFailuresPerEmail.windowSec); // count the failure
    await writeAudit({
      action: 'LOGIN_FAILED',
      actor: user ? { id: user.id, role: user.role } : null,
      fallbackKey: email,
      details: {
        email,
        reason: !user ? 'unknown_email' : !user.ok ? 'bad_password' : 'inactive',
        ip: meta.ip,
      },
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const session = await createSession(user);
  await writeAudit({
    action: 'LOGIN',
    actor: { id: user.id, role: user.role },
    targetType: 'session',
    targetId: session.sessionId,
    details: { ip: meta.ip },
  });
  return { user: { id: user.id, name: user.name, role: user.role }, ...session };
}

export async function logout(user: CurrentUser) {
  await revokeSession(user.sessionId);
  await writeAudit({ action: 'LOGOUT', actor: { id: user.id, role: user.role }, targetType: 'session', targetId: user.sessionId });
}
