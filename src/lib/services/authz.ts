import 'server-only';
import type { CurrentUser } from '../session';
import type { Role } from '../token';
import { ForbiddenError } from '../errors';
import { writeAudit } from './audit';

type DenyContext = {
  action: string; // service function / operation that was refused
  eventId?: string | null;
  targetType?: string;
  targetId?: string;
  reason?: string;
};

/**
 * Records ACCESS_DENIED and throws a 403. Every 403 in the app goes through
 * here or through the proxy, so every 403 leaves an audit record.
 *
 * Call it before opening a transaction: the audit row is written on its own
 * connection and must not be rolled back with the refused operation.
 */
export async function deny(user: CurrentUser | null, ctx: DenyContext): Promise<never> {
  await writeAudit({
    action: 'ACCESS_DENIED',
    actor: user ? { id: user.id, role: user.role } : null,
    eventId: ctx.eventId,
    targetType: ctx.targetType,
    targetId: ctx.targetId,
    details: { operation: ctx.action, reason: ctx.reason ?? 'role', layer: 'service' },
    fallbackKey: 'anonymous',
  });
  throw new ForbiddenError(
    ctx.reason === 'ownership'
      ? 'You can only access your own resources.'
      : 'Your role does not allow this action.'
  );
}

export async function requireRole(user: CurrentUser, roles: Role[], ctx: DenyContext) {
  if (!roles.includes(user.role)) await deny(user, { ...ctx, reason: ctx.reason ?? 'role' });
}
