#!/usr/bin/env node
/**
 * SeatLock concurrency load test.
 *
 *   node scripts/load-test.mjs [--base http://localhost:3000] [--students 50] [--event <uuid>] [--no-reset]
 *
 * Logs in N seeded students (student01..), then fires simultaneous requests:
 *   1. Stampede:     every student tries to hold the SAME seat at once -> exactly one 201.
 *   2. Overlap:      every student requests a random 1-4 seat set from a small pool
 *                    -> winners' seats are disjoint, losers get 409 listing the conflicts.
 *   3. Double-click: every winner confirms its hold twice concurrently -> one booking per hold.
 * Then checks invariants directly in PostgreSQL (if DATABASE_URL / .env.local is available):
 *   - no seat is in two active holds, no seat is in two active bookings,
 *   - no student has two active holds for the event,
 *   - every hold is all-or-nothing.
 * Exits non-zero if any invariant is violated.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);
const BASE = args.base ?? process.env.BASE_URL ?? 'http://localhost:3000';
const STUDENTS = Number(args.students ?? 50);
const EVENT = args.event ?? '10000000-0000-0000-0000-000000000005'; // "Load Test Arena" (10 seats)
const PASSWORD = 'password123';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    return env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? c.g('PASS') : c.r('FAIL')}  ${label}${detail ? c.d(`  ${detail}`) : ''}`);
};

async function login(i) {
  const email = `student${String(i).padStart(2, '0')}@seatlock.test`;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((h) => h.split(';')[0]).join('; ');
  const { csrfToken, user } = await res.json();
  return { email, cookie, csrfToken, id: user.id };
}

async function call(s, method, path, body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: s.cookie, 'x-csrf-token': s.csrfToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: performance.now() - t0, s };
}

function summarize(results) {
  const by = {};
  for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))].toFixed(0);
  return `${Object.entries(by).map(([k, v]) => `${k}×${v}`).join('  ')}   latency p50 ${pct(50)}ms  p95 ${pct(95)}ms  max ${pct(100)}ms`;
}

async function resetEvent(db) {
  await db.query(`DELETE FROM booking_seats WHERE event_id = $1`, [EVENT]);
  await db.query(`DELETE FROM bookings WHERE event_id = $1`, [EVENT]);
  await db.query(`DELETE FROM hold_seats WHERE event_id = $1`, [EVENT]);
  await db.query(`DELETE FROM holds WHERE event_id = $1`, [EVENT]);
  await db.query(`UPDATE seats SET is_blocked = FALSE WHERE event_id = $1`, [EVENT]);
}

async function invariants(db, label) {
  const q = async (sql) => (await db.query(sql, [EVENT])).rows;
  const dupHolds = await q(`SELECT seat_id, count(*) FROM hold_seats WHERE event_id = $1 AND active GROUP BY 1 HAVING count(*) > 1`);
  const dupBookings = await q(`SELECT seat_id, count(*) FROM booking_seats WHERE event_id = $1 AND active GROUP BY 1 HAVING count(*) > 1`);
  const heldAndBooked = await q(`SELECT hs.seat_id FROM hold_seats hs JOIN booking_seats bs ON bs.seat_id = hs.seat_id AND bs.active
                                  JOIN holds h ON h.id = hs.hold_id WHERE hs.event_id = $1 AND hs.active AND h.status = 'active'`);
  const multiHold = await q(`SELECT user_id FROM holds WHERE event_id = $1 AND status = 'active' GROUP BY 1 HAVING count(*) > 1`);
  const overLimit = await q(`SELECT user_id, count(*) FROM booking_seats WHERE event_id = $1 AND active GROUP BY 1 HAVING count(*) > 4`);
  check(dupHolds.length === 0, `${label}: no seat in two active holds`);
  check(dupBookings.length === 0, `${label}: no seat in two active bookings`);
  check(heldAndBooked.length === 0, `${label}: no seat both held and booked`);
  check(multiHold.length === 0, `${label}: at most one active hold per student`);
  check(overLimit.length === 0, `${label}: no student owns more than 4 seats`);
}

async function main() {
  console.log(c.b(`SeatLock load test → ${BASE}  (event ${EVENT}, ${STUDENTS} students)`));
  const url = databaseUrl();
  const sslMode = process.env.DATABASE_SSL;
  const ssl = !sslMode || sslMode === 'disable' || sslMode === 'false' ? undefined : { rejectUnauthorized: sslMode !== 'no-verify' };
  const db = url ? new pg.Pool({ connectionString: url, max: 2, ssl }) : null;
  if (!db) console.log(c.d('  (no DATABASE_URL: skipping reset and DB invariant checks)'));
  if (db && !args['no-reset']) {
    await resetEvent(db);
    console.log(c.d('  reset holds/bookings for the load-test event'));
  }

  const sessions = [];
  for (let i = 1; i <= STUDENTS; i += 10) {
    const batch = [];
    for (let j = i; j < i + 10 && j <= STUDENTS; j++) batch.push(login(j));
    sessions.push(...(await Promise.all(batch)));
  }
  console.log(c.d(`  logged in ${sessions.length} students`));

  const seatsRes = await call(sessions[0], 'GET', `/api/events/${EVENT}/seats`);
  const pool = seatsRes.json.seats.map((s) => s.number);
  const target = pool[0];

  // ---------------------------------------------------------------- 1. Stampede
  console.log(c.b(`\n1. Stampede: ${sessions.length} students hold seat ${target} at the same instant`));
  const r1 = await Promise.all(sessions.map((s) => call(s, 'POST', `/api/events/${EVENT}/hold`, { seats: [target] })));
  console.log(`  ${summarize(r1)}`);
  const winners1 = r1.filter((r) => r.status === 201);
  check(winners1.length === 1, 'exactly one hold succeeded', `${winners1.length} winner(s)`);
  check(r1.every((r) => [201, 409, 503].includes(r.status)), 'every other request got 409 (or 503 lock timeout)');
  check(
    r1.filter((r) => r.status === 409).every((r) => r.json.unavailableSeats?.some((u) => u.seat === target)),
    '409 responses identify the unavailable seat'
  );
  if (db) await invariants(db, 'after stampede');

  // ---------------------------------------------------------------- 2. Overlap
  if (db) await resetEvent(db);
  else await Promise.all(winners1.map((w) => call(w.s, 'POST', `/api/holds/${w.json.holdId}/release`)));
  console.log(c.b(`\n2. Overlap: ${sessions.length} students each request a random 1–4 seat set from ${pool.length} seats`));
  const requests = sessions.map((s) => {
    const n = 1 + Math.floor(Math.random() * 4);
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
    return { s, picks };
  });
  const r2 = await Promise.all(requests.map(({ s, picks }) => call(s, 'POST', `/api/events/${EVENT}/hold`, { seats: picks }).then((r) => ({ ...r, picks }))));
  console.log(`  ${summarize(r2)}`);
  const winners2 = r2.filter((r) => r.status === 201);
  const claimed = winners2.flatMap((w) => w.json.seats);
  check(new Set(claimed).size === claimed.length, 'winning holds are disjoint (no seat granted twice)', `${winners2.length} winners, ${claimed.length} seats`);
  check(winners2.every((w) => w.json.seats.length === w.picks.length), 'winners got ALL requested seats (all-or-nothing)');
  check(r2.filter((r) => r.status === 409).every((r) => r.json.unavailableSeats?.length > 0), 'losers were told which seats were unavailable');
  if (db) {
    const losers = r2.filter((r) => r.status !== 201).map((r) => r.s.id);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM holds WHERE event_id = $1 AND status = 'active' AND user_id = ANY($2::uuid[])`,
      [EVENT, losers]
    );
    check(rows[0].n === 0, 'rejected students hold nothing (no partial holds)');
    await invariants(db, 'after overlap');
  }

  // ---------------------------------------------------------------- 3. Double-click confirm
  console.log(c.b(`\n3. Double-click: each of ${winners2.length} winners confirms its hold twice concurrently`));
  const r3 = await Promise.all(
    winners2.flatMap((w) => [0, 1].map(() => call(w.s, 'POST', `/api/holds/${w.json.holdId}/confirm`)))
  );
  console.log(`  ${summarize(r3)}`);
  const bookingIdsPerHold = new Map();
  for (const r of r3.filter((r) => r.status < 300)) {
    const k = r.json.bookingId;
    bookingIdsPerHold.set(r.s.id, new Set([...(bookingIdsPerHold.get(r.s.id) ?? []), k]));
  }
  check(r3.every((r) => r.status === 200 || r.status === 201), 'all confirms succeeded (second one is idempotent)');
  check([...bookingIdsPerHold.values()].every((s) => s.size === 1), 'exactly one booking per hold');
  if (db) {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM bookings WHERE event_id = $1 AND status = 'confirmed'`, [EVENT]);
    check(rows[0].n === winners2.length, 'bookings table has one row per winning hold', `${rows[0].n} bookings`);
    await invariants(db, 'after confirm');
    await db.end();
  }

  console.log(failures ? c.r(`\n${failures} check(s) FAILED`) : c.g('\nAll checks passed: exactly one winner per seat.'));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(c.r(e.stack ?? String(e)));
  process.exit(2);
});
