import { apiRoute } from '@/lib/http';
import { deletePost } from '@/lib/services/community';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await deletePost(user, params.id);
  return { json: r, redirect: '/community', notice: 'post_deleted' };
});
