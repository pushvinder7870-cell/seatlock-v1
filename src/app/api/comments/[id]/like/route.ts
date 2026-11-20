import { apiRoute } from '@/lib/http';
import { toggleCommentLike } from '@/lib/services/community';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await toggleCommentLike(user, params.id);
  return { json: r, redirect: `/community/${r.postId}` };
});
