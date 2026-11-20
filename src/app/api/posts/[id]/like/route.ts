import { apiRoute, str } from '@/lib/http';
import { toggleLike } from '@/lib/services/community';

export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const r = await toggleLike(user, params.id);
  return { json: r, redirect: str(body, '_redirect') || '/community' };
});
