import { apiRoute, str } from '@/lib/http';
import { reviewSummary } from '@/lib/services/ai';

/** POST { eventId } → { summary, reviewCount, cached } */
export const POST = apiRoute(async ({ user, body }) => ({ json: await reviewSummary(user, str(body, 'eventId')) }));
