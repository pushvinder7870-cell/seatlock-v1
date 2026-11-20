import { apiRoute } from '@/lib/http';
import { assistantReply } from '@/lib/services/ai';

/** POST { messages: [{ role: "user" | "assistant", content }] } → { reply } */
export const POST = apiRoute(async ({ user, body }) => ({
  json: await assistantReply(user, (body as unknown as { messages?: unknown }).messages),
}));
