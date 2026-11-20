import { pool } from '@/lib/db';

/** Public liveness/readiness probe for hosting platforms and docker healthchecks. */
export async function GET() {
  try {
    await pool.query('SELECT 1');
    return Response.json({ ok: true, db: 'up' });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
