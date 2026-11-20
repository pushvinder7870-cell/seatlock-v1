import 'server-only';
import { pool, withTransaction } from '../db';
import { NotFoundError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { deny, requireRole } from './authz';
import { writeAudit } from './audit';
import { LIMITS, hit } from './ratelimit';
import { assertUuid } from './events';
import { notify } from './notifications';
import { assertOwnImageUrl } from './storage';

/*
 * Community board.
 *  - Any signed-in user can read, post, comment and like.
 *  - Authors can delete their own posts/comments; admins can delete anything
 *    and pin announcements. Deletes are soft: admins still see removed content.
 *  - Every 403 goes through deny() → ACCESS_DENIED audit row.
 *  - Writes are rate limited (fixed window, see ratelimit.ts).
 *  - Output is rendered as text by React (auto-escaped), so user HTML/script
 *    never executes (XSS-safe); we additionally strip control characters.
 *
 * "Hot" ranking (Hacker News gravity formula):
 *     score = (likes + 2·comments + 1) / (age_in_hours + 2) ^ 1.5
 * New posts start high and decay over time; engagement slows the decay.
 */

export type PostSort = 'hot' | 'latest';

export type PostView = {
  id: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
  created_at: Date;
  deleted_at: Date | null;
  deleted_by_name: string | null;
  author_id: string;
  author_name: string;
  author_role: 'admin' | 'organizer' | 'student';
  event_id: string | null;
  event_name: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  score: number;
};

export type CommentView = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: Date;
  deleted_at: Date | null;
  author_id: string;
  author_name: string;
  author_role: 'admin' | 'organizer' | 'student';
  like_count: number;
  liked_by_me: boolean;
};

/** Trim, normalise newlines, drop control chars, collapse blank-line runs, enforce length. */
export function cleanText(input: string, max: number, label: string): string {
  const text = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new ValidationError(`${label} can't be empty.`);
  if (text.length > max) throw new ValidationError(`${label} is too long (max ${max} characters).`);
  return text;
}

const POST_SELECT = `
  SELECT p.id, p.body, p.image_url, p.pinned, p.created_at, p.deleted_at, db.name AS deleted_by_name,
         p.author_id, a.name AS author_name, a.role AS author_role,
         p.event_id, e.name AS event_name,
         (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)::int AS like_count,
         (SELECT count(*) FROM post_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL)::int AS comment_count,
         EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me,
         ((SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)
           + 2 * (SELECT count(*) FROM post_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) + 1)
           / power(extract(epoch FROM now() - p.created_at) / 3600 + 2, 1.5) AS score
    FROM posts p
    JOIN users a ON a.id = p.author_id
    LEFT JOIN users db ON db.id = p.deleted_by
    LEFT JOIN events e ON e.id = p.event_id`;

export async function listPosts(user: CurrentUser, opts: { sort?: PostSort; eventId?: string } = {}): Promise<PostView[]> {
  const where: string[] = [];
  const params: unknown[] = [user.id];
  if (user.role !== 'admin') where.push('p.deleted_at IS NULL'); // admins see removed posts too
  if (opts.eventId) {
    assertUuid(opts.eventId, 'event');
    params.push(opts.eventId);
    where.push(`p.event_id = $${params.length}`);
  }
  const order = opts.sort === 'latest' ? 'p.pinned DESC, p.created_at DESC' : 'p.pinned DESC, score DESC, p.created_at DESC';
  const { rows } = await pool.query<PostView>(
    `${POST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT 50`,
    params
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function getPost(user: CurrentUser, postId: string): Promise<{ post: PostView; comments: CommentView[] }> {
  assertUuid(postId, 'post');
  const { rows } = await pool.query<PostView>(`${POST_SELECT} WHERE p.id = $2`, [user.id, postId]);
  const post = rows[0];
  if (!post || (post.deleted_at && user.role !== 'admin')) throw new NotFoundError('Post not found.');
  const c = await pool.query<CommentView>(
    `SELECT c.id, c.parent_id, c.body, c.created_at, c.deleted_at, c.author_id, u.name AS author_name, u.role AS author_role,
            (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id)::int AS like_count,
            EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $2) AS liked_by_me
       FROM post_comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = $1 ${user.role === 'admin' ? '' : 'AND c.deleted_at IS NULL'}
      ORDER BY c.created_at`,
    [postId, user.id]
  );
  return { post: { ...post, score: Number(post.score) }, comments: c.rows };
}

export async function communityStats(user: CurrentUser) {
  await requireRole(user, ['admin'], { action: 'communityStats' });
  const { rows } = await pool.query<{ posts: number; comments: number; removed: number; likes: number; today: number }>(`
    SELECT (SELECT count(*) FROM posts WHERE deleted_at IS NULL)::int AS posts,
           (SELECT count(*) FROM post_comments WHERE deleted_at IS NULL)::int AS comments,
           ((SELECT count(*) FROM posts WHERE deleted_at IS NOT NULL) + (SELECT count(*) FROM post_comments WHERE deleted_at IS NOT NULL))::int AS removed,
           (SELECT count(*) FROM post_likes)::int AS likes,
           (SELECT count(*) FROM posts WHERE created_at > now() - interval '24 hours')::int AS today`);
  return rows[0];
}

export async function createPost(user: CurrentUser, input: { body: string; eventId?: string; imageUrl?: string }) {
  const body = cleanText(input.body, 2000, 'Post');
  const imageUrl = assertOwnImageUrl(input.imageUrl);
  let eventId: string | null = null;
  if (input.eventId) {
    assertUuid(input.eventId, 'event');
    // You can only tag events you are allowed to see.
    const ev = await pool.query<{ status: string; organizer_id: string }>('SELECT status, organizer_id FROM events WHERE id = $1', [input.eventId]);
    const e = ev.rows[0];
    const visible = e && (user.role === 'admin' || e.status === 'published' || e.organizer_id === user.id);
    if (!visible) throw new ValidationError('Unknown event.');
    eventId = input.eventId;
  }
  await hit(`post:${user.id}`, LIMITS.postsPerUser.limit, LIMITS.postsPerUser.windowSec, 'You are posting too fast. Try again in a few minutes.');
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO posts (author_id, event_id, body, image_url) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.id, eventId, body, imageUrl]
    );
    await writeAudit(
      { action: 'POST_CREATED', actor: { id: user.id, role: user.role }, eventId, targetType: 'post', targetId: rows[0].id, details: { length: body.length } },
      tx
    );
    return { id: rows[0].id };
  });
}

async function loadLivePost(postId: string) {
  assertUuid(postId, 'post');
  const { rows } = await pool.query<{ id: string; author_id: string; event_id: string | null; deleted_at: Date | null; pinned: boolean }>(
    'SELECT id, author_id, event_id, deleted_at, pinned FROM posts WHERE id = $1',
    [postId]
  );
  return rows[0];
}

export async function deletePost(user: CurrentUser, postId: string) {
  const post = await loadLivePost(postId);
  if (!post) throw new NotFoundError('Post not found.');
  if (post.author_id !== user.id && user.role !== 'admin') {
    await deny(user, { action: 'deletePost', eventId: post.event_id, targetType: 'post', targetId: postId, reason: 'ownership' });
  }
  if (post.deleted_at) return { alreadyDeleted: true };
  await withTransaction(async (tx) => {
    await tx.query('UPDATE posts SET deleted_at = now(), deleted_by = $2, pinned = FALSE WHERE id = $1 AND deleted_at IS NULL', [postId, user.id]);
    await writeAudit(
      {
        action: 'POST_DELETED',
        actor: { id: user.id, role: user.role },
        eventId: post.event_id,
        targetType: 'post',
        targetId: postId,
        details: { moderation: post.author_id !== user.id },
      },
      tx
    );
    if (post.author_id !== user.id) {
      await notify(
        { userId: post.author_id, actorId: user.id, type: 'moderation', title: 'A moderator removed your post', body: 'It broke the community rules.', link: '/community' },
        tx
      );
    }
  });
  return { alreadyDeleted: false };
}

export async function togglePin(user: CurrentUser, postId: string) {
  await requireRole(user, ['admin'], { action: 'togglePin', targetType: 'post', targetId: postId });
  const post = await loadLivePost(postId);
  if (!post || post.deleted_at) throw new NotFoundError('Post not found.');
  await withTransaction(async (tx) => {
    await tx.query('UPDATE posts SET pinned = NOT pinned WHERE id = $1', [postId]);
    await writeAudit(
      { action: 'POST_PINNED', actor: { id: user.id, role: user.role }, eventId: post.event_id, targetType: 'post', targetId: postId, details: { pinned: !post.pinned } },
      tx
    );
  });
  return { pinned: !post.pinned };
}

/** Like/unlike in one round trip: insert; if the row already existed, delete it instead. */
export async function toggleLike(user: CurrentUser, postId: string) {
  const post = await loadLivePost(postId);
  if (!post || post.deleted_at) throw new NotFoundError('Post not found.');
  await hit(`like:${user.id}`, LIMITS.likesPerUser.limit, LIMITS.likesPerUser.windowSec);
  return withTransaction(async (tx) => {
    const ins = await tx.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, user.id]);
    if (ins.rowCount === 0) await tx.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, user.id]);
    else await notify({ userId: post.author_id, actorId: user.id, type: 'post_like', title: `${user.name} liked your post`, link: `/community/${postId}` }, tx);
    return { liked: ins.rowCount === 1 };
  });
}

/**
 * Adds a comment, or a reply when parentId is given. Threads are one level
 * deep: replying to a reply attaches to that reply's top-level parent.
 * Notifies the post author (comment) and the parent comment's author (reply).
 */
export async function addComment(user: CurrentUser, postId: string, input: { body: string; parentId?: string }) {
  const body = cleanText(input.body, 1000, 'Comment');
  const post = await loadLivePost(postId);
  if (!post || post.deleted_at) throw new NotFoundError('Post not found.');
  let parent: { id: string; author_id: string } | null = null;
  if (input.parentId) {
    assertUuid(input.parentId, 'comment');
    const p = await pool.query<{ id: string; parent_id: string | null; author_id: string; post_id: string; deleted_at: Date | null }>(
      'SELECT id, parent_id, author_id, post_id, deleted_at FROM post_comments WHERE id = $1',
      [input.parentId]
    );
    const row = p.rows[0];
    if (!row || row.post_id !== postId || row.deleted_at) throw new NotFoundError('The comment you replied to no longer exists.');
    parent = { id: row.parent_id ?? row.id, author_id: row.author_id };
  }
  await hit(`comment:${user.id}`, LIMITS.commentsPerUser.limit, LIMITS.commentsPerUser.windowSec, 'You are commenting too fast. Take a breath.');
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO post_comments (post_id, author_id, body, parent_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [postId, user.id, body, parent?.id ?? null]
    );
    await writeAudit(
      { action: 'COMMENT_CREATED', actor: { id: user.id, role: user.role }, eventId: post.event_id, targetType: 'comment', targetId: rows[0].id, details: { postId, reply: !!parent } },
      tx
    );
    const link = `/community/${postId}`;
    const snippet = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    if (parent) {
      await notify({ userId: parent.author_id, actorId: user.id, type: 'reply', title: `${user.name} replied to your comment`, body: snippet, link }, tx);
    }
    if (!parent || parent.author_id !== post.author_id) {
      await notify({ userId: post.author_id, actorId: user.id, type: 'comment', title: `${user.name} commented on your post`, body: snippet, link }, tx);
    }
    return { id: rows[0].id, postId };
  });
}

export async function toggleCommentLike(user: CurrentUser, commentId: string) {
  assertUuid(commentId, 'comment');
  const { rows } = await pool.query<{ author_id: string; post_id: string; deleted_at: Date | null }>(
    'SELECT author_id, post_id, deleted_at FROM post_comments WHERE id = $1',
    [commentId]
  );
  const c = rows[0];
  if (!c || c.deleted_at) throw new NotFoundError('Comment not found.');
  await hit(`like:${user.id}`, LIMITS.likesPerUser.limit, LIMITS.likesPerUser.windowSec);
  return withTransaction(async (tx) => {
    const ins = await tx.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, user.id]);
    if (ins.rowCount === 0) await tx.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, user.id]);
    else await notify({ userId: c.author_id, actorId: user.id, type: 'comment_like', title: `${user.name} liked your comment`, link: `/community/${c.post_id}` }, tx);
    return { liked: ins.rowCount === 1, postId: c.post_id };
  });
}

export async function deleteComment(user: CurrentUser, commentId: string) {
  assertUuid(commentId, 'comment');
  const { rows } = await pool.query<{ author_id: string; post_id: string; deleted_at: Date | null; event_id: string | null }>(
    'SELECT c.author_id, c.post_id, c.deleted_at, p.event_id FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1',
    [commentId]
  );
  const c = rows[0];
  if (!c) throw new NotFoundError('Comment not found.');
  if (c.author_id !== user.id && user.role !== 'admin') {
    await deny(user, { action: 'deleteComment', eventId: c.event_id, targetType: 'comment', targetId: commentId, reason: 'ownership' });
  }
  if (!c.deleted_at) {
    await withTransaction(async (tx) => {
      await tx.query('UPDATE post_comments SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [commentId, user.id]);
      await writeAudit(
        {
          action: 'COMMENT_DELETED',
          actor: { id: user.id, role: user.role },
          eventId: c.event_id,
          targetType: 'comment',
          targetId: commentId,
          details: { postId: c.post_id, moderation: c.author_id !== user.id },
        },
        tx
      );
    });
  }
  return { postId: c.post_id };
}
