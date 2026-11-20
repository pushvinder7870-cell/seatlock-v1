import 'server-only';
import { pool, withTransaction } from '../db';
import { NotFoundError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { deny, requireRole } from './authz';
import { writeAudit } from './audit';
import { cleanText } from './community';
import { assertUuid } from './events';
import { hit } from './ratelimit';
import { notifyMany } from './notifications';

/*
 * Event reviews.
 *  - Only a student with a CONFIRMED booking for the event may review it
 *    ("verified attendee"); the check runs on the server against bookings.
 *  - One review per student per event: UNIQUE(event_id, author_id) + UPSERT,
 *    so submitting again edits your review instead of duplicating it.
 *  - Authors can delete their own; admins can remove any (soft delete, audited).
 *  - Average rating = mean of live reviews; distribution = count per star.
 */

export type ReviewView = {
  id: string;
  event_id: string;
  event_name: string;
  author_id: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  checked_in: boolean;
};

export type EventRating = {
  event_id: string;
  event_name: string;
  event_date: Date;
  count: number;
  average: number;
  dist: [number, number, number, number, number]; // index 0 = 1 star … 4 = 5 stars
};

export async function listReviews(user: CurrentUser, opts: { eventId?: string } = {}): Promise<ReviewView[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (user.role !== 'admin') where.push('r.deleted_at IS NULL');
  if (opts.eventId) {
    assertUuid(opts.eventId, 'event');
    params.push(opts.eventId);
    where.push(`r.event_id = $${params.length}`);
  }
  const { rows } = await pool.query<ReviewView>(
    `SELECT r.id, r.event_id, e.name AS event_name, r.author_id, u.name AS author_name, r.rating, r.body,
            r.created_at, r.updated_at, r.deleted_at,
            EXISTS (SELECT 1 FROM bookings b WHERE b.event_id = r.event_id AND b.user_id = r.author_id AND b.checked_in_at IS NOT NULL) AS checked_in
       FROM reviews r JOIN users u ON u.id = r.author_id JOIN events e ON e.id = r.event_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.updated_at DESC LIMIT 100`,
    params
  );
  return rows;
}

/** Rating summary for every event that has at least one live review. */
export async function ratingSummaries(): Promise<EventRating[]> {
  const { rows } = await pool.query<{ event_id: string; event_name: string; event_date: Date; count: number; average: string; d1: number; d2: number; d3: number; d4: number; d5: number }>(`
    SELECT e.id AS event_id, e.name AS event_name, e.event_date, count(*)::int AS count, avg(r.rating)::numeric(3,2)::text AS average,
           count(*) FILTER (WHERE r.rating = 1)::int AS d1, count(*) FILTER (WHERE r.rating = 2)::int AS d2,
           count(*) FILTER (WHERE r.rating = 3)::int AS d3, count(*) FILTER (WHERE r.rating = 4)::int AS d4,
           count(*) FILTER (WHERE r.rating = 5)::int AS d5
      FROM reviews r JOIN events e ON e.id = r.event_id
     WHERE r.deleted_at IS NULL
     GROUP BY e.id ORDER BY avg(r.rating) DESC, count(*) DESC`);
  return rows.map((r) => ({
    event_id: r.event_id,
    event_name: r.event_name,
    event_date: r.event_date,
    count: r.count,
    average: Number(r.average),
    dist: [r.d1, r.d2, r.d3, r.d4, r.d5],
  }));
}

/** Events the current student may review: those with a confirmed booking. */
export async function reviewableEvents(user: CurrentUser) {
  if (user.role !== 'student') return [];
  const { rows } = await pool.query<{ id: string; name: string; my_rating: number | null; checked_in: boolean }>(
    `SELECT e.id, e.name, r.rating AS my_rating, bool_or(b.checked_in_at IS NOT NULL) AS checked_in
       FROM bookings b JOIN events e ON e.id = b.event_id
       LEFT JOIN reviews r ON r.event_id = e.id AND r.author_id = $1 AND r.deleted_at IS NULL
      WHERE b.user_id = $1 AND b.status = 'confirmed'
      GROUP BY e.id, r.rating ORDER BY e.event_date`,
    [user.id]
  );
  return rows;
}

export async function upsertReview(user: CurrentUser, input: { eventId: string; rating: number; body: string }) {
  await requireRole(user, ['student'], { action: 'upsertReview', eventId: input.eventId, targetType: 'event', targetId: input.eventId });
  assertUuid(input.eventId, 'event');
  const rating = Math.trunc(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new ValidationError('Pick a rating from 1 to 5 stars.');
  const body = cleanText(input.body, 1000, 'Review');

  const booked = await pool.query('SELECT 1 FROM bookings WHERE user_id = $1 AND event_id = $2 AND status = $3 LIMIT 1', [user.id, input.eventId, 'confirmed']);
  if (!booked.rowCount) throw new ValidationError('You can only review events you have a confirmed booking for.');
  await hit(`review:${user.id}`, 10, 600, 'Too many reviews in a short time. Try again later.');

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; inserted: boolean }>(
      `INSERT INTO reviews (event_id, author_id, rating, body) VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, author_id) DO UPDATE
         SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now(), deleted_at = NULL, deleted_by = NULL
       RETURNING id, (xmax = 0) AS inserted`,
      [input.eventId, user.id, rating, body]
    );
    await writeAudit(
      {
        action: 'REVIEW_SUBMITTED',
        actor: { id: user.id, role: user.role },
        eventId: input.eventId,
        targetType: 'review',
        targetId: rows[0].id,
        details: { rating, edited: !rows[0].inserted },
      },
      tx
    );
    if (rows[0].inserted) {
      await notifyMany(tx, 'SELECT organizer_id FROM events WHERE id = $1', [input.eventId], {
        actorId: user.id,
        type: 'review',
        title: `${user.name} left a ${'★'.repeat(rating)} review`,
        body: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        link: `/reviews?event=${input.eventId}`,
      });
    }
    return { id: rows[0].id, edited: !rows[0].inserted };
  });
}

export async function deleteReview(user: CurrentUser, reviewId: string) {
  assertUuid(reviewId, 'review');
  const { rows } = await pool.query<{ author_id: string; event_id: string; deleted_at: Date | null }>(
    'SELECT author_id, event_id, deleted_at FROM reviews WHERE id = $1',
    [reviewId]
  );
  const r = rows[0];
  if (!r) throw new NotFoundError('Review not found.');
  if (r.author_id !== user.id && user.role !== 'admin') {
    await deny(user, { action: 'deleteReview', eventId: r.event_id, targetType: 'review', targetId: reviewId, reason: 'ownership' });
  }
  if (!r.deleted_at) {
    await withTransaction(async (tx) => {
      await tx.query('UPDATE reviews SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [reviewId, user.id]);
      await writeAudit(
        { action: 'REVIEW_DELETED', actor: { id: user.id, role: user.role }, eventId: r.event_id, targetType: 'review', targetId: reviewId, details: { moderation: r.author_id !== user.id } },
        tx
      );
    });
  }
  return { ok: true };
}
