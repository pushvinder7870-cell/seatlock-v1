import { apiRoute } from '@/lib/http';
import { deleteComment } from '@/lib/services/community';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await deleteComment(user, params.id);
  return { json: r, redirect: `/community/${r.postId}`, notice: 'comment_deleted' };
});
