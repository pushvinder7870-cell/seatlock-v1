import { apiRoute } from '@/lib/http';
import { getSeatMap } from '@/lib/services/events';

/** Lightweight seat-state feed used by the live seat map refresh. */
export const GET = apiRoute<{ id: string }>(async ({ user, params }) => {
  const map = await getSeatMap(user, params.id);
  return {
    json: {
      version: map.event.version,
      bookingOpen: map.bookingOpen,
      seats: map.seats,
      myHold: map.myHold,
      serverTime: new Date().toISOString(),
    },
  };
});
