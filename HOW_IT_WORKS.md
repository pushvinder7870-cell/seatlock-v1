# How SeatLock works: 10-minute study guide

Read this before the presentation. Each section answers "what is it, where is it, why did we do it that way".

---

## 1. The one-minute pitch

> SeatLock is a server-rendered booking platform. Hundreds of students can click the same seat at the same moment, and PostgreSQL row locks guarantee **exactly one** gets it. Permissions are checked **twice**, at the route and inside every service function. Every important action, and every denied request, is written to an **audit log split across 4 shards**. On top of that we built a community board, verified-attendee reviews and notifications, all with the same security model.

---

## 2. How one request flows

```
Browser ─► proxy.ts ─► page.tsx / route.ts ─► services/*.ts ─► PostgreSQL
           (gatekeeper)  (thin: parse input)   (rules + transaction)
```

1. **`src/proxy.ts`** (Next.js 16's name for middleware) runs first:
   * verifies the signed session cookie;
   * blocks other sites' form posts (CSRF layer 1);
   * applies role rules from `src/lib/route-rules.ts`. A student opening `/admin` gets **403** and an `ACCESS_DENIED` audit row.
2. **Pages** (`src/app/**/page.tsx`) render HTML on the server. **API routes** (`src/app/api/**/route.ts`) receive form posts and JSON. Neither ever writes SQL.
3. **Services** (`src/lib/services/*.ts`) take the current user first and check again: role and ownership ("is this your booking?"). Then they run the transaction and write the audit row.
4. **PostgreSQL** enforces the last line of defence with unique indexes.

**Where things live:**

| You want… | File |
| --- | --- |
| Booking + locking | `src/lib/services/booking.ts` |
| Events, seat map, optimistic edit | `src/lib/services/events.ts` |
| Audit shards | `src/lib/services/audit.ts` |
| Login, lockout | `src/lib/services/auth.ts`, `ratelimit.ts` |
| Community / reviews / notifications | `community.ts`, `reviews.ts`, `notifications.ts` |
| Image upload checks | `src/lib/services/storage.ts` |
| AI (Claude) | `src/lib/ai/claude.ts`, `src/lib/services/ai.ts` |
| Demo payments | `src/lib/services/payments.ts`, `payAndConfirm()` in `booking.ts` |
| Who-can-open-which-URL | `src/lib/route-rules.ts` |
| Schema + seed | `db/init.sql`, `db/migrations/*.sql` |
| Load test | `scripts/load-test.mjs` |

---

## 3. The algorithms (and how to explain them)

### 3.1 Pessimistic row locking with a fixed lock order (no double bookings)
**Where:** `holdSeats()` in `booking.ts`.
```sql
SELECT id FROM seats WHERE ... ORDER BY id FOR UPDATE;   -- lock the seat rows
-- now check: blocked? booked? held by someone whose 5 minutes haven't run out?
-- all free → insert hold; any taken → 409 listing which ones
```
* `FOR UPDATE` = "I'm working on these rows; anyone else wanting them waits."
* **Why `ORDER BY id`:** if Alice locks A1 then A2 while Bob locks A2 then A1, each waits for the other forever (**deadlock**). If everyone always locks in the same order (sorted by id), that cycle can't happen. This is the classic *resource ordering* rule from operating-systems courses.
* **Check after lock:** the availability check runs *after* we hold the locks, so nobody can sneak in between checking and writing.
* **Lock timeout 2 s:** a request never hangs; it gets **503** instead.
* **Safety net:** a unique index `booking_seats(seat_id) WHERE active` makes a double booking impossible even if the code had a bug.
* **Fast path:** before locking, an unlocked read rejects seats that are clearly taken. It can only *reject*, never grant, so it's safe, and losers don't queue on the hot row.

### 3.2 Optimistic locking (event edits)
**Where:** `updateEvent()` in `events.ts`. Each event has a `version`.
```sql
UPDATE events SET ..., version = version + 1 WHERE id = $1 AND version = $2
```
If someone saved first, the version changed, 0 rows update, and you get **409 "changed by someone else"**. This is *compare-and-swap*. We use it because humans edit slowly and conflicts are rare, so holding a lock for minutes would be wrong.

### 3.3 Hash sharding + shard pruning (audit log)
**Where:** `shardFor()` in `audit.ts`.
`shard = first 4 bytes of md5(event_id) mod 4` (no event, e.g. login? use the user id).
* **Same input → same shard, always**, in every process and after restarts.
* **Filter by event → read exactly 1 table** (*pruning*), because we know where that event's rows live.

### 3.4 Scatter-gather + merge + keyset pagination
**Where:** `listAuditLogs()`. With no event filter we ask **all 4 shards in parallel** for their newest 51 rows, merge them by time, and keep the top 50.
* **Why it's correct:** the overall top 50 must be inside the union of each shard's top 50.
* **Paging:** "Older →" uses a *keyset cursor* `(created_at, id)` instead of `OFFSET`, so pages don't shift when new rows arrive, and it stays fast however deep you page.

### 3.5 Fixed-window rate limiter + login lockout
**Where:** `ratelimit.ts`. Time is cut into windows (e.g. 5 minutes). One atomic UPSERT bumps a counter:
```sql
INSERT ... (key, window_start, 1) ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count
```
Over the limit gives **429** with `Retry-After`. Limits:
* posts: 5 per 10 min;
* comments: 20 per 5 min;
* uploads: 10 per 10 min;
* login: **5 wrong passwords per email in 5 minutes locks that email.**

**Why in Postgres and not memory:** on Vercel there are many server instances. A counter in memory would let an attacker spread requests across them; Postgres is shared by all of them.

### 3.6 "Hot" ranking (Hacker News formula)
**Where:** `listPosts()` in `community.ts`.
`score = (likes + 2·comments + 1) / (hours_since_posted + 2) ^ 1.5`
New posts start near the top and sink over time; engagement slows the sinking. Pinned posts always come first.

### 3.7 Idempotency via unique constraints
* **Confirm twice** (double-click) gives the same booking, because `bookings.hold_id` is UNIQUE.
* **Like twice:** `PRIMARY KEY (post_id, user_id)`, and a second click un-likes.
* **Review twice:** UNIQUE `(event_id, author_id)` + UPSERT, so the second one edits instead of duplicating.

### 3.8 Fan-out notifications in one query
**Where:** `notifyMany()` in `notifications.ts`. "Event date changed → notify every ticket holder" is a single `INSERT ... SELECT DISTINCT user_id FROM bookings ...`, not a loop. It runs **in the same transaction** as the edit, so there's never a notification for a change that rolled back.

### 3.9 Magic-byte file sniffing (image uploads)
**Where:** `storage.ts`. We ignore the filename and the browser's claimed type and check the first bytes of the file:
* PNG starts `89 50 4E 47`;
* JPEG starts `FF D8 FF`;
* GIF starts `47 49 46 38`;
* WebP starts `RIFF....WEBP`.

A renamed `.html` or `.exe` is rejected. Files get a random UUID name, so there's no path traversal or overwriting. The Supabase key stays on the server.

### 3.10 Signed tokens, CSRF, passwords
* **Session cookie** = HS256-signed token `{sessionId, userId, role, expiry}`, HttpOnly (JavaScript can't read it), SameSite=Lax. The server *also* checks the `sessions` row, so logout and role changes take effect instantly.
* **CSRF token** = `HMAC(secret, "csrf:" + sessionId)`, a hidden field in every form. A different site can't know it. Compared in constant time (`timingSafeEqual`).
* **Passwords:** bcrypt via Postgres `crypt()`. Unknown emails still pay one bcrypt, so timing doesn't reveal which accounts exist.

### 3.11 "Real-time" without websockets
The seat map polls every 4 s, the board every 5 s, comment sheets every 4 s, and the bell every 15 s (only while the tab is visible). On serverless hosting (Vercel) long-lived websocket connections aren't available, and polling a cheap endpoint is simple and reliable. Upgrade path: Supabase Realtime or Postgres `LISTEN/NOTIFY`.

### 3.12 AI features with Claude
**Where:**
* the Claude connection: `src/lib/ai/claude.ts`;
* the features: `src/lib/services/ai.ts`;
* the UI: `components/assistant-widget.tsx`, `ai-review-summary.tsx`, `description-field.tsx`.

We call **Claude Opus 5.5** through Anthropic's official TypeScript SDK (`@anthropic-ai/sdk`). There are three features:

| Feature | Who | What it does |
| --- | --- | --- |
| **Ask SeatLock** (chat bubble, ✨ on phones) | everyone | Answers questions like "which show is cheapest?" or "what tickets do I have?", with links to the right page |
| **AI review summary** (Reviews page, pick an event) | everyone | Summarizes all reviews of an event in 2–3 sentences |
| **Write with AI** (event form) | organizers | Drafts an event description from the name, venue, date and price |

**How "Ask SeatLock" works (grounding, a.k.a. "retrieval"):**
1. Your question goes to `/api/ai/chat`. It passes the same proxy, session and CSRF checks as everything else.
2. The server builds a **live snapshot of only what you may see**:
   * events filtered by your role, with prices, seats left and ratings;
   * your own bookings and holds;
   * the pages you can open.

   This is the same `listEvents(user)` permission logic the pages use, so the AI can never reveal another organizer's draft or another student's tickets.
3. Claude receives three things:
   * fixed instructions (how SeatLock works, the rules);
   * that snapshot, inside `<context>`;
   * the conversation.

   The rules are: answer only from the context, never invent events or prices, use only internal links, and treat the context as data, not instructions (this defends against **prompt injection** from text organizers write).
4. The answer comes back as text. Our tiny renderer turns `[text](/path)` into links, and **only same-site relative links** become clickable.
5. The assistant **cannot act** (book, pay, cancel). It only explains and links, so every permission check still lives in the services.

**Review summary caching:** we hash the event's reviews (`sha256` of each review id + edit time). If the hash matches the stored one in `ai_summaries`, we reuse the summary: **no AI call, no cost**. A new or edited review changes the hash, so a fresh summary is generated.

**Safety and cost controls:**
* each user gets 20 AI requests per 10 minutes (the same Postgres rate limiter);
* input length is capped;
* the effort level is "low" for short, fast answers;
* the server-side **refusal fallback** (`fallbacks: "default"`) retries automatically if Claude declines on safety grounds;
* the API key stays on the server and is never sent to the browser.

**Knowledge seed + offline brain (works with no API key).**
* `src/lib/ai/knowledge.ts` is the **knowledge seed**: around 40 facts about every part of SeatLock, each tagged by role. Claude receives it in its prompt.
* Without a key, or if Claude is down, `src/lib/ai/local-brain.ts` answers instead:
  1. **Intent rules over live data:** "what's on", "cheapest", "seats left", "best selling", "my tickets", or a show named by its title (matched by word overlap).
  2. **TF-IDF + cosine similarity** for how-to questions. Each knowledge entry becomes a vector of word weights, `tf × idf`, where `idf = log((N+1)/(df+1)) + 1` makes rare, specific words like "refund" count more than common ones. The question becomes a vector the same way. The entry with the highest cosine similarity (the angle between the vectors) wins.
* Offline **review summaries** use a **TextRank-style extractive summary**: every review sentence is scored by how similar it is to all the other sentences, and the 2 most central (most representative) sentences are quoted with the average rating.
* **Voice:** 🔊 reads answers aloud (the browser's `speechSynthesis`), and 🎤 lets you ask by voice (`SpeechRecognition`, in Chrome and Edge).

Each answer is labelled "Claude" or "SeatLock offline brain".

### 3.13 Demo payments: the Luhn checksum
**Where:** `src/lib/services/payments.ts`. No real money moves.
* **Luhn (mod 10):** starting from the right, double every second digit (subtract 9 if the result is over 9), then add all the digits. A real card number's total ends in 0. This catches almost every typo; `4242 4242 4242 4242` passes.
* **Brand from the first digits:** 4 is Visa, 51–55 is Mastercard, 34/37 is Amex, 60/65 is RuPay.
* **Atomic pay + book:** the payment row is inserted **inside the same transaction** as the booking. You can never pay without getting seats, or get seats without paying.
* **Test cards:** `4000 0000 0000 0002` and `fail@upi` are declined (402, recorded and audited).
* Only the brand and last 4 digits are stored, never the full number or the CVC.
* Cancelling a paid booking marks the payment **refunded** in the same transaction.

---

## 4. Security checklist (say these out loud)

| Threat | Defence |
| --- | --- |
| Double booking | row locks + ordered locking + unique indexes |
| Student calls admin API directly | proxy role check **and** service role check → 403 + audit |
| Organizer edits someone else's event | service ownership check → 403 + audit |
| CSRF (evil site submits our form) | Origin check in proxy + session-bound CSRF token |
| XSS in posts/comments | React escapes all text; control chars stripped; CSP `script-src 'self'` |
| Clickjacking | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` |
| Password guessing | lockout after 5 failures / 5 min, per-IP cap, bcrypt |
| Spam | Postgres rate limits on posts/comments/likes/uploads |
| Back button after logout | `Cache-Control: no-store` + hard redirect + bfcache reload |
| Malicious upload | size cap, magic bytes, random names, server-side key |
| SQL injection | every query is parameterised (`$1, $2…`); shard table names come from an integer 0–3 |
| Open redirect | redirects accept only same-site relative paths |

---

## 5. Likely judge questions: short answers

**Why not optimistic locking for seats too?**
Seats are *high contention*: 60 people want A1. With optimistic locking 59 of them do all their work and then fail and retry. With row locks they wait milliseconds and get a clean answer. Event edits are *low contention*, so we use optimistic locking there.

**How do you know it works?**
`npm run load-test`: 60 concurrent students on one seat gives one 201 and 59 409s, and then we query Postgres directly to check that no seat has two active holds or bookings. It also runs in GitHub Actions on every push.

**What happens if a hold expires?**
Three layers:
* reads treat it as free immediately;
* the next person to hold that seat reclaims it under lock;
* a background sweeper also marks it expired and writes `HOLD_EXPIRED`.

**Why 4 shards in one database?**
It demonstrates the routing logic (hash, pruning, scatter-gather). Moving each shard to its own database later only changes which connection `writeAudit` and `queryShard` use.

**What if the lock wait exceeds 2 seconds?**
Postgres raises `55P03`; we return **503** with "try again" and audit `SEAT_HOLD_REJECTED`.

**Why server-side rendering?**
Required by the brief, and it means permissions are enforced before any HTML is produced. The pages also work without JavaScript; JS only adds toasts, live refresh and animations.

**Can a student review a show they didn't attend?**
No. The service checks for a confirmed booking for that event; checked-in reviewers get a "verified attendee" badge.

**How does the AI know about our events? Can it leak data?**
For each question, the server builds a snapshot of only what *that user* may see, using the same permission code as the pages, and gives it to Claude as context. Claude answers only from that context. It cannot act (no booking or paying), only explain and link, and the API key never reaches the browser.

**What if the AI makes something up?**
The prompt tells it to answer only from the provided data and to say "I don't know" otherwise. The UI says "AI can make mistakes", and anything that matters (prices, seats) is enforced by the server anyway.

**Why cache the review summary?**
AI calls cost money and time. We hash the reviews and only call Claude again when they change.

**Is the audit log tamper-proof?**
Booking audit rows are written in the same transaction as the booking, so you can't have one without the other. Denials are written separately, so they survive the rollback of the refused request.

---

## 6. Demo flow (8 minutes)
1. **Book.** Log in as **Student 01** (demo button) → *Fest Headline Night* → pick seats → **Hold** (5-min ring timer) → **Confirm** → *My tickets*.
2. **Show a 403.** As the student, open `/admin`, and you get an access-denied page. Then log in as **Admin** → **Dashboard → Recent security events** shows it.
3. **Load test.** Run `npm run load-test` in a terminal, then refresh the dashboard to show the activity spike.
4. **Audit viewer.** **Audit log** → select an event → only one shard tile is lit ("pruning").
5. **Extras:**
   * Community: post, open the comments sheet, reply, like, and watch the bell light up for the other user.
   * Reviews: stars from verified attendees.
   * Phone layout with the bottom tab bar.
