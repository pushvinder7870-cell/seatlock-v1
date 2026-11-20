import { apiRoute } from '@/lib/http';
import { listMyBookings } from '@/lib/services/booking';

export const GET = apiRoute(async ({ user }) => ({ json: { bookings: await listMyBookings(user) } }));
