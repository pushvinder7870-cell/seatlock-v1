import { apiRoute, str } from '@/lib/http';
import { createEvent, listEvents, type EventStatus } from '@/lib/services/events';

export const GET = apiRoute(async ({ user }) => ({ json: { events: await listEvents(user) } }));

export const POST = apiRoute(async ({ user, body }) => {
  const { id } = await createEvent(user, {
    name: str(body, 'name'),
    description: str(body, 'description'),
    venue: str(body, 'venue'),
    eventDate: str(body, 'eventDate'),
    status: (str(body, 'status') || 'draft') as EventStatus,
    rows: Number(str(body, 'rows')),
    seatsPerRow: Number(str(body, 'seatsPerRow')),
  });
  return { status: 201, json: { id }, redirect: `/events/${id}`, notice: 'event_created' };
});
