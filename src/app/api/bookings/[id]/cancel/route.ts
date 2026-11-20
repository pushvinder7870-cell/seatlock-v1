import { apiRoute } from '@/lib/http';
import { cancelBooking } from '@/lib/services/booking';

export const POST = apiRoute<{ id: string }>(async ({ user, params }) => {
  const r = await cancelBooking(user, params.id);
  return { json: r, redirect: '/my/bookings', notice: 'booking_cancelled' };
});
