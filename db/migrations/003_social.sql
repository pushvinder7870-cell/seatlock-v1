-- Comment replies + likes, post images, notifications. Idempotent.

-- One level of threading: a reply points at a top-level comment.
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES post_comments(id);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON post_comments (parent_id);

CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id UUID        NOT NULL REFERENCES post_comments(id),
    user_id    UUID        NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);

-- Optional image attached to a post (public URL in our Supabase Storage bucket).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- In-app notifications (bell icon). Written in the same transaction as the action that caused them.
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id),   -- recipient
    actor_id   UUID        REFERENCES users(id),            -- who caused it (null = system)
    type       TEXT        NOT NULL,
    title      TEXT        NOT NULL,
    body       TEXT,
    link       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Welcome notification for every existing user (once).
INSERT INTO notifications (user_id, type, title, body, link)
SELECT u.id, 'welcome', 'Welcome to SeatLock 🎟️', 'Book seats, join the fest board and review shows you attended.', '/community'
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.type = 'welcome');
