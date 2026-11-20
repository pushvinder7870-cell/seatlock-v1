import 'server-only';
import { Pool, PoolClient } from 'pg';

const globalForPg = globalThis as unknown as {
  pool: Pool | undefined;
};

/**
 * DATABASE_SSL: unset/"disable" = no TLS (local, docker-compose, private networks);
 * "require" = TLS with certificate verification (most hosted Postgres);
 * "no-verify" = TLS without verification (providers with self-signed certs).
 */
function sslConfig() {
  const mode = process.env.DATABASE_SSL;
  if (!mode || mode === 'disable' || mode === 'false') return undefined;
  return { rejectUnauthorized: mode !== 'no-verify' };
}

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 30),
    ssl: sslConfig(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}

export type Db = Pick<PoolClient, 'query'>;

// Errors that are safe to retry from the top of the transaction.
// We run at READ COMMITTED with explicit row locks, so these are rare, but
// a deadlock between two lock orders (or a serialization failure if the
// isolation level is ever raised) must not surface as a 500.
const RETRYABLE = new Set(['40P01' /* deadlock_detected */, '40001' /* serialization_failure */]);
const MAX_ATTEMPTS = 3;

/**
 * Runs `fn` inside a single ACID transaction with a 2s lock timeout.
 * If a lock cannot be acquired in time Postgres raises 55P03, which the
 * HTTP layer maps to 503.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Mandatory 2-second database lock timeout
      await client.query("SET LOCAL lock_timeout = '2000ms'");
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const code = (err as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
