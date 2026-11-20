import 'server-only';
import { pool } from '../db';
import { RateLimitError } from '../errors';

/*
 * FIXED-WINDOW RATE LIMITER (stored in PostgreSQL)
 *
 * Time is cut into windows of `windowSec` seconds. Each (key, window) pair has
 * a counter. One atomic UPSERT increments it and returns the new value:
 *
 *   INSERT ... VALUES (key, window_start, 1)
 *   ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
 *
 * If the count exceeds the limit we answer 429 with Retry-After = seconds until
 * the window ends. Because the counter lives in Postgres (not process memory)
 * the limit holds across every server instance, including serverless/Vercel.
 * Cost: O(1) per request, one row per active key per window.
 */
const WINDOW_SQL = `to_timestamp(floor(extract(epoch FROM now()) / $2) * $2)`;

export async function hit(key: string, limit: number, windowSec: number, message = 'Too many requests. Please slow down.') {
  const { rows } = await pool.query<{ count: number; retry: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, ${WINDOW_SQL}, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count, ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now())))::int AS retry`,
    [key, windowSec]
  );
  // Occasionally purge old windows so the table stays tiny.
  if (Math.random() < 0.01) pool.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`).catch(() => {});
  if (rows[0].count > limit) throw new RateLimitError(message, Math.max(1, rows[0].retry));
}

/** Reads the current window's count without incrementing it. */
export async function peek(key: string, windowSec: number): Promise<{ count: number; retry: number }> {
  const { rows } = await pool.query<{ count: number; retry: number }>(
    `SELECT count, ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now())))::int AS retry
       FROM rate_limits WHERE key = $1 AND window_start = ${WINDOW_SQL}`,
    [key, windowSec]
  );
  return rows[0] ?? { count: 0, retry: 0 };
}

export const LIMITS = {
  loginFailuresPerEmail: { limit: 5, windowSec: 300 }, // lockout after 5 wrong passwords / 5 min
  loginPerIp: { limit: 300, windowSec: 300 }, // high enough for the 60-student load test
  postsPerUser: { limit: 5, windowSec: 600 },
  commentsPerUser: { limit: 20, windowSec: 300 },
  likesPerUser: { limit: 120, windowSec: 60 },
};
