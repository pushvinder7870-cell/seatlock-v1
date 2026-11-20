import { apiRoute, str } from '@/lib/http';
import { addComment, getPost } from '@/lib/services/community';
import { initials, timeAgo } from '@/lib/format';

/** Comments for the slide-over sheet (polled while it is open, so new comments appear live). */
export const GET = apiRoute<{ id: string }>(async ({ user, params }) => {
  const { post, comments } = await getPost(user, params.id);
  return {
    json: {
      postDeleted: !!post.deleted_at,
      comments: comments.map((c) => ({
        id: c.id,
        parentId: c.parent_id,
        likes: c.like_count,
        liked: c.liked_by_me,
        body: c.body,
        author: c.author_name,
        initials: initials(c.author_name),
        role: c.author_role,
        ago: timeAgo(c.created_at),
        deleted: !!c.deleted_at,
        canDelete: !c.deleted_at && (c.author_id === user.id || user.role === 'admin'),
      })),
    },
  };
});

export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const r = await addComment(user, params.id, { body: str(body, 'body'), parentId: str(body, 'parentId') || undefined });
  return { status: 201, json: r, redirect: `/community/${params.id}`, notice: 'comment_created' };
});
