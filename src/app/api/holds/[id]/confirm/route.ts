import { apiRoute } from '@/lib/http';
import { confirmHold } from '@/lib/services/booking';

/** Idempotent: re-confirming a confirmed hold returns the same booking with 200. */
export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await confirmHold(user, params.id);
  return {
    status: r.alreadyConfirmed ? 200 : 201,
    json: r,
    redirect: '/my/bookings',
    notice: 'booking_confirmed',
  };
});
