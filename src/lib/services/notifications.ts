import 'server-only';
import { pool, type Db } from '../db';
import type { CurrentUser } from '../session';

/*
 * In-app notifications.
 *  - notify() is called with the SAME transaction client as the action that
 *    triggers it, so a notification exists only if the action committed.
 *  - Self-notifications are skipped (liking your own post doesn't ping you).
 *  - notifyMany() fans out to many recipients with ONE INSERT ... SELECT
 *    (e.g. "event time changed" → every student with a booking).
 *  - The bell polls /api/notifications; unread count uses a partial index.
 */

export type NotificationType =
  | 'post_like'
  | 'comment'
  | 'reply'
  | 'comment_like'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'checked_in'
  | 'event_updated'
  | 'review'
  | 'moderation'
  | 'welcome';

export type NewNotification = { userId: string; actorId?: string | null; type: NotificationType; title: string; body?: string; link?: string };

export async function notify(n: NewNotification, db: Db = pool) {
  if (n.actorId && n.actorId === n.userId) return; // never notify yourself
  await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5, $6)`,
    [n.userId, n.actorId ?? null, n.type, n.title.slice(0, 200), n.body?.slice(0, 300) ?? null, n.link ?? null]
  );
}

/** Fan-out: one notification per row returned by `recipientsSql` (must select a single user id column). */
export async function notifyMany(
  db: Db,
  recipientsSql: string,
  params: unknown[],
  n: Omit<NewNotification, 'userId'>
) {
  const base = params.length;
  await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, title, body, link)
     SELECT r.uid, $${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}
       FROM (${recipientsSql}) AS r(uid)
      WHERE $${base + 1}::uuid IS NULL OR r.uid <> $${base + 1}::uuid`,
    [...params, n.actorId ?? null, n.type, n.title.slice(0, 200), n.body?.slice(0, 300) ?? null, n.link ?? null]
  );
}

export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  created_at: Date;
  read_at: Date | null;
  actor_name: string | null;
};

export async function listNotifications(user: CurrentUser, limit = 20) {
  const [list, unread] = await Promise.all([
    pool.query<NotificationView>(
      `SELECT n.id, n.type, n.title, n.body, n.link, n.created_at, n.read_at, a.name AS actor_name
         FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
        WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [user.id, limit]
    ),
    pool.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [user.id]),
  ]);
  return { items: list.rows, unread: unread.rows[0].n };
}

/** Marks one (or all, when id is omitted) of the CURRENT user's notifications as read. */
export async function markRead(user: CurrentUser, id?: string) {
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return { updated: 0 };
  const { rowCount } = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL ${id ? 'AND id = $2' : ''}`,
    id ? [user.id, id] : [user.id]
  );
  return { updated: rowCount ?? 0 };
}
