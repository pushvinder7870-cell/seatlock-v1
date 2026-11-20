import { apiRoute } from '@/lib/http';
import { deleteReview } from '@/lib/services/reviews';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await deleteReview(user, params.id);
  return { json: r, redirect: '/reviews', notice: 'review_deleted' };
});
