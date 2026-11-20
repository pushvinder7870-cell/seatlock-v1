import { apiRoute, str } from '@/lib/http';
import { listNotifications, markRead } from '@/lib/services/notifications';
import { timeAgo } from '@/lib/format';

export const GET = apiRoute(async ({ user }) => {
  const { items, unread } = await listNotifications(user);
  return { json: { unread, items: items.map((n) => ({ ...n, ago: timeAgo(n.created_at) })) } };
});

/** POST { id? } marks one notification (or all) as read, only the caller's own. */
export const POST = apiRoute(async ({ user, body }) => ({ json: await markRead(user, str(body, 'id') || undefined) }));
