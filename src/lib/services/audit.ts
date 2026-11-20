import 'server-only';
import { createHash } from 'node:crypto';
import { pool, type Db } from '../db';
import type { CurrentUser } from '../session';
import { ValidationError } from '../errors';
import { requireRole } from './authz';
import { parseLocal } from '../time';

export const SHARD_COUNT = 4;

export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'SEAT_HOLD',
  'SEAT_HOLD_REJECTED',
  'HOLD_RELEASED',
  'HOLD_EXPIRED',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'EVENT_CREATED',
  'EVENT_UPDATED',
  'SEATS_BLOCKED',
  'SEATS_UNBLOCKED',
  'CHECKIN',
  'ROLE_CHANGED',
  'ACCESS_DENIED',
  'LOGIN_LOCKED',
  'RATE_LIMITED',
  'POST_CREATED',
  'POST_DELETED',
  'POST_PINNED',
  'COMMENT_CREATED',
  'COMMENT_DELETED',
  'REVIEW_SUBMITTED',
  'REVIEW_DELETED',
  'PAYMENT_CAPTURED',
  'PAYMENT_DECLINED',
  'PAYMENT_REFUNDED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Stable shard routing: first 32 bits of md5(key) mod 4.
 * md5 is used only as a uniform, deterministic hash (not for security). It
 * gives the same answer in every process and across restarts, unlike any
 * in-memory hash.
 */
export function shardFor(key: string): number {
  return createHash('md5').update(key).digest().readUInt32BE(0) % SHARD_COUNT;
}

export type AuditEntry = {
  action: AuditAction;
  actor?: { id: string; role?: string } | null;
  eventId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  /** Fallback shard key when there is neither an event nor an actor (e.g. failed login for an unknown email). */
  fallbackKey?: string;
};

/**
 * Writes one audit record into the shard chosen by:
 *   event_id when the action concerns an event, else actor_id, else fallbackKey.
 * Pass the transaction client to make the audit row commit/rollback
 * atomically with the change it describes.
 */
export async function writeAudit(entry: AuditEntry, db: Db = pool): Promise<void> {
  const shardKey = entry.eventId ?? entry.actor?.id ?? entry.fallbackKey ?? 'system';
  const shard = shardFor(shardKey);
  // `shard` is an integer 0..3, so it is safe to interpolate as a table name.
  await db.query(
    `INSERT INTO audit_logs_${shard}
       (action, actor_id, actor_role, event_id, target_type, target_id, shard_key, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.action,
      entry.actor?.id ?? null,
      entry.actor?.role ?? null,
      entry.eventId ?? null,
      entry.targetType ?? null,
      entry.targetId ?? null,
      shardKey,
      entry.details ? JSON.stringify(entry.details) : null,
    ]
  );
}

export type AuditRow = {
  id: string;
  created_at: Date;
  ts_us: string; // microseconds since epoch (exact; used for the cursor)
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  event_id: string | null;
  event_name: string | null;
  target_type: string | null;
  target_id: string | null;
  shard_key: string;
  details: Record<string, unknown> | null;
  shard: number;
};

export type AuditFilter = {
  eventId?: string;
  from?: string; // ISO date/datetime (inclusive)
  to?: string; // ISO date/datetime (exclusive)
  action?: string;
  cursor?: string;
  limit?: number;
};

export type AuditPage = {
  rows: AuditRow[];
  nextCursor: string | null;
  shardsQueried: number[];
};

const PAGE_SIZE = 50;

function encodeCursor(row: AuditRow) {
  return Buffer.from(`${row.ts_us}|${row.id}`).toString('base64url');
}
function decodeCursor(cursor: string): { tsUs: string; id: string } {
  const [tsUs, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!/^\d+$/.test(tsUs ?? '') || !/^[0-9a-f-]{36}$/.test(id ?? '')) {
    throw new ValidationError('Invalid cursor');
  }
  return { tsUs, id };
}

function parseDate(v: string | undefined, label: string): Date | undefined {
  if (!v) return undefined;
  const d = parseLocal(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid ${label} date`);
  // A bare "to" date means "through the end of that day".
  if (label === 'to' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return new Date(d.getTime() + 86_400_000);
  return d;
}

async function queryShard(shard: number, f: AuditFilter, limit: number): Promise<AuditRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.eventId) where.push(`a.event_id = ${p(f.eventId)}`);
  const from = parseDate(f.from, 'from');
  const to = parseDate(f.to, 'to');
  // created_at is the partition key, so these predicates also prune monthly partitions.
  if (from) where.push(`a.created_at >= ${p(from)}`);
  if (to) where.push(`a.created_at < ${p(to)}`);
  if (f.action) where.push(`a.action = ${p(f.action)}`);
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    where.push(
      `(a.created_at, a.id) < (TIMESTAMPTZ 'epoch' + ${p(c.tsUs)}::bigint * INTERVAL '1 microsecond', ${p(c.id)}::uuid)`
    );
  }
  const sql = `
    SELECT a.id, a.created_at,
           (extract(epoch FROM a.created_at) * 1000000)::bigint::text AS ts_us,
           a.action, a.actor_id, a.actor_role, u.name AS actor_name,
           a.event_id, e.name AS event_name, a.target_type, a.target_id,
           a.shard_key, a.details, ${shard}::int AS shard
    FROM audit_logs_${shard} a
    LEFT JOIN users u ON u.id = a.actor_id
    LEFT JOIN events e ON e.id = a.event_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limit}`;
  const { rows } = await pool.query<AuditRow>(sql, params);
  return rows;
}

function compareDesc(a: AuditRow, b: AuditRow): number {
  const ta = BigInt(a.ts_us);
  const tb = BigInt(b.ts_us);
  if (ta !== tb) return ta > tb ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

/**
 * Admin-only audit query.
 *  - Filtered by event: routes to the single shard that owns that event (shard pruning).
 *  - Unfiltered: scatter-gather across all 4 shards, each returning its newest
 *    PAGE_SIZE+1 rows after the cursor, merged and cut to PAGE_SIZE. The global
 *    top N is guaranteed to be inside the union of each shard's top N.
 * Keyset cursor = (created_at, id) of the last row, so pages are stable while
 * new rows keep arriving.
 */
export async function listAuditLogs(user: CurrentUser, filter: AuditFilter): Promise<AuditPage> {
  await requireRole(user, ['admin'], { action: 'listAuditLogs', eventId: filter.eventId });
  if (filter.eventId && !/^[0-9a-f-]{36}$/i.test(filter.eventId)) {
    throw new ValidationError('Invalid event id');
  }
  const limit = Math.min(filter.limit ?? PAGE_SIZE, 200);
  const shards = filter.eventId
    ? [shardFor(filter.eventId)]
    : Array.from({ length: SHARD_COUNT }, (_, i) => i);

  const perShard = await Promise.all(shards.map((s) => queryShard(s, filter, limit + 1)));
  const merged = perShard.flat().sort(compareDesc);
  const rows = merged.slice(0, limit);
  const nextCursor = merged.length > limit ? encodeCursor(rows[rows.length - 1]) : null;
  return { rows, nextCursor, shardsQueried: shards };
}
