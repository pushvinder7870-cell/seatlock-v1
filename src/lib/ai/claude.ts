import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../errors';

/*
 * Single place where SeatLock talks to Claude (Anthropic's official SDK).
 *
 *  - Model: Claude Opus 5.5. Thinking is always on for this model; we keep
 *    effort "low" for short chat-style answers (fast + cheap).
 *  - Server-side refusal fallback is enabled (fallbacks: "default"): if the
 *    model declines a request on safety grounds, Anthropic re-runs it on a
 *    fallback model inside the same call.
 *  - Credentials come from ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN). If none
 *    are set, every AI feature reports "not configured" instead of failing.
 *  - Typed SDK errors are mapped to friendly HTTP errors (429 busy, 503 setup).
 */

export const AI_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!aiEnabled()) {
    throw new AppError(503, 'AI_DISABLED', 'AI features are not set up on this server yet (ANTHROPIC_API_KEY is missing).');
  }
  return (client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }));
}

export type GenerateOptions = {
  system: string | Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: 'low' | 'medium' | 'high';
};

/** One Messages API call; returns the text of Claude's answer. */
export async function generateText({ system, messages, effort = 'low' }: GenerateOptions): Promise<string> {
  const anthropic = getClient();
  try {
    const response = await anthropic.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'AI_REFUSED', "The assistant can't help with that request.");
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim();
    if (!text) throw new AppError(502, 'AI_EMPTY', 'The assistant returned an empty answer. Please try again.');
    return text;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AppError(429, 'AI_BUSY', 'The AI service is busy right now. Try again in a moment.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new AppError(503, 'AI_AUTH', 'The AI credentials on this server are invalid. Check ANTHROPIC_API_KEY.');
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      throw new AppError(502, 'AI_ERROR', 'The AI service had a problem. Please try again.');
    }
    if (e instanceof Anthropic.APIConnectionError) throw new AppError(503, 'AI_UNREACHABLE', 'Could not reach the AI service.');
    throw e;
  }
}
