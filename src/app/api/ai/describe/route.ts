import { apiRoute, str } from '@/lib/http';
import { draftDescription } from '@/lib/services/ai';

/** POST { name, venue?, eventDate?, priceRupees?, notes? } → { description } (organizers) */
export const POST = apiRoute(async ({ user, body }) => ({
  json: await draftDescription(user, {
    name: str(body, 'name'),
    venue: str(body, 'venue'),
    eventDate: str(body, 'eventDate'),
    priceRupees: str(body, 'priceRupees'),
    notes: str(body, 'notes'),
  }),
}));
