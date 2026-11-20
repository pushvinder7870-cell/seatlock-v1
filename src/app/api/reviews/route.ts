import { apiRoute, str } from '@/lib/http';
import { listReviews, ratingSummaries, upsertReview } from '@/lib/services/reviews';

export const GET = apiRoute(async ({ user, body }) => ({
  json: { reviews: await listReviews(user, { eventId: str(body, 'eventId') || undefined }), ratings: await ratingSummaries() },
}));

/** POST { eventId, rating 1-5, body } → 201 (new) | 200 (edited) | 400 not a verified attendee | 403 non-student | 429 */
export const POST = apiRoute(async ({ user, body }) => {
  const r = await upsertReview(user, { eventId: str(body, 'eventId'), rating: Number(str(body, 'rating')), body: str(body, 'body') });
  return { status: r.edited ? 200 : 201, json: r, redirect: '/reviews', notice: 'review_saved' };
});
