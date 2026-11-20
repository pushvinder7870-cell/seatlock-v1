# SeatLock

A server-rendered seat-booking platform for the college fest headline show. It guarantees **exactly one winner per seat** under concurrent load, enforces role and ownership permissions on the server, and records an audit trail across four sharded tables.

**Stack:** Next.js 16 (App Router, server-rendered pages + route handlers) · TypeScript · PostgreSQL 16 (`pg`, no ORM) · Tailwind CSS 4 · shadcn/ui (Radix) · Recharts · Sonner toasts · light/dark themes.

**New in round 2:**
* a **community board**: posts, likes, threaded comments in a sheet, event tags, images, live updates and admin moderation;
* **event reviews** from verified attendees;
* **notifications**;
* a **sidebar + mobile bottom-bar** layout;
* **security hardening** (rate limits, login lockout, CSP, no-store).

**New to the codebase? Read [HOW_IT_WORKS.md](HOW_IT_WORKS.md)**: a 10-minute study guide with the algorithms and likely judge questions.

**UI highlights:** a theatre-style live seat map, ticket-style "My tickets", an admin dashboard (`/admin`) with KPI cards and charts (activity, per-event occupancy, audit rows per shard, top actions, recent security events), and an audit viewer that shows which shards each query touched. Every form is a plain HTML form that works without JavaScript. With JS, forms submit in the background and show toasts; a seat someone else just took is reported in a toast instead of an error page.

---

## 1. Quick start

### With Docker (one command)

```bash
docker compose up --build
```

Open **http://localhost:3000**. The `db` container loads `db/init.sql` (schema and seed data) on first start, and the `app` container starts once the DB is healthy.
To wipe and re-seed: `docker compose down -v && docker compose up --build`.

### Without Docker (easiest: a private local database)

Needs Node 22+ and PostgreSQL installed (only its binaries are used; no admin password needed).

```bash
npm ci
npm run localdb:setup     # creates ./.local/pgdata, starts it on localhost:5434,
                          # loads schema + seed data, writes DATABASE_URL/JWT_SECRET to .env.local
npm run dev               # open http://localhost:3000
```

After a reboot: `npm run localdb:start`, then `npm run dev`. Other commands: `localdb:stop`, `localdb:status`, `db:reset` (wipe and re-seed).

### Without Docker (an existing PostgreSQL server)

```bash
psql -U postgres -c "CREATE USER seatlock WITH PASSWORD 'seatlock_password' SUPERUSER;"
psql -U postgres -c "CREATE DATABASE seatlock OWNER seatlock;"
cp .env.example .env.local        # set DATABASE_URL and JWT_SECRET
npm ci && npm run db:init && npm run dev
```

### Seeded accounts (password `password123` for all)

| Email | Role | Notes |
| --- | --- | --- |
| `admin@seatlock.test` | admin | users and roles, all events, audit log |
| `organizer1@seatlock.test` | organizer | owns **Fest Headline Night**, the draft, and the Load Test Arena |
| `organizer2@seatlock.test` | organizer | owns **Stand-up Comedy Hour** and **Opening Ceremony** |
| `student01` … `student60@seatlock.test` | student | 01–03 for the demo, the rest for the load test |

Seeded events: Headline Night (120 seats, 2 blocked), Comedy Hour (60), a **draft** (hidden from students), Opening Ceremony (**already started**, so booking is closed), and Load Test Arena (10 seats).

---

## 2. Demo script (8 minutes)

1. **Book as a student.** Log in as `student01` and open *Fest Headline Night*. Select up to 4 seats and click **Hold**. The banner shows a 5-minute countdown. Click **Confirm booking** to land on *My bookings*, where you can **Cancel**.
2. **Show a 403 as a student.** While logged in as a student, open `/admin/audit` (or `/events/new`). The proxy returns **HTTP 403** and writes an `ACCESS_DENIED` audit row. For a service-level 403, log in as `organizer2` and open `/events/10000000-0000-0000-0000-000000000001/attendees`. That event belongs to organizer1, so the ownership check fails.
3. **Run the concurrency load test.** `npm run load-test` (add `-- --base http://localhost:3000` if needed). 60 students hit the same seat at once: one `201`, 59 `409`, and every DB invariant passes. See §7.
4. **Audit viewer querying one shard.** Log in as `admin`; you land on the **Dashboard** (charts update after the load test). Open **Audit log**. Unfiltered, all four shard badges are lit (scatter-gather). Pick an event: only **one** shard is lit (`shard pruning`). Filter by date or action, and page with **Older →** (keyset cursor).
5. *(Extras)* Optimistic locking: open **Edit event** in two tabs as `organizer1` and save both; the second save gets **409 VERSION_CONFLICT**. Seat blocking: organizer selects seats and clicks **Block**. Live refresh: hold a seat in one browser and watch it turn amber in another within about 4 s.

---

## 3. Architecture

```
Browser (HTML forms, tiny JS for live refresh/countdown)
   │
   ▼
src/proxy.ts ─────────── route middleware: Origin check (CSRF #1), auth, role rules → 403 + ACCESS_DENIED
   │
   ├── src/app/**/page.tsx     SSR pages (server components) ─┐
   └── src/app/api/**/route.ts route handlers (form or JSON) ─┤  call exactly one service; never SQL
                                                               ▼
src/lib/services/*.ts ──── service layer: (currentUser, …) → re-checks role AND ownership,
   booking.ts  holdSeats, confirmHold, releaseHold, cancelBooking,      runs the transaction,
               listMyBookings, listEventBookings, checkIn, expireStaleHolds   writes audit
   events.ts   listEvents, getSeatMap, createEvent, updateEvent, setSeatsBlocked
   audit.ts    writeAudit, listAuditLogs, shardFor
   users.ts    listUsers, updateUser          auth.ts  login, logout
   authz.ts    requireRole, deny (→ ACCESS_DENIED + 403)
   │
   ▼
src/lib/db.ts ──────────── pg Pool, withTransaction (BEGIN … SET LOCAL lock_timeout='2s' … COMMIT, retry on deadlock)
   │
   ▼
PostgreSQL: users, sessions, events, seats, holds, hold_seats, bookings, booking_seats, audit_logs_0..3
```

* **SSR only.** Every page renders on the server per request. The seat map is a plain HTML form of checkboxes, so booking works with JavaScript disabled. JS only adds the 4-seat selection limit, live refresh (polls `/api/events/:id/seats`), and the countdown. Cache Components is turned off on purpose (see `next.config.ts`). The data is per-user and per-request, and full server rendering lets `forbidden()` and `notFound()` return a real 403/404 status instead of a streamed 200.
* **One endpoint, two clients.** Route handlers accept form posts and JSON. For a form post, success returns `303` back to the page and an error returns an HTML page with the real status code (403/409/503…). For JSON, you get JSON plus the status code. See `src/lib/http.ts`.

---

## 4. Concurrency & locking strategy

### What happens in `holdSeats` (one ACID transaction, READ COMMITTED)

```sql
BEGIN;
SET LOCAL lock_timeout = '2000ms';                    -- wait at most 2 s for a row lock → 55P03 → HTTP 503
SELECT id FROM seats                                  -- 1. lock requested seats + seats of the hold being replaced
 WHERE event_id = $1 AND (seat_number = ANY($2) OR id = ANY($3))
 ORDER BY id FOR UPDATE;                              --    stable order ⇒ no deadlocks between overlapping requests
SELECT … FROM holds WHERE user_id=$u AND event_id=$e AND status='active' FOR UPDATE;   -- 2. my current hold
SELECT … blocked? booked? held by a live hold (expires_at > clock_timestamp())?         -- 3. availability, UNDER the lock
UPDATE holds SET status='expired' … ; UPDATE hold_seats SET active=false …              --    reclaim expired holds (+ HOLD_EXPIRED)
-- if anything unavailable → write SEAT_HOLD_REJECTED, COMMIT, return 409 with the list (all-or-nothing)
SELECT count(*) FROM booking_seats WHERE user_id=$u AND event_id=$e AND active;         -- 4. ≤ 4 seats per student
UPDATE holds SET status='replaced' …                                                    -- 5. one active hold per student
INSERT INTO holds (…, expires_at = clock_timestamp() + 5 min); INSERT INTO hold_seats …   -- 6. new hold
INSERT INTO audit_logs_N (SEAT_HOLD …);                                                  --    audit in the SAME transaction
COMMIT;
```

### Why pessimistic row locks

* **The contention is real.** At peak, many students target the same front-row seats. With optimistic concurrency (versions, or `SERIALIZABLE` without locks), most requests would do all their work and then fail at commit, so you need retry storms to make progress. With `SELECT … FOR UPDATE`, the second request simply **waits** a few milliseconds for the first to commit, then sees the seat is taken and returns a clean 409.
* **The seat row is the natural mutex.** It already exists for every seat, so there are no extra lock tables or advisory-lock key schemes. Locking only the requested seats means requests for different seats never block each other.
* **Stable order (`ORDER BY id`).** Two requests for overlapping sets, `{A1,A2}` and `{A2,A1}`, acquire locks in the same order, so they queue instead of deadlocking. The **global lock order** in every code path is **seats (by id) → hold row → booking row** (`holdSeats`, `confirmHold`, `releaseHold`, `cancelBooking`). The expiry sweeper only takes hold rows with `SKIP LOCKED`, so it never waits on a request.
* **Check after lock.** Availability and hold expiry are evaluated after the locks are held, with `clock_timestamp()` (not the transaction start time), so the check and the write are atomic.
* **Short critical section.** Only a handful of indexed statements run while locks are held. An unlocked **pre-check** rejects seats that are already clearly taken before entering the critical section, so during a stampede the losers don't queue on the hot row. The pre-check can only ever *reject*; granting a seat always happens after the locked re-check.
* **Lock timeout ≈ 2 s → HTTP 503.** A request never hangs. `55P03` maps to `503 LOCK_TIMEOUT`, and the attempt is audited as `SEAT_HOLD_REJECTED`.
* **Safety net in the schema.** Even if a code path forgot a lock, these partial unique indexes make a double-booking impossible (`23505` → 409):
  `hold_seats(seat_id) WHERE active` · `booking_seats(seat_id) WHERE active` · `holds(user_id, event_id) WHERE status='active'` · `bookings(hold_id) UNIQUE` (idempotent confirm).
* **Deadlock / serialization retries.** `withTransaction` retries `40P01`/`40001` up to 3 times with jitter, so raising the isolation level to `SERIALIZABLE` later needs no other code change.

### Hold expiry

Holds last 5 minutes (`expires_at`). Expiry is enforced in three places:
1. **Reads.** The seat map treats a hold with `expires_at <= now()` as available immediately.
2. **Writes under lock.** `holdSeats` reclaims expired holds on the seats it locked. `confirmHold` refuses an expired hold (409 `HOLD_EXPIRED`) and commits the expiry.
3. **Sweeper.** `src/instrumentation.ts` runs `expireStaleHolds()` every 15 s (`FOR UPDATE SKIP LOCKED`). It marks holds `expired`, frees their seats, and writes `HOLD_EXPIRED`.

### Optimistic locking for event edits

Event edits are low-contention and long-running (a human edits a form), so pessimistic locks would be wrong here. The edit form carries a hidden `version`:

```sql
UPDATE events SET …, version = version + 1 WHERE id = $1 AND version = $2 RETURNING version;
-- 0 rows ⇒ someone saved first ⇒ 409 VERSION_CONFLICT { expectedVersion, currentVersion }
```

The `EVENT_UPDATED` audit row (with a field-by-field diff) is written in the same transaction.

### Business rules → where they're enforced

| Rule | Enforcement |
| --- | --- |
| Hold 1–4 seats, all-or-nothing | `holdSeats`: one transaction; if any seat is unavailable nothing is written, and the 409 lists every unavailable seat and the reason (`held`/`booked`/`blocked`) |
| ≤ 4 booked seats per student per event | counted under lock in `holdSeats` and again in `confirmHold` → 422 `SEAT_LIMIT` |
| One active hold per student per event; a new hold replaces the old | `holdSeats` releases the previous hold (status `replaced`) in the same transaction; partial unique index as backstop |
| Confirm only your own unexpired hold | ownership → 403; expired → 409 `HOLD_EXPIRED`; idempotent re-confirm → 200 with the same booking |
| Organizers cannot block booked (or held) seats | `setSeatsBlocked` locks the seats and returns 409 `SEATS_NOT_BLOCKABLE` |
| Booking closes at event start | `isBookingOpen` and an in-transaction check → 409 `BOOKING_CLOSED`; cancellation also closes at start |

---

## 5. Security: RBAC, sessions, CSRF

**Two layers of authorization:**

1. **Route middleware** (`src/proxy.ts` + `src/lib/route-rules.ts`). It verifies the signed session token and applies role rules per path, e.g. `/admin/**` is admin-only; hold, confirm, cancel and `/my/**` are student-only; create, edit and block are organizer-only; attendees and check-in are organizer or admin. A violation gets **403** and an `ACCESS_DENIED` row.
2. **Service functions** (`src/lib/services/*`). Every service takes `currentUser` first and **re-checks the role and resource ownership** against the database. For example, an organizer can only touch events where `organizer_id = me`, and a student can only confirm or cancel their own holds and bookings. Denials go through `deny()`, which writes `ACCESS_DENIED` and throws `ForbiddenError` (→ 403 in APIs, `forbidden()` in pages).

Hiding buttons in the UI is purely cosmetic. Every endpoint enforces its rules even when called directly (the load test and the curl examples below do exactly that). Students get **404** for draft events, so they can't confirm that a draft exists.

| Capability | student | organizer | admin |
| --- | :-: | :-: | :-: |
| Browse published events / seat map | ✓ | own events only | ✓ (all) |
| Hold / confirm / release / cancel own | ✓ | | |
| Create / edit own events (optimistic lock), block seats | | ✓ | |
| Attendee list + check-in | | own events | ✓ |
| Audit log, users & roles | | | ✓ |

**Sessions.** On login a row is inserted into `sessions`, and the browser receives an HS256-signed token (`{sid, sub, role, exp}`) in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production). The proxy verifies the signature without touching the DB. Every page and API call then re-loads the session row and the user's *current* role and active flag, so logout, role changes (which revoke all of that user's sessions) and deactivation take effect immediately. Passwords are bcrypt (`pgcrypto crypt()`); unknown emails still pay one bcrypt so response time doesn't reveal which accounts exist.

**CSRF.** Layer 1: the proxy rejects state-changing requests whose `Origin` doesn't match the host. Layer 2: every mutating request must carry a session-bound token (`HMAC(secret, "csrf:" + sessionId)`), either as a hidden `_csrf` form field or an `X-CSRF-Token` header. Failures are 403 and audited. Redirect targets are restricted to same-site relative paths, and flash messages are codes, not free text.

---

## 6. Audit sharding

* **Tables:** `audit_logs_0` … `audit_logs_3`, each **range-partitioned by month** on `created_at` (partitions from last month to 24 months ahead, plus a `DEFAULT` partition).
* **IDs:** `UUID` (`gen_random_uuid()`), globally unique across shards. The primary key is `(created_at, id)`, as required for partitioning.
* **Routing:** `shard = first 32 bits of md5(key) mod 4` (`shardFor` in `src/lib/services/audit.ts`). `key = event_id` for anything about an event, otherwise `actor_id` (login, logout, role changes), otherwise the attempted email for failed logins of unknown users. md5 is used as a stable, uniform hash (the same in every process and after restarts), not for security. The key is stored in `shard_key` so routing is explainable row by row.
* **Transactional writes:** `writeAudit(entry, tx)` takes the transaction client, so `SEAT_HOLD`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `CHECKIN`, `EVENT_UPDATED`, `HOLD_EXPIRED` and seat-blocking rows commit or roll back atomically with the change they describe. Rejections and denials, which have no change to attach to, are written on their own connection *outside* any transaction, so they are never rolled back.
* **Reads (`listAuditLogs`, admin only):**
  * **Event filter → one shard.** Only `audit_logs_{shardFor(eventId)}` is queried (shard pruning). Date filters also prune monthly partitions.
  * **No event filter → scatter-gather.** All four shards are queried in parallel, each returning its newest 51 rows after the cursor. The results are merge-sorted by `(created_at DESC, id DESC)` and cut to 50. This is correct because the global top 50 must be inside the union of each shard's top 50.
  * **Cursor pagination.** The keyset cursor is `(created_at in µs, id)` of the last row, so pages stay stable while new rows arrive.
* **Actions logged:** `LOGIN`, `LOGIN_FAILED`, `SEAT_HOLD`, `SEAT_HOLD_REJECTED`, `HOLD_EXPIRED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `EVENT_UPDATED`, `CHECKIN`, `ACCESS_DENIED`, plus `LOGOUT`, `HOLD_RELEASED`, `EVENT_CREATED`, `SEATS_BLOCKED`/`SEATS_UNBLOCKED` and `ROLE_CHANGED`. **Every 403** (proxy role rule, cross-origin, CSRF, or service role/ownership check) writes `ACCESS_DENIED`.

---

## 7. Load test

```bash
npm run load-test                                   # defaults: http://localhost:3000, 50 students, Load Test Arena
node scripts/load-test.mjs --base http://localhost:3000 --students 60
```

The script logs in N seeded students, resets the Load Test Arena (when `DATABASE_URL` or `.env.local` is available), then runs three scenarios:

1. **Stampede.** All N students hold the *same* seat at the same instant. Expect exactly **one 201** and the rest 409 (or 503 on lock timeout), with each 409 naming the seat.
2. **Overlap.** Each student requests a random set of 1–4 seats from a 10-seat pool. Winners' seats must be disjoint and complete (all-or-nothing), and losers hold nothing.
3. **Double-click.** Every winner confirms its hold twice, concurrently. Expect exactly one booking per hold; the second confirm is idempotent (200).

After each scenario it checks the invariants **directly in PostgreSQL**: no seat in two active holds or bookings, no seat both held and booked, at most one active hold per student, and at most 4 seats per student. It exits non-zero on any violation. Sample run (60 students):

```
1. Stampede: 60 students hold seat A1 at the same instant
  201×1  409×59   latency p50 637ms  p95 814ms
  PASS  exactly one hold succeeded  …
2. Overlap: 60 students each request a random 1–4 seat set from 10 seats
  201×5  409×55
  PASS  winning holds are disjoint (no seat granted twice) …
3. Double-click: each of 5 winners confirms its hold twice concurrently
  200×5  201×5
  PASS  exactly one booking per hold …
All checks passed: exactly one winner per seat.
```

---

## 8. HTTP API

All endpoints accept JSON (`Content-Type: application/json` + `X-CSRF-Token`) or form posts (`_csrf` field). Errors are `{ "error": CODE, "message": "…", …details }`.

| Method & path | Role | Success | Notable errors |
| --- | --- | --- | --- |
| `POST /api/auth/login` `{email,password}` | public | 200 `{user, csrfToken}` + cookie | 401 |
| `POST /api/auth/logout` | any | 200 | |
| `GET /api/events` | any | role-filtered list | |
| `POST /api/events` | organizer | 201 `{id}` | 400 |
| `GET /api/events/:id` · `GET /api/events/:id/seats` | any (visibility rules) | seat map | 403 (other organizer's event), 404 (draft for students) |
| `POST /api/events/:id` `{…, version}` | organizer (owner) | 200 `{version}` | **409 VERSION_CONFLICT** |
| `POST /api/events/:id/hold` `{seats:["A1","A2"]}` | student | **201** `{holdId, expiresAt, seats}` | **409 SEATS_UNAVAILABLE** `{unavailableSeats}`, 409 BOOKING_CLOSED, 422 SEAT_LIMIT, **503 LOCK_TIMEOUT** |
| `POST /api/holds/:id/confirm` | student (owner) | 201 `{bookingId}` (200 if already confirmed) | 403, 409 HOLD_EXPIRED / HOLD_NOT_ACTIVE |
| `POST /api/holds/:id/release` | student (owner) | 200 | 403 |
| `POST /api/bookings/:id/cancel` | student (owner) | 200 | 403, 409 EVENT_STARTED |
| `GET /api/my/bookings` | student | list | |
| `GET /api/events/:id/attendees` | organizer (owner), admin | list | 403 |
| `POST /api/bookings/:id/checkin` | organizer (owner), admin | 200 | 403, 409 ALREADY_CHECKED_IN |
| `POST /api/events/:id/block` `{seats, op:"block"\|"unblock"}` | organizer (owner) | 200 | 409 SEATS_NOT_BLOCKABLE |
| `GET /api/admin/audit?eventId&from&to&action&cursor` | admin | `{rows, nextCursor, shardsQueried}` | 403 |
| `POST /api/admin/users/:id` `{role, isActive}` | admin | 200 | 403, 422 SELF_LOCKOUT |

```bash
# Example: hold two seats with curl
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"student01@seatlock.test","password":"password123"}' http://localhost:3000/api/auth/login
#   → {"user":{…},"csrfToken":"<TOKEN>"}
curl -b jar -H 'content-type: application/json' -H 'x-csrf-token: <TOKEN>' \
  -d '{"seats":["A1","A2"]}' http://localhost:3000/api/events/10000000-0000-0000-0000-000000000001/hold
```

---

## 9. Deployment: GitHub → Supabase → Vercel (step by step)

### Step 1: Push to GitHub
1. On github.com click **New repository**, name it `seatlock`, choose **Public**, and leave every "Add README/.gitignore/license" box **unticked**.
2. In the project folder:
   ```bash
   git remote add origin https://github.com/<you>/seatlock.git
   git push -u origin main
   ```
   A browser window asks you to sign in to GitHub the first time.
3. Open the repo's **Actions** tab. CI builds the app and runs the 60-student load test against a real Postgres 16.

### Step 2: Create the database on Supabase
1. supabase.com → **New project** (choose a region close to your users and note the DB password).
2. **Project Settings → Database → Connection string → URI.** Copy the **Transaction pooler** string (port **6543**), which is the right choice for serverless. Paste your password into it and **remove any `?sslmode=...` suffix**.
3. Load the schema and seed data from your computer (one time):
   ```bash
   # PowerShell
   $env:DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres"; $env:DATABASE_SSL="no-verify"; npm run db:init
   # bash
   DATABASE_URL="postgresql://..." DATABASE_SSL=no-verify npm run db:init
   ```
   Later schema changes: `npm run db:migrate` (idempotent).
4. *(Optional, for image posts)* **Storage → New bucket** named `post-images`, set to **Public**. Then **Project Settings → API** and copy the Project URL and the **service_role** key.

### Step 3: Deploy on Vercel
1. vercel.com → **Add New → Project** → import the `seatlock` GitHub repo (framework auto-detected as Next.js; keep the defaults).
2. **Environment Variables** (Production + Preview):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase transaction-pooler URI from step 2 |
   | `DATABASE_SSL` | `no-verify` |
   | `JWT_SECRET` | 64 random hex chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `DB_POOL_MAX` | `5` (serverless functions should hold few connections) |
   | `APP_TIME_ZONE` | `Asia/Kolkata` |
   | `SUPABASE_URL` | *(optional)* `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(optional)* service_role key. **Never** prefix it with `NEXT_PUBLIC_`. |
   | `ANTHROPIC_API_KEY` | *(optional, enables AI)* key from console.anthropic.com. Server-side only. |

   Images work without Supabase Storage: uploads are then stored in PostgreSQL and served from `/api/images/<id>`. Add the two `SUPABASE_*` variables only if you prefer Supabase Storage, and create a **public** bucket named `post-images` first.

3. Click **Deploy**. When it's live, open `https://<app>.vercel.app/api/health`. It should return `{"ok":true,"db":"up"}`.
4. Prove it works on the internet: `node scripts/load-test.mjs --base https://<app>.vercel.app --students 40` (set `DATABASE_URL`/`DATABASE_SSL` in the same shell to also get the DB invariant checks).
5. Every `git push` to `main` redeploys automatically; pull requests get preview URLs.

**Serverless notes.** Hold expiry doesn't depend on a background job: expired holds are treated as free on read and reclaimed under lock on the next hold. The in-process sweeper only tidies up when an instance is warm. The rate limiter lives in Postgres, so limits hold across all function instances. Secure cookies and HSTS are on automatically over HTTPS.

### Other hosts
* **Docker:** `docker compose up --build` (app + Postgres), or `docker build .` anywhere. On start the image runs `db-init --if-empty` (schema + migrations), then `next start` on `$PORT`. It runs as non-root and is health-checked via `/api/health`.
* **Render:** **New → Blueprint** → pick the repo (`render.yaml` provisions Postgres and the web service).
* **Neon** instead of Supabase: use its pooled URL as-is and leave `DATABASE_SSL` unset.

### Environment variables

| Env var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✓ | PostgreSQL 16+ connection string |
| `JWT_SECRET` | ✓ | long random string (signs session + CSRF tokens) |
| `DATABASE_SSL` | | `require` (verified TLS) or `no-verify` (Supabase); unset locally |
| `DB_POOL_MAX` | | default 30; use 5 on Vercel |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | | store uploaded images in Supabase Storage (bucket default `post-images`); without them images are stored in PostgreSQL |
| `ANTHROPIC_API_KEY` | | enables the AI features (Ask SeatLock assistant, review summaries, "Write with AI") using Claude Opus 5.5 |
| `COOKIE_SECURE` | | defaults to `true` in production; `false` only for plain-HTTP demos |
| `APP_TIME_ZONE` | | default `Asia/Kolkata` |

**GitHub Actions** (`.github/workflows/ci.yml`): typecheck, lint and build, then boot against Postgres 16 and run the load test. A double booking fails the build.

---

## 10. Data model

`db/init.sql` extends the starter schema while keeping its table names:

* `users` + `role`, `password_hash` (bcrypt), `is_active`; new `sessions` table.
* `events` + `organizer_id`, `status` (`draft`/`published`/`cancelled`), `version` (optimistic locking), `updated_at`. All times are `TIMESTAMPTZ`.
* `seats` + `row_label`, `seat_index`, `is_blocked`. The seat row is the lock target.
* `holds` (`active`/`confirmed`/`expired`/`replaced`/`released`, `expires_at`) and a new `hold_seats` table.
* `bookings` + `hold_id` (unique), `cancelled_at`, `checked_in_at`/`checked_in_by`. `booking_seats` + `event_id`, `user_id`, `active`.
* `audit_logs_0..3`: UUID ids, actor/event/target columns, `shard_key`, `details JSONB`, monthly partitions.
* `db/migrations/` (idempotent, applied by `npm run db:migrate` and automatically on deploy):
  * `posts` (soft delete, pinning, optional event tag and image), `post_comments` (one level of replies via `parent_id`), `post_likes`, `comment_likes`.
  * `reviews`: 1–5 stars, `UNIQUE(event_id, author_id)`, verified-booking check in the service.
  * `notifications` (recipient, actor, type, link, `read_at`).
  * `rate_limits` (fixed-window counters).

---

## 11. Bonus features

* ✅ **Live seat-map refresh.** The seat map polls every 4 s, drops selections someone else took, and refreshes the hold banner.
* ✅ **Organizer seat blocking** with lock-protected checks.
* ✅ **Idempotent confirm and cancel.** Re-confirming returns the same booking (`bookings.hold_id UNIQUE`); re-cancelling is a no-op.
* ✅ **Deadlock / serialization retries** in `withTransaction`.
* ✅ **Monthly partitions within each audit shard.**
* ✅ **Community board.**
  * Posts tagged to events, with likes, comments and replies.
  * Comments open in a slide-over sheet; the feed refreshes live.
  * Ranking is Hot (Hacker-News gravity) or Latest.
  * Admins can pin and moderate, and still see removed content.
* ✅ **Reviews.** 1–5 stars from verified ticket holders only, with per-event averages and star distribution.
* ✅ **Notifications** (bell) for:
  * likes, comments and replies;
  * booking confirmed, checked in, event changed;
  * new reviews and moderation.
* ✅ **Security extras:**
  * rate limits (Postgres fixed window) and login lockout after 5 failures;
  * CSP, HSTS, X-Frame-Options and nosniff headers;
  * `no-store` on authenticated pages and back/forward-cache protection after logout;
  * magic-byte validated image uploads.
* ✅ **Responsive shell.** Collapsible sidebar on desktop; floating bottom tab bar and drawer on phones.
* Not done: waitlist. Clerk sign-up is planned; today's auth uses seeded accounts.

**Next steps for production:** moving the sweeper to a dedicated worker when running multiple app instances (it is already safe to run concurrently thanks to `SKIP LOCKED`); a scheduled job that pre-creates future audit partitions; and moving the shards to separate databases. Only the connection lookup in `writeAudit` and `queryShard` would change.

---

## 12. Who built what (suggested split)

| Member | Area | Main files |
| --- | --- | --- |
| A | Routes, login, sessions, SSR pages, RBAC, CSRF | `src/proxy.ts`, `src/lib/{route-rules,token,session,http}.ts`, `src/app/**` |
| B | Booking service, row locking, hold/confirm/cancel, optimistic locking | `src/lib/services/{booking,events}.ts`, `src/lib/db.ts`, `db/init.sql` |
| C | Audit sharding, audit viewer, audit integration, load testing | `src/lib/services/audit.ts`, `src/app/admin/audit`, `scripts/load-test.mjs` |
