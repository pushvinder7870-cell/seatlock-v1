-- =====================================================================
-- SeatLock schema + seed data (PostgreSQL 16+)
--
-- Loaded automatically by `docker compose up` (docker-entrypoint-initdb.d)
-- or manually with `npm run db:init` (see README).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- crypt()/gen_salt() for bcrypt password hashes

-- ---------------------------------------------------------------------
-- Users & sessions
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'organizer', 'student')),
    password_hash TEXT         NOT NULL,             -- bcrypt via pgcrypto crypt()
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Server-side sessions. The browser holds an HMAC-signed token in an
-- HttpOnly cookie that references a row here, so sessions can be revoked
-- (logout, role change, deactivation).
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------
-- Events & seats
-- ---------------------------------------------------------------------
CREATE TABLE events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID         NOT NULL REFERENCES users(id),
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    venue        VARCHAR(255),
    event_date   TIMESTAMPTZ  NOT NULL,              -- start time; booking closes here
    status       VARCHAR(20)  NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'cancelled')),
    total_seats  INTEGER      NOT NULL DEFAULT 0,
    version      INTEGER      NOT NULL DEFAULT 1,    -- optimistic locking for edits
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX events_organizer_idx ON events (organizer_id);

-- A seat row is the unit of pessimistic locking (SELECT ... FOR UPDATE).
-- Held / booked state lives in hold_seats / booking_seats; the only state
-- stored here is the organizer-controlled "blocked" flag.
CREATE TABLE seats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES events(id),
    seat_number VARCHAR(50) NOT NULL,                -- e.g. 'A7'
    row_label   VARCHAR(10) NOT NULL,
    seat_index  INTEGER     NOT NULL,                -- position within the row
    is_blocked  BOOLEAN     NOT NULL DEFAULT FALSE,
    UNIQUE (event_id, seat_number)
);

-- ---------------------------------------------------------------------
-- Holds (5-minute reservations) & bookings
-- ---------------------------------------------------------------------
CREATE TABLE holds (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id),
    event_id   UUID        NOT NULL REFERENCES events(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status     VARCHAR(30) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'confirmed', 'expired', 'replaced', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Safety net: at most one active hold per student per event.
CREATE UNIQUE INDEX holds_one_active_per_user_event
    ON holds (user_id, event_id) WHERE status = 'active';
CREATE INDEX holds_active_expiry_idx ON holds (expires_at) WHERE status = 'active';

CREATE TABLE hold_seats (
    hold_id  UUID    NOT NULL REFERENCES holds(id),
    seat_id  UUID    NOT NULL REFERENCES seats(id),
    event_id UUID    NOT NULL REFERENCES events(id),
    active   BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (hold_id, seat_id)
);
-- Safety net: a seat can be in at most one active hold.
CREATE UNIQUE INDEX hold_seats_one_active_per_seat
    ON hold_seats (seat_id) WHERE active;
CREATE INDEX hold_seats_event_idx ON hold_seats (event_id) WHERE active;

CREATE TABLE bookings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id),
    event_id      UUID        NOT NULL REFERENCES events(id),
    hold_id       UUID        UNIQUE REFERENCES holds(id),   -- one booking per hold => idempotent confirm
    status        VARCHAR(30) NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at  TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID REFERENCES users(id)
);
CREATE INDEX bookings_user_idx  ON bookings (user_id);
CREATE INDEX bookings_event_idx ON bookings (event_id);

CREATE TABLE booking_seats (
    booking_id UUID    NOT NULL REFERENCES bookings(id),
    seat_id    UUID    NOT NULL REFERENCES seats(id),
    event_id   UUID    NOT NULL REFERENCES events(id),
    user_id    UUID    NOT NULL REFERENCES users(id),
    active     BOOLEAN NOT NULL DEFAULT TRUE,                 -- false once cancelled
    PRIMARY KEY (booking_id, seat_id)
);
-- Safety net: a seat can belong to at most one live booking.
CREATE UNIQUE INDEX booking_seats_one_active_per_seat
    ON booking_seats (seat_id) WHERE active;
CREATE INDEX booking_seats_user_event_idx ON booking_seats (user_id, event_id) WHERE active;

-- ---------------------------------------------------------------------
-- Audit logs: 4 shards, routed by hash(event_id) mod 4 (or actor_id for
-- non-event actions). Each shard is range-partitioned by month.
-- IDs are UUIDs so they are globally unique across shards.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs_0 (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    action      TEXT        NOT NULL,
    actor_id    UUID,
    actor_role  TEXT,
    event_id    UUID,
    target_type TEXT,
    target_id   TEXT,
    shard_key   TEXT        NOT NULL,                -- value that was hashed to pick the shard
    details     JSONB,
    PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_1 (LIKE audit_logs_0 INCLUDING ALL) PARTITION BY RANGE (created_at);
CREATE TABLE audit_logs_2 (LIKE audit_logs_0 INCLUDING ALL) PARTITION BY RANGE (created_at);
CREATE TABLE audit_logs_3 (LIKE audit_logs_0 INCLUDING ALL) PARTITION BY RANGE (created_at);

DO $$
DECLARE
    shard INT;
    m     DATE;
BEGIN
    FOR shard IN 0..3 LOOP
        EXECUTE format('CREATE INDEX audit_logs_%s_event_idx  ON audit_logs_%s (event_id, created_at DESC, id DESC)', shard, shard);
        EXECUTE format('CREATE INDEX audit_logs_%s_recent_idx ON audit_logs_%s (created_at DESC, id DESC)', shard, shard);
        -- monthly partitions: previous month through 24 months ahead
        m := date_trunc('month', now())::date - INTERVAL '1 month';
        FOR i IN 0..25 LOOP
            EXECUTE format(
                'CREATE TABLE audit_logs_%s_%s PARTITION OF audit_logs_%s FOR VALUES FROM (%L) TO (%L)',
                shard, to_char(m, 'YYYYMM'), shard, m, (m + INTERVAL '1 month')::date);
            m := (m + INTERVAL '1 month')::date;
        END LOOP;
        EXECUTE format('CREATE TABLE audit_logs_%s_default PARTITION OF audit_logs_%s DEFAULT', shard, shard);
    END LOOP;
END $$;

-- =====================================================================
-- Seed data. Every seeded account uses the password: password123
-- =====================================================================
INSERT INTO users (id, name, email, role, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ada Admin',      'admin@seatlock.test',      'admin',     crypt('password123', gen_salt('bf', 8))),
  ('00000000-0000-0000-0000-000000000011', 'Olivia Organizer','organizer1@seatlock.test', 'organizer', crypt('password123', gen_salt('bf', 8))),
  ('00000000-0000-0000-0000-000000000012', 'Omar Organizer',  'organizer2@seatlock.test', 'organizer', crypt('password123', gen_salt('bf', 8)));

-- 60 students: student01@seatlock.test .. student60@seatlock.test
-- (student01-03 for the demo, the rest for the load test).
INSERT INTO users (name, email, role, password_hash)
SELECT 'Student ' || lpad(g::text, 2, '0'),
       'student' || lpad(g::text, 2, '0') || '@seatlock.test',
       'student',
       crypt('password123', gen_salt('bf', 4))
FROM generate_series(1, 60) AS g;

INSERT INTO events (id, organizer_id, name, description, venue, event_date, status) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
   'Fest Headline Night', 'The headline show of the college fest. Numbered seating.',
   'Main Auditorium', date_trunc('hour', now()) + INTERVAL '14 days', 'published'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012',
   'Stand-up Comedy Hour', 'Open mic and featured comics.',
   'Seminar Hall B', date_trunc('hour', now()) + INTERVAL '7 days', 'published'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000011',
   'Battle of the Bands (draft)', 'Not yet announced: visible to its organizer and admins only.',
   'Open Air Theatre', date_trunc('hour', now()) + INTERVAL '21 days', 'draft'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000012',
   'Opening Ceremony', 'Already started: booking is closed.',
   'Main Auditorium', date_trunc('hour', now()) - INTERVAL '2 days', 'published'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000011',
   'Load Test Arena', 'Small venue used by scripts/load-test.mjs to stress concurrent holds.',
   'Lab 1', date_trunc('hour', now()) + INTERVAL '30 days', 'published');

-- Seat grids: (event, rows, seats per row)
WITH layout(event_id, n_rows, per_row) AS (VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 10, 12),
    ('10000000-0000-0000-0000-000000000002'::uuid,  6, 10),
    ('10000000-0000-0000-0000-000000000003'::uuid,  8, 10),
    ('10000000-0000-0000-0000-000000000004'::uuid,  5,  8),
    ('10000000-0000-0000-0000-000000000005'::uuid,  2,  5))
INSERT INTO seats (event_id, seat_number, row_label, seat_index)
SELECT l.event_id, chr(64 + r) || s, chr(64 + r), s
FROM layout l, generate_series(1, l.n_rows) AS r, generate_series(1, l.per_row) AS s;

UPDATE events e SET total_seats = (SELECT count(*) FROM seats s WHERE s.event_id = e.id);

-- A couple of organizer-blocked seats (sound desk) on the headline show.
UPDATE seats SET is_blocked = TRUE
WHERE event_id = '10000000-0000-0000-0000-000000000001' AND seat_number IN ('J6', 'J7');
