import { apiRoute } from '@/lib/http';
import { checkIn } from '@/lib/services/booking';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await checkIn(user, params.id);
  return { json: r, redirect: `/events/${r.eventId}/attendees`, notice: 'checked_in' };
});
