import { apiRoute, str } from '@/lib/http';
import { getSeatMap, updateEvent, type EventStatus } from '@/lib/services/events';

type P = { id: string };

export const GET = apiRoute<P>(async ({ user, params }) => ({ json: await getSeatMap(user, params.id) }));

/** Update an event. Requires the `version` the client last saw (optimistic locking). */
export const POST = apiRoute<P>(async ({ user, params, body }) => {
  const { version } = await updateEvent(
    user,
    params.id,
    {
      name: str(body, 'name'),
      description: str(body, 'description'),
      venue: str(body, 'venue'),
      eventDate: str(body, 'eventDate'),
      status: str(body, 'status') as EventStatus,
      imageUrl: str(body, 'imageUrl') || undefined,
    },
    Number(str(body, 'version'))
  );
  return { json: { version }, redirect: `/events/${params.id}`, notice: 'event_saved' };
});
