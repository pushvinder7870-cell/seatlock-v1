import { apiRoute } from '@/lib/http';
import { togglePin } from '@/lib/services/community';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await togglePin(user, params.id);
  return { json: r, redirect: '/community', notice: r.pinned ? 'post_pinned' : 'post_unpinned' };
});
