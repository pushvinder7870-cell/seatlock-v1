-- Event cover photos + an in-database image store (used when Supabase Storage isn't configured). Idempotent.
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID        NOT NULL REFERENCES users(id),
    mime        TEXT        NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
    size_bytes  INTEGER     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
    data        BYTEA       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
