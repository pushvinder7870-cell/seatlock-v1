import { apiRoute, str } from '@/lib/http';
import { createPost, listPosts, type PostSort } from '@/lib/services/community';

export const GET = apiRoute(async ({ user, body }) => ({
  json: { posts: await listPosts(user, { sort: (str(body, 'sort') as PostSort) || 'hot', eventId: str(body, 'eventId') || undefined }) },
}));

/** POST { body, eventId? } → 201 | 400 | 429 RATE_LIMITED */
export const POST = apiRoute(async ({ user, body }) => {
  const r = await createPost(user, {
    body: str(body, 'body'),
    eventId: str(body, 'eventId') || undefined,
    imageUrl: str(body, 'imageUrl') || undefined,
  });
  return { status: 201, json: r, redirect: '/community', notice: 'post_created' };
});
