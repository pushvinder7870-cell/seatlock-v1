import 'server-only';
import { pool } from '../db';
import type { CurrentUser } from '../session';
import { APP_TIME_ZONE } from '../time';
import { requireRole } from './authz';
import { SHARD_COUNT, listAuditLogs, type AuditRow } from './audit';
import { listEvents } from './events';

const BUCKET_SECONDS = 15 * 60;
const BUCKETS = 24; // 6 hours

export type AdminDashboard = {
  kpi: { users: number; bookings: number; bookingsToday: number; activeHolds: number; checkedIn: number; revenueCents: number; seatsSold: number; capacity: number; denied24h: number; failedLogins24h: number };
  hourly: { hour: string; holds: number; bookings: number; rejected: number; denied: number }[];
  occupancy: { event: string; booked: number; held: number; available: number; blocked: number }[];
  shards: { shard: string; total: number; last24: number }[];
  actions: { action: string; count: number }[];
  security: Pick<AuditRow, 'id' | 'action' | 'created_at' | 'actor_name' | 'actor_role' | 'details' | 'shard'>[];
};

/**
 * Admin overview. Audit statistics are computed with a scatter-gather over all
 * four shards (one GROUP BY per shard, merged here), the same way the audit
 * viewer reads unfiltered logs.
 */
export async function getAdminDashboard(user: CurrentUser): Promise<AdminDashboard> {
  await requireRole(user, ['admin'], { action: 'getAdminDashboard' });
  const shardIds = Array.from({ length: SHARD_COUNT }, (_, i) => i);

  const [events, kpiRes, shardRes, hourlyRes, denied, failed] = await Promise.all([
    listEvents(user),
    pool.query<{ users: number; bookings: number; bookings_today: number; active_holds: number; checked_in: number; revenue: number }>(`
      SELECT (SELECT count(*) FROM users)::int AS users,
             (SELECT count(*) FROM bookings WHERE status = 'confirmed')::int AS bookings,
             (SELECT count(*) FROM bookings WHERE created_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)::int AS bookings_today,
             (SELECT count(*) FROM holds WHERE status = 'active' AND expires_at > now())::int AS active_holds,
             (SELECT count(*) FROM bookings WHERE status = 'confirmed' AND checked_in_at IS NOT NULL)::int AS checked_in,
             (SELECT coalesce(sum(amount_cents), 0) FROM payments WHERE status = 'paid')::int AS revenue`, [APP_TIME_ZONE]),
    Promise.all(
      shardIds.map((s) =>
        pool.query<{ total: number; last24: number }>(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last24 FROM audit_logs_${s}`
        )
      )
    ),
    Promise.all(
      shardIds.map((s) =>
        // 15-minute buckets by wall-clock time in the app time zone (epoch of the local timestamp, read as if UTC).
        pool.query<{ h: string; action: string; n: number }>(
          `SELECT (floor(extract(epoch FROM created_at AT TIME ZONE $1) / ${BUCKET_SECONDS}) * ${BUCKET_SECONDS})::bigint::text AS h,
                  action, count(*)::int AS n
             FROM audit_logs_${s} WHERE created_at > now() - interval '24 hours' GROUP BY 1, 2`,
          [APP_TIME_ZONE]
        )
      )
    ),
    listAuditLogs(user, { action: 'ACCESS_DENIED', limit: 6 }),
    listAuditLogs(user, { action: 'LOGIN_FAILED', limit: 6 }),
  ]);

  // 24 × 15-minute buckets (last 6 hours) ending with the current one, same "local wall clock as UTC" encoding as the SQL
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const nowLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) / 1000;
  const current = Math.floor(nowLocal / BUCKET_SECONDS) * BUCKET_SECONDS;
  const buckets = new Map<number, AdminDashboard['hourly'][number]>();
  for (let i = BUCKETS - 1; i >= 0; i--) {
    const h = current - i * BUCKET_SECONDS;
    const d = new Date(h * 1000);
    const label = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    buckets.set(h, { hour: label, holds: 0, bookings: 0, rejected: 0, denied: 0 });
  }
  const actionTotals = new Map<string, number>();
  for (const { rows } of hourlyRes) {
    for (const r of rows) {
      actionTotals.set(r.action, (actionTotals.get(r.action) ?? 0) + r.n);
      const b = buckets.get(Number(r.h));
      if (!b) continue;
      if (r.action === 'SEAT_HOLD') b.holds += r.n;
      else if (r.action === 'BOOKING_CONFIRMED') b.bookings += r.n;
      else if (r.action === 'SEAT_HOLD_REJECTED') b.rejected += r.n;
      else if (r.action === 'ACCESS_DENIED' || r.action === 'LOGIN_FAILED') b.denied += r.n;
    }
  }

  const k = kpiRes.rows[0];
  const seatsSold = events.reduce((n, e) => n + e.booked, 0);
  const capacity = events.reduce((n, e) => n + e.total_seats, 0);
  const security = [...denied.rows, ...failed.rows]
    .sort((a, b) => (BigInt(b.ts_us) > BigInt(a.ts_us) ? 1 : -1))
    .slice(0, 8)
    .map(({ id, action, created_at, actor_name, actor_role, details, shard }) => ({ id, action, created_at, actor_name, actor_role, details, shard }));

  return {
    kpi: {
      users: k.users,
      bookings: k.bookings,
      bookingsToday: k.bookings_today,
      activeHolds: k.active_holds,
      checkedIn: k.checked_in,
      revenueCents: k.revenue,
      seatsSold,
      capacity,
      denied24h: actionTotals.get('ACCESS_DENIED') ?? 0,
      failedLogins24h: actionTotals.get('LOGIN_FAILED') ?? 0,
    },
    hourly: [...buckets.values()],
    occupancy: events.map((e) => ({
      event: e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name,
      booked: e.booked,
      held: e.held,
      available: e.available,
      blocked: e.blocked,
    })),
    shards: shardRes.map((r, i) => ({ shard: `audit_logs_${i}`, total: r.rows[0].total, last24: r.rows[0].last24 })),
    actions: [...actionTotals.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    security,
  };
}
