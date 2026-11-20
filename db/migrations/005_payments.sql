-- Demo payments: ticket prices + simulated checkout records. Idempotent.
-- No real money moves; card numbers are never stored (only brand + last 4).
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0 AND price_cents <= 10000000);

CREATE TABLE IF NOT EXISTS payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no   TEXT        NOT NULL UNIQUE,
    user_id      UUID        NOT NULL REFERENCES users(id),
    event_id     UUID        NOT NULL REFERENCES events(id),
    hold_id      UUID        REFERENCES holds(id),
    booking_id   UUID        REFERENCES bookings(id),
    seats        INTEGER     NOT NULL,
    unit_cents   INTEGER     NOT NULL,
    fee_cents    INTEGER     NOT NULL DEFAULT 0,
    amount_cents INTEGER     NOT NULL,
    currency     TEXT        NOT NULL DEFAULT 'INR',
    method       TEXT        NOT NULL CHECK (method IN ('card', 'upi')),
    card_brand   TEXT,
    card_last4   TEXT,
    upi_id       TEXT,
    status       TEXT        NOT NULL CHECK (status IN ('paid', 'declined', 'refunded')),
    decline_reason TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    refunded_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);
-- At most one successful payment per booking (safety net for double-clicks).
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_paid_per_booking ON payments (booking_id) WHERE status IN ('paid', 'refunded');

-- Demo prices for the seeded shows (only if still free, so organizer edits are kept).
UPDATE events SET price_cents = 49900 WHERE id = '10000000-0000-0000-0000-000000000001' AND price_cents = 0; -- Headline Night ₹499
UPDATE events SET price_cents = 19900 WHERE id = '10000000-0000-0000-0000-000000000002' AND price_cents = 0; -- Comedy Hour ₹199
