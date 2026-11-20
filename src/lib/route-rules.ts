import type { Role } from './token';

/**
 * Route-level RBAC, enforced in src/proxy.ts before any page or API route
 * runs. This is the first of two checks: every service function re-checks
 * role AND resource ownership against the database.
 *
 * First matching rule wins. Paths not listed only require a logged-in user.
 */
export type RouteRule = { pattern: RegExp; roles: Role[]; methods?: string[] };

const UUID = '[0-9a-fA-F-]{36}';

export const ROUTE_RULES: RouteRule[] = [
  // Admin area
  { pattern: /^\/admin(\/|$)/, roles: ['admin'] },
  { pattern: /^\/api\/admin(\/|$)/, roles: ['admin'] },

  // AI: drafting event descriptions is an organizer tool
  { pattern: /^\/api\/ai\/describe$/, roles: ['organizer'] },

  // Community moderation: pinning is admin-only (deleting is checked per-owner in the service)
  { pattern: new RegExp(`^/api/posts/${UUID}/pin$`), roles: ['admin'] },

  // Organizer: create / edit own events, block seats
  { pattern: /^\/events\/new$/, roles: ['organizer'] },
  { pattern: new RegExp(`^/events/${UUID}/edit$`), roles: ['organizer'] },
  { pattern: /^\/api\/events$/, roles: ['organizer'], methods: ['POST'] },
  { pattern: new RegExp(`^/api/events/${UUID}$`), roles: ['organizer'], methods: ['POST', 'PATCH', 'PUT'] },
  { pattern: new RegExp(`^/api/events/${UUID}/block$`), roles: ['organizer'] },

  // Organizer + admin: attendee lists and check-in
  { pattern: new RegExp(`^/events/${UUID}/attendees$`), roles: ['organizer', 'admin'] },
  { pattern: new RegExp(`^/api/events/${UUID}/attendees$`), roles: ['organizer', 'admin'] },
  { pattern: new RegExp(`^/api/bookings/${UUID}/checkin$`), roles: ['organizer', 'admin'] },

  // Student: hold / confirm / cancel / my bookings
  { pattern: /^\/my(\/|$)/, roles: ['student'] },
  { pattern: /^\/checkout(\/|$)/, roles: ['student'] },
  { pattern: /^\/api\/my(\/|$)/, roles: ['student'] },
  { pattern: new RegExp(`^/api/events/${UUID}/hold$`), roles: ['student'] },
  { pattern: /^\/api\/holds(\/|$)/, roles: ['student'] },
  { pattern: new RegExp(`^/api/bookings/${UUID}/cancel$`), roles: ['student'] },
];

export const PUBLIC_PATHS = [/^\/login$/, /^\/api\/auth\/login$/, /^\/api\/health$/];

export function matchRule(pathname: string, method: string): RouteRule | undefined {
  return ROUTE_RULES.find(
    (r) => r.pattern.test(pathname) && (!r.methods || r.methods.includes(method))
  );
}

/** Pulls an event id out of an /events/:id or /api/events/:id path (for audit shard routing). */
export function eventIdFromPath(pathname: string): string | undefined {
  return pathname.match(new RegExp(`^(?:/api)?/events/(${UUID})`))?.[1];
}
