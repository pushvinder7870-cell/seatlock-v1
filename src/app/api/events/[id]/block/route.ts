import { apiRoute, list, str } from '@/lib/http';
import { setSeatsBlocked } from '@/lib/services/events';

/** POST { seats: [...], op: "block" | "unblock" } (organizer, own event) */
export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const block = str(body, 'op') !== 'unblock';
  const result = await setSeatsBlocked(user, params.id, list(body, 'seats'), block);
  return { json: result, redirect: `/events/${params.id}`, notice: block ? 'seats_blocked' : 'seats_unblocked' };
});
