import 'server-only';
import { pool, withTransaction } from '../db';
import { NotFoundError, ValidationError, BusinessRuleError } from '../errors';
import type { CurrentUser } from '../session';
import { ROLES, type Role } from '../token';
import { requireRole } from './authz';
import { writeAudit } from './audit';

export type UserRow = { id: string; name: string; email: string; role: Role; is_active: boolean; created_at: Date };

export async function listUsers(user: CurrentUser): Promise<UserRow[]> {
  await requireRole(user, ['admin'], { action: 'listUsers' });
  const { rows } = await pool.query<UserRow>(
    `SELECT id, name, email, role, is_active, created_at FROM users
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'organizer' THEN 1 ELSE 2 END, email`
  );
  return rows;
}

/** Admin changes a user's role / active flag. Existing sessions are revoked so the change applies at once. */
export async function updateUser(user: CurrentUser, userId: string, input: { role: string; isActive: boolean }) {
  await requireRole(user, ['admin'], { action: 'updateUser', targetType: 'user', targetId: userId });
  if (!ROLES.includes(input.role as Role)) throw new ValidationError('Unknown role.');
  if (userId === user.id && (input.role !== 'admin' || !input.isActive)) {
    throw new BusinessRuleError('SELF_LOCKOUT', 'You cannot remove your own admin access.');
  }
  return withTransaction(async (tx) => {
    const before = await tx.query<{ role: Role; is_active: boolean }>(
      'SELECT role, is_active FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!before.rows[0]) throw new NotFoundError('User not found.');
    const prev = before.rows[0];
    if (prev.role === input.role && prev.is_active === input.isActive) return { changed: false };
    await tx.query('UPDATE users SET role = $2, is_active = $3 WHERE id = $1', [userId, input.role, input.isActive]);
    await tx.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await writeAudit(
      {
        action: 'ROLE_CHANGED',
        actor: { id: user.id, role: user.role },
        targetType: 'user',
        targetId: userId,
        details: { from: prev, to: { role: input.role, is_active: input.isActive } },
      },
      tx
    );
    return { changed: true };
  });
}
