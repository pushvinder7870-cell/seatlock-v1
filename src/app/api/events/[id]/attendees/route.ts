import { apiRoute } from '@/lib/http';
import { listEventBookings } from '@/lib/services/booking';

export const GET = apiRoute<{ id: string }>(async ({ user, params }) => ({
  json: await listEventBookings(user, params.id),
}));
