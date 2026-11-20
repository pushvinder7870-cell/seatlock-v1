-- Community board + rate limiting. Idempotent: safe to run on every deploy.

-- Posts: any signed-in user can post; authors delete their own; admins moderate everything.
CREATE TABLE IF NOT EXISTS posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id   UUID        NOT NULL REFERENCES users(id),
    event_id    UUID        REFERENCES events(id),          -- optional: post is about an event
    body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    pinned      BOOLEAN     NOT NULL DEFAULT FALSE,         -- admins can pin announcements
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,                                -- soft delete: admins still see removed posts
    deleted_by  UUID        REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_event_idx ON posts (event_id);

CREATE TABLE IF NOT EXISTS post_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID        NOT NULL REFERENCES posts(id),
    author_id   UUID        NOT NULL REFERENCES users(id),
    body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID        REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (post_id, created_at);

-- One like per user per post (the primary key enforces it).
CREATE TABLE IF NOT EXISTS post_likes (
    post_id    UUID        NOT NULL REFERENCES posts(id),
    user_id    UUID        NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- Fixed-window rate limiter shared by every app instance (works on serverless too).
CREATE TABLE IF NOT EXISTS rate_limits (
    key          TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INTEGER     NOT NULL,
    PRIMARY KEY (key, window_start)
);

-- A couple of seed posts so the board isn't empty on first run.
INSERT INTO posts (id, author_id, event_id, body, pinned, created_at)
SELECT '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
       '10000000-0000-0000-0000-000000000001',
       E'🎤 Headline Night lineup is out! Doors open 30 minutes early. Seats are numbered, so grab yours before they''re gone.\nMax 4 seats per student.',
       TRUE, now() - INTERVAL '3 hours'
WHERE EXISTS (SELECT 1 FROM users WHERE id = '00000000-0000-0000-0000-000000000011')
ON CONFLICT (id) DO NOTHING;

INSERT INTO posts (id, author_id, body, created_at)
SELECT '20000000-0000-0000-0000-000000000002', u.id,
       'Anyone going to the comedy hour on Friday? Looking for people to sit with 😄', now() - INTERVAL '90 minutes'
FROM users u WHERE u.email = 'student02@seatlock.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO post_comments (post_id, author_id, body, created_at)
SELECT '20000000-0000-0000-0000-000000000002', u.id, 'Count me in! Booked row C.', now() - INTERVAL '60 minutes'
FROM users u
WHERE u.email = 'student03@seatlock.test'
  AND EXISTS (SELECT 1 FROM posts WHERE id = '20000000-0000-0000-0000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM post_comments WHERE post_id = '20000000-0000-0000-0000-000000000002');
