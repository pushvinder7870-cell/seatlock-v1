import { apiRoute } from '@/lib/http';
import { releaseHold } from '@/lib/services/booking';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await releaseHold(user, params.id);
  return { json: r, redirect: `/events/${r.eventId}`, notice: 'hold_released' };
});
