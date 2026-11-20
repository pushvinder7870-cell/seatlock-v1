import 'server-only';
import { fmtDateTime } from '../time';
import { KNOWLEDGE, type KnowledgeEntry, type Role } from './knowledge';

/*
 * SeatLock's OFFLINE BRAIN: answers without any external AI service.
 *
 * Two layers:
 *  1. Intent rules over LIVE DATA (events the user may see, their bookings and
 *     holds): "what's on?", "cheapest show", "seats left", "my tickets",
 *     "tell me about Comedy Hour", "best rated"...
 *  2. Knowledge search (how-to questions) with TF-IDF + cosine similarity:
 *       - every knowledge entry becomes a vector of word weights
 *         tf(word) × idf(word), where idf = log((N+1)/(df+1)) + 1 makes rare,
 *         specific words (e.g. "refund") count more than common ones;
 *       - the question becomes a vector the same way;
 *       - cosine similarity (dot product / lengths) picks the closest entry.
 *     Titles and tags are repeated so they weigh more than body text.
 *
 * Used when ANTHROPIC_API_KEY is missing or Claude is unavailable.
 */

export type BrainEvent = {
  id: string;
  name: string;
  date: Date;
  venue: string | null;
  priceCents: number;
  bookingOpen: boolean;
  status: string;
  available: number;
  total: number;
  booked: number;
  rating: { average: number; count: number } | null;
  description: string | null;
};

export type BrainData = {
  user: { name: string; role: Role };
  events: BrainEvent[];
  bookings: { eventName: string; bookingId: string; seats: string[]; status: string; paidCents: number | null }[];
  holds: { eventName: string; eventId: string; seats: string[]; expiresAt: Date }[];
};

// ------------------------------------------------------------- text tools
const STOP = new Set(
  'a an the is are was were be been am i me my mine you your yours we our it its to of in on at for with and or but if so do does did can could would should will what which who whom how when where why this that these those there here please tell show give any some about from by as up out into than then just also all much many very really get got have has had im id ive'.split(' ')
);
const SYNONYMS: Record<string, string> = {
  buy: 'book', purchase: 'book', reserve: 'book', reservation: 'book', bookings: 'book', booked: 'book', booking: 'book',
  tickets: 'ticket', seats: 'seat', events: 'event', shows: 'event', show: 'event', gig: 'event', concert: 'event',
  cheap: 'price', cheapest: 'price', cost: 'price', costs: 'price', fee: 'price', fees: 'price', rupees: 'price', expensive: 'price', priced: 'price',
  refunds: 'refund', refunded: 'refund', cancelled: 'cancel', canceling: 'cancel', cancelling: 'cancel',
  photos: 'photo', pictures: 'photo', picture: 'photo', image: 'photo', images: 'photo',
  login: 'login', signin: 'login', password: 'login', passwords: 'login',
  pay: 'payment', paying: 'payment', paid: 'payment', payments: 'payment',
};

function stem(w: string) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()#>:]/g, ' ')
    .replace(/[^a-z0-9₹\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? stem(w));
}

// ------------------------------------------------------------- TF-IDF index
type Vec = Map<string, number>;
type Index = { entries: KnowledgeEntry[]; vecs: Vec[]; idf: Map<string, number> };
const indexCache = new Map<Role, Index>();

function termFreq(tokens: string[]): Vec {
  const tf: Vec = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function weigh(tf: Vec, idf: Map<string, number>): Vec {
  const v: Vec = new Map();
  for (const [t, n] of tf) v.set(t, (1 + Math.log(n)) * (idf.get(t) ?? 0));
  return v;
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, w] of a) na += w * w;
  for (const [, w] of b) nb += w * w;
  for (const [t, w] of a) dot += w * (b.get(t) ?? 0);
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function indexFor(role: Role): Index {
  const hit = indexCache.get(role);
  if (hit) return hit;
  const entries = KNOWLEDGE.filter((e) => !e.roles || e.roles.includes(role));
  const docs = entries.map((e) => tokenize(`${e.title} ${e.title} ${e.tags.join(' ')} ${e.tags.join(' ')} ${e.tags.join(' ')} ${e.answer}`));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log((docs.length + 1) / (n + 1)) + 1);
  const index = { entries, vecs: docs.map((d) => weigh(termFreq(d), idf)), idf };
  indexCache.set(role, index);
  return index;
}

/** Top knowledge matches for a question (score 0..1). */
export function searchKnowledge(question: string, role: Role, k = 3) {
  const idx = indexFor(role);
  const q = weigh(termFreq(tokenize(question)), idx.idf);
  return idx.entries
    .map((entry, i) => ({ entry, score: cosine(q, idx.vecs[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ------------------------------------------------------------- formatting
const inr = (cents: number) => '₹' + (cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const priceText = (e: BrainEvent) => (e.priceCents ? `${inr(e.priceCents)}/seat` : 'free');
const eventLine = (e: BrainEvent) =>
  `- [${e.name}](/events/${e.id}): ${fmtDateTime(e.date)}, ${priceText(e)}, **${e.available}** of ${e.total} seats left` +
  (e.rating ? `, ★ ${e.rating.average.toFixed(1)}` : '');

function has(q: string, ...patterns: RegExp[]) {
  return patterns.some((p) => p.test(q));
}

/** Finds an event the question names (token overlap with the event name). */
function mentionedEvent(question: string, events: BrainEvent[]): BrainEvent | null {
  const q = new Set(tokenize(question));
  let best: BrainEvent | null = null;
  let bestScore = 0;
  for (const e of events) {
    const name = tokenize(e.name).filter((t) => t.length > 2 && !['event', 'night', 'hour'].includes(t));
    if (!name.length) continue;
    const overlap = name.filter((t) => q.has(t)).length / name.length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = e;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// ------------------------------------------------------------- the brain
export function localAnswer(question: string, data: BrainData): string {
  const q = question.toLowerCase();
  const first = data.user.name.split(' ')[0];
  const open = data.events.filter((e) => e.bookingOpen);
  const role = data.user.role;

  // Small talk
  if (has(q, /^\s*(hi|hello|hey|yo|namaste|good (morning|afternoon|evening))\b/) && q.split(/\s+/).length <= 4) {
    return `Hi ${first}! 👋 I can tell you what's on, compare prices and seats, find your tickets, or explain how anything on SeatLock works. What would you like to know?`;
  }
  if (has(q, /\b(thanks|thank you|thx|great|awesome|cool)\b/) && q.split(/\s+/).length <= 5) {
    return `You're welcome, ${first}! Anything else I can help with?`;
  }

  // My tickets / bookings
  if (
    role === 'student' &&
    has(
      q,
      /\bmy (ticket|tickets|booking|bookings|seats|order|orders)\b/,
      /\b(tickets?|bookings?|seats?) (do|did|have) i\b/,
      /\bwhat (did|have) i (book|bought|got)\b/,
      /\b(did|have) i (book|booked|bought)\b/,
      /\bi (have|booked|bought)\b.*\b(ticket|tickets|seat|seats)\b/
    )
  ) {
    const live = data.bookings.filter((b) => b.status === 'confirmed');
    const lines = live.map((b) => `- **${b.eventName}**: seats ${b.seats.join(', ')}${b.paidCents ? ` (paid ${inr(b.paidCents)})` : ''}. [View ticket](/tickets/${b.bookingId})`);
    const holds = data.holds.map((h) => `- On hold for **${h.eventName}**: ${h.seats.join(', ')} until ${fmtDateTime(h.expiresAt)}. [Finish booking](/events/${h.eventId})`);
    if (!lines.length && !holds.length) return `You don't have any tickets yet, ${first}. Browse [Events](/events) to book up to 4 seats per show.`;
    return [`Here's what you have, ${first}:`, ...lines, ...holds, '', 'All tickets are in [My tickets](/my/bookings).'].join('\n');
  }
  if (role === 'student' && has(q, /\bmy hold\b/, /\bholding\b/) && data.holds.length) {
    return data.holds.map((h) => `You're holding **${h.seats.join(', ')}** for ${h.eventName} until ${fmtDateTime(h.expiresAt)}. [Confirm or pay now](/events/${h.eventId}).`).join('\n');
  }

  // A specific event by name
  const named = mentionedEvent(question, data.events);
  if (named && !has(q, /\b(cheapest|all|list|every)\b/)) {
    const e = named;
    const parts = [
      `**[${e.name}](/events/${e.id})**`,
      `- When: ${fmtDateTime(e.date)}`,
      `- Where: ${e.venue ?? 'TBA'}`,
      `- Price: ${e.priceCents ? `${inr(e.priceCents)} per seat (+2% fee)` : 'free entry'}`,
      `- Seats: **${e.available}** of ${e.total} left${e.bookingOpen ? '' : ' (booking closed)'}`,
    ];
    if (e.rating) parts.push(`- Rating: ★ ${e.rating.average.toFixed(1)} from ${e.rating.count} review(s). [Read reviews](/reviews?event=${e.id})`);
    if (e.description) parts.push('', e.description.slice(0, 220));
    if (role === 'student' && e.bookingOpen) parts.push('', 'Open the event, tap up to 4 seats and click **Hold seats**.');
    return parts.join('\n');
  }

  // Cheapest / free / price comparisons
  if (has(q, /\b(cheap|cheapest|lowest price|budget|afford|free|price|prices|cost|how much|expensive)\b/) && !has(q, /\b(fee|set|change)\b.*\bprice\b/)) {
    // Only recommend shows you can actually book (open AND with seats left).
    const bookable = open.filter((e) => e.available > 0);
    if (!bookable.length) return 'There are no shows with free seats right now.';
    const sorted = [...bookable].sort((a, b) => a.priceCents - b.priceCents || +new Date(a.date) - +new Date(b.date));
    const free = sorted.filter((e) => !e.priceCents);
    const cheapestPaid = sorted.find((e) => e.priceCents);
    const head = free.length
      ? `**${free.length} free** show(s) still have seats${cheapestPaid ? `, and the cheapest paid one is **${cheapestPaid.name}** at **${inr(cheapestPaid.priceCents)}**` : ''}:`
      : `The cheapest show with seats left is **${sorted[0].name}** at **${inr(sorted[0].priceCents)}** per seat:`;
    const soldOut = open.length - bookable.length;
    return [
      head,
      ...sorted.slice(0, 5).map(eventLine),
      '',
      `Paid shows add a 2% convenience fee at checkout (demo payment).${soldOut ? ` ${soldOut} sold-out show(s) not listed.` : ''}`,
    ].join('\n');
  }

  // Availability / popularity (organizer+admin get "my events"/"selling best")
  if (has(q, /\b(seats? (left|available|remaining)|availability|sold out|selling|popular|busiest|best.?selling|full|how many seats)\b/)) {
    const list = role === 'student' ? open : data.events;
    if (!list.length) return 'No events to show right now.';
    const sellingBest = has(q, /\b(popular|selling|busiest|best.?selling)\b/);
    const sorted = [...list].sort((a, b) => (sellingBest ? b.booked - a.booked : a.available - b.available));
    const intro =
      role === 'organizer' ? 'Your events:' : sellingBest ? 'Best-selling shows first:' : 'Fewest seats left first:';
    return [intro, ...sorted.slice(0, 6).map(eventLine)].join('\n');
  }

  // Best rated
  if (has(q, /\b(best|top|highest).*(rated|rating|review)|\b(rating|ratings|rated)\b/)) {
    const rated = data.events.filter((e) => e.rating).sort((a, b) => b.rating!.average - a.rating!.average);
    if (rated.length) return ['Top-rated shows:', ...rated.slice(0, 5).map((e) => `- [${e.name}](/reviews?event=${e.id}): ★ ${e.rating!.average.toFixed(1)} (${e.rating!.count} reviews)`)].join('\n');
  }

  // What's on
  if (has(q, /\b(what'?s on|events?|shows?|happening|upcoming|this week|tonight|tomorrow|weekend|coming up|line.?up)\b/) && !has(q, /\b(how|create|edit|cancel|delete)\b/)) {
    const list = role === 'student' ? open : data.events;
    if (!list.length) return 'There are no events open for booking right now. Check back soon!';
    const sorted = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return [role === 'organizer' ? 'Your events:' : `Here's what's coming up, ${first}:`, ...sorted.slice(0, 6).map(eventLine), '', 'Tap a show to see its live seat map.'].join('\n');
  }

  // How-to questions: TF-IDF knowledge search
  const [top, second] = searchKnowledge(question, role);
  if (top && top.score >= 0.12) {
    const related = second && second.score >= 0.12 && second.score > top.score * 0.6 ? `\n\nRelated: **${second.entry.title}**. Ask me about it!` : '';
    return top.entry.answer + related;
  }

  return [
    `I'm not sure about that one, ${first}. I can help with things like:`,
    '- "What shows can I still book?"',
    '- "Which event is cheapest?"',
    '- "How do I pay?" or "How do refunds work?"',
    role === 'student' ? '- "What tickets do I have?"' : role === 'organizer' ? '- "How do I block seats?"' : '- "What does the audit log show?"',
  ].join('\n');
}

/** The whole knowledge base as text, for Claude's system prompt. */
export function knowledgeAsText(role: Role): string {
  return KNOWLEDGE.filter((e) => !e.roles || e.roles.includes(role))
    .map((e) => `## ${e.title}\n${e.answer}`)
    .join('\n\n');
}
