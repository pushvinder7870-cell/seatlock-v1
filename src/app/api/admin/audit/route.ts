import { apiRoute, str } from '@/lib/http';
import { listAuditLogs } from '@/lib/services/audit';

/** GET ?eventId=&from=&to=&action=&cursor=  (eventId => single shard; otherwise scatter-gather) */
export const GET = apiRoute(async ({ user, body }) => {
  const page = await listAuditLogs(user, {
    eventId: str(body, 'eventId') || undefined,
    from: str(body, 'from') || undefined,
    to: str(body, 'to') || undefined,
    action: str(body, 'action') || undefined,
    cursor: str(body, 'cursor') || undefined,
  });
  return { json: page };
});
