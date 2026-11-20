#!/usr/bin/env node
/**
 * Applies db/init.sql (schema + seed) to DATABASE_URL (env or .env.local).
 *
 *   npm run db:init                       # fails if tables already exist
 *   npm run db:reset                      # DROPS the public schema first (destroys all data)
 *   node scripts/db-init.mjs --if-empty   # only initialise a fresh database (used on deploy)
 *
 * DATABASE_SSL=require|no-verify enables TLS for hosted databases.
 */
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const url =
  process.env.DATABASE_URL ??
  (() => {
    try {
      return readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
    } catch {
      return undefined;
    }
  })();
if (!url) {
  console.error('DATABASE_URL is not set (env or .env.local).');
  process.exit(1);
}

const sslMode = process.env.DATABASE_SSL;
const ssl = !sslMode || sslMode === 'disable' || sslMode === 'false' ? undefined : { rejectUnauthorized: sslMode !== 'no-verify' };
const client = new pg.Client({ connectionString: url, ssl });

try {
  await client.connect();
} catch (e) {
  console.error(`Cannot connect to the database: ${e.message}`);
  if (e.code === '28P01') console.error('Wrong user/password in DATABASE_URL. For a private local database run: npm run localdb:setup');
  if (e.code === 'ECONNREFUSED') console.error('Nothing is listening there. Is PostgreSQL running? (npm run localdb:start)');
  process.exit(1);
}

/** Applies every db/migrations/*.sql in name order. Each file is idempotent (IF NOT EXISTS / ON CONFLICT). */
async function migrate() {
  const dir = new URL('../db/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    await client.query(readFileSync(new URL(f, dir), 'utf8'));
    console.log(`Applied migration ${f}`);
  }
}

try {
  const migrateOnly = process.argv.includes('--migrate');
  const { rows: existing } = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);
  if (migrateOnly || (process.argv.includes('--if-empty') && existing[0].exists)) {
    if (!existing[0].exists) throw new Error('Base schema missing. Run npm run db:init first.');
    console.log('Base schema present; applying migrations only.');
    await migrate();
    process.exit(0);
  }
  if (process.argv.includes('--reset')) {
    console.log('Dropping and recreating schema "public"...');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await client.query(readFileSync(new URL('../db/init.sql', import.meta.url), 'utf8'));
  await migrate();
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM seats) AS seats`
  );
  console.log(`Database ready: ${rows[0].users} users, ${rows[0].events} events, ${rows[0].seats} seats.`);
} catch (e) {
  console.error(`Failed: ${e.message}`);
  if (/already exists/.test(e.message)) console.error('Tables already exist. Re-run with --reset to wipe and re-seed.');
  process.exitCode = 1;
} finally {
  await client.end();
}
