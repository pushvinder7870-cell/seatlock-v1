-- Event reviews: only students with a confirmed booking for the event may review it.
-- One review per student per event (re-submitting edits it). Idempotent.
CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES events(id),
    author_id   UUID        NOT NULL REFERENCES users(id),
    rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID        REFERENCES users(id),
    UNIQUE (event_id, author_id)
);
CREATE INDEX IF NOT EXISTS reviews_event_idx ON reviews (event_id, created_at DESC) WHERE deleted_at IS NULL;

-- Seed: three students attended the (already finished) Opening Ceremony and reviewed it.
DO $$
DECLARE
  ev UUID := '10000000-0000-0000-0000-000000000004';
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = ev) THEN RETURN; END IF;
  FOR r IN
    SELECT * FROM (VALUES
      ('student03@seatlock.test', 'A1', 5, 'Incredible opening! The light show over the stage gave me goosebumps. Booking took 20 seconds.', '30000000-0000-0000-0000-000000000001'::uuid),
      ('student04@seatlock.test', 'A2', 4, 'Great vibe and good seats. Sound was a bit loud in row A, bring earplugs next time.', '30000000-0000-0000-0000-000000000002'::uuid),
      ('student05@seatlock.test', 'A3', 5, 'Check-in at the door was instant, loved it. Can''t wait for Headline Night.', '30000000-0000-0000-0000-000000000003'::uuid)
    ) AS t(email, seat, rating, body, booking_id)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = r.booking_id) THEN
      INSERT INTO bookings (id, user_id, event_id, status, created_at, checked_in_at, checked_in_by)
      SELECT r.booking_id, u.id, ev, 'confirmed', now() - interval '5 days', now() - interval '2 days', '00000000-0000-0000-0000-000000000012'
        FROM users u WHERE u.email = r.email;
      INSERT INTO booking_seats (booking_id, seat_id, event_id, user_id)
      SELECT r.booking_id, s.id, ev, u.id
        FROM users u JOIN seats s ON s.event_id = ev AND s.seat_number = r.seat
       WHERE u.email = r.email
         AND NOT EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active);
    END IF;
    INSERT INTO reviews (event_id, author_id, rating, body, created_at)
    SELECT ev, u.id, r.rating, r.body, now() - interval '1 day'
      FROM users u WHERE u.email = r.email
    ON CONFLICT (event_id, author_id) DO NOTHING;
  END LOOP;
END $$;
