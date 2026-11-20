import { apiRoute, list } from '@/lib/http';
import { holdSeats } from '@/lib/services/booking';

/** POST { seats: ["A1","A2"] }  ->  201 | 409 SEATS_UNAVAILABLE | 422 SEAT_LIMIT | 503 LOCK_TIMEOUT */
export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const hold = await holdSeats(user, params.id, list(body, 'seats'));
  return { status: 201, json: hold, redirect: `/events/${params.id}`, notice: 'hold_created' };
});
