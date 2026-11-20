/*
 * SeatLock knowledge base: the "seed" the assistant learns the app from.
 *
 * Used two ways:
 *  1. Sent to Claude as part of its (cached) system prompt, so its answers
 *     match how SeatLock really works.
 *  2. Searched by the offline brain (local-brain.ts) with TF-IDF when no AI
 *     key is configured or Claude is unavailable.
 *
 * Keep answers short, factual and in the same Markdown style the chat renders:
 * "- " bullets, **bold**, and [links](/relative/paths). `roles` limits an entry
 * to certain users (omitted = everyone).
 */

export type Role = 'admin' | 'organizer' | 'student';

export type KnowledgeEntry = {
  id: string;
  title: string;
  tags: string[];
  answer: string;
  roles?: Role[];
};

export const KNOWLEDGE: KnowledgeEntry[] = [
  // ------------------------------------------------------------------ basics
  {
    id: 'what-is-seatlock',
    title: 'What is SeatLock?',
    tags: ['about', 'app', 'website', 'what', 'purpose', 'seatlock', 'fest'],
    answer:
      'SeatLock is the seat-booking site for the college fest. You pick numbered seats on a live seat map, hold them for 5 minutes, then confirm (or pay, for paid shows). Even if hundreds of students click the same seat at once, **exactly one** gets it.',
  },
  {
    id: 'roles',
    title: 'Who can do what (roles)',
    tags: ['role', 'roles', 'student', 'organizer', 'admin', 'permission', 'access', 'allowed'],
    answer:
      'There are three roles:\n- **Students** browse events, hold/book up to 4 seats per event, pay, cancel, post, comment and review shows they booked.\n- **Organizers** create and edit their own events, set prices and cover photos, block seats and check attendees in.\n- **Admins** see the dashboard, every event, the audit log, and manage users and roles.\nEvery permission is checked on the server, not just hidden in the browser.',
  },
  {
    id: 'login',
    title: 'Logging in and demo accounts',
    tags: ['login', 'log', 'sign', 'signin', 'password', 'account', 'demo', 'credentials'],
    answer:
      'Use the demo buttons on the login page: they fill in the email and the password `password123`. Accounts: admin@seatlock.test, organizer1/organizer2@seatlock.test and student01 to student60@seatlock.test. There is no sign-up page in this version.',
  },
  {
    id: 'locked-out',
    title: 'Locked out after wrong passwords',
    tags: ['locked', 'lockout', 'wrong', 'password', 'too', 'many', 'attempts', '429', 'login', 'failed'],
    answer:
      'After **5 wrong passwords in 5 minutes**, that email is locked for the rest of the window (to stop password guessing). Wait a few minutes and try again, or use the demo buttons so the password is typed correctly.',
  },
  {
    id: 'logout',
    title: 'Logging out',
    tags: ['logout', 'log', 'out', 'sign', 'signout', 'session', 'back', 'button'],
    answer:
      'Open your name at the bottom of the sidebar and choose **Log out**. Your session is revoked on the server, and pressing Back afterwards will not show your old pages.',
  },

  // ---------------------------------------------------------------- booking
  {
    id: 'how-to-book',
    title: 'How to book seats',
    tags: ['book', 'booking', 'reserve', 'buy', 'get', 'seat', 'seats', 'ticket', 'how', 'steps'],
    roles: ['student'],
    answer:
      'To book:\n- Open [Events](/events) and choose a show.\n- Tap up to **4 green seats** on the seat map.\n- Click **Hold seats**: they are yours for **5 minutes**.\n- Free show: click **Confirm booking**. Paid show: click **Checkout** and pay (demo).\n- Your ticket appears in [My tickets](/my/bookings).',
  },
  {
    id: 'hold',
    title: 'What a hold is and how long it lasts',
    tags: ['hold', 'holding', 'held', 'timer', 'minutes', 'expire', 'expired', 'countdown', '5'],
    answer:
      'A hold reserves your seats for **5 minutes** while you confirm or pay. A ring timer shows the time left. If it runs out, the seats go back to everyone automatically and you need to pick again.',
  },
  {
    id: 'seat-limit',
    title: 'Maximum 4 seats per event',
    tags: ['limit', 'maximum', 'max', 'four', '4', 'more', 'seats', 'many', 'extra', 'add'],
    answer:
      'Each student can have at most **4 seats per event** (held + booked together). Picking more seats while you already hold some **adds** them to your hold. Asking for more than 4 is refused, and the seats you already have are kept.',
  },
  {
    id: 'seat-colors',
    title: 'Seat map colours',
    tags: ['color', 'colour', 'colors', 'legend', 'green', 'grey', 'yellow', 'blue', 'striped', 'map', 'state'],
    answer:
      'On the seat map:\n- **Green outline**: available\n- **Indigo**: selected by you\n- **Amber**: on hold by someone\n- **Blue**: your hold\n- **Green filled**: your booked seat\n- **Grey**: booked\n- **Striped with ×**: blocked by the organizer\nThe map refreshes live every few seconds.',
  },
  {
    id: 'seat-taken',
    title: 'Seat was just taken / 409 error',
    tags: ['taken', 'unavailable', '409', 'conflict', 'error', 'someone', 'else', 'gone', 'failed', 'hold'],
    answer:
      "If someone else got a seat a moment before you, you'll see a message like \"A2 was just taken\". **Nothing was held** (it's all-or-nothing), so just pick other seats. The map shows the latest state.",
  },
  {
    id: 'busy-503',
    title: 'Busy / try again (503)',
    tags: ['busy', '503', 'slow', 'timeout', 'try', 'again', 'wait', 'lock'],
    answer:
      "When very many people grab the same seats at once, a request may wait up to 2 seconds for its turn. If it can't, you get **\"busy, try again\"**: just click again, nothing was changed.",
  },
  {
    id: 'cancel',
    title: 'Cancelling a booking and refunds',
    tags: ['cancel', 'cancellation', 'refund', 'money', 'back', 'undo', 'remove', 'booking'],
    roles: ['student'],
    answer:
      'Open [My tickets](/my/bookings) and click **Cancel** on the booking. You can cancel any time **before the show starts** (not after check-in). Paid tickets get an automatic **demo refund**, shown on the ticket receipt.',
  },
  {
    id: 'tickets',
    title: 'Where to find my tickets',
    tags: ['ticket', 'tickets', 'my', 'bookings', 'receipt', 'find', 'where', 'show', 'door', 'print'],
    roles: ['student'],
    answer:
      'All your bookings are in [My tickets](/my/bookings). Click **View ticket** to see the ticket with its code, seats and receipt. You can print it or save it as a PDF and show it at the door.',
  },
  {
    id: 'booking-closed',
    title: 'Why booking is closed',
    tags: ['closed', 'booking', 'started', 'past', 'over', 'cannot', 'book', 'draft'],
    answer:
      'Booking closes when the show starts, and drafts are hidden until the organizer publishes them. Closed events still show their seat map but you cannot hold seats.',
  },

  // --------------------------------------------------------------- payments
  {
    id: 'payment',
    title: 'Paying for a ticket (demo checkout)',
    tags: ['pay', 'payment', 'checkout', 'card', 'upi', 'price', 'money', 'cost', 'fee', 'buy'],
    answer:
      'Paid shows have a **Checkout** step after you hold seats. Pay by **card or UPI**. It is a **demo**: no real money is charged and card numbers are never stored (only brand + last 4 digits). Total = price × seats + a 2% convenience fee. Payment and booking are saved together, so you never pay without getting your seats.',
  },
  {
    id: 'test-cards',
    title: 'Test card numbers',
    tags: ['test', 'card', 'number', 'declined', 'decline', '4242', 'upi', 'fail', 'demo'],
    answer:
      'Demo payment details:\n- Success: card **4242 4242 4242 4242**, any future expiry like 12/30, CVC 123\n- Declined: card **4000 0000 0000 0002**, or UPI **fail@upi**\n- Success UPI: **student@okaxis**\nThe checkout page has buttons that fill these in for you.',
  },
  {
    id: 'card-invalid',
    title: 'Card number not valid',
    tags: ['invalid', 'card', 'not', 'valid', 'luhn', 'digits', 'wrong', 'expired', 'cvc'],
    answer:
      'Card numbers are checked with the **Luhn checksum** (the same check banks use to catch typos). Check the digits, use a future expiry (MM/YY) and a 3-digit CVC (4 for Amex), or use the test card 4242 4242 4242 4242.',
  },

  // ------------------------------------------------------------ organizers
  {
    id: 'create-event',
    title: 'Creating an event',
    tags: ['create', 'new', 'event', 'add', 'make', 'organize', 'publish', 'rows', 'seats'],
    roles: ['organizer'],
    answer:
      'Go to [New event](/events/new): add a name, cover photo, description (or click **Write with AI**), venue, start time, ticket price (0 = free), status and the seat layout (rows × seats per row). Choose **Published** when students should see it.',
  },
  {
    id: 'edit-event',
    title: 'Editing an event (and the 409 conflict)',
    tags: ['edit', 'update', 'change', 'event', 'version', 'conflict', 'save', '409'],
    roles: ['organizer'],
    answer:
      'Open your event and click **Edit**. If someone else saved the event while you were editing, your save is refused with a "changed by someone else" message instead of overwriting their work (optimistic locking). Reload and re-apply your changes. Ticket holders get a notification when the date, venue or status changes.',
  },
  {
    id: 'price',
    title: 'Setting a ticket price',
    tags: ['price', 'pricing', 'ticket', 'cost', 'free', 'rupees', 'set', 'charge'],
    roles: ['organizer'],
    answer:
      'On the event form, set **Ticket price (₹)**. 0 means free. Students then pay through the demo checkout. Admins see total demo revenue on the dashboard.',
  },
  {
    id: 'cover-photo',
    title: 'Adding a cover photo',
    tags: ['photo', 'image', 'picture', 'cover', 'upload', 'banner'],
    roles: ['organizer'],
    answer:
      'On the event form, click **Add a cover photo** (PNG, JPEG, GIF or WebP, up to 4 MB), then save. The photo appears on the event card and as the banner on the seat-map page.',
  },
  {
    id: 'block-seats',
    title: 'Blocking seats',
    tags: ['block', 'blocked', 'unblock', 'reserve', 'crew', 'equipment', 'seats'],
    roles: ['organizer'],
    answer:
      'On your event\'s seat map, select available seats and click **Block** (or select blocked seats and click **Unblock**). Booked or currently held seats cannot be blocked.',
  },
  {
    id: 'check-in',
    title: 'Checking attendees in',
    tags: ['check', 'checkin', 'attendee', 'attendees', 'door', 'entry', 'list', 'guest'],
    roles: ['organizer', 'admin'],
    answer:
      'Open the event and click **Attendees**. Search by name, email or seat, then click **Check in** next to the booking. The student gets a notification and their ticket shows "checked in".',
  },

  // ----------------------------------------------------------------- admins
  {
    id: 'dashboard',
    title: 'Admin dashboard',
    tags: ['dashboard', 'stats', 'kpi', 'charts', 'revenue', 'overview', 'admin'],
    roles: ['admin'],
    answer:
      'The [Dashboard](/admin) shows seats sold, demo revenue, active holds and security events, plus charts for activity, audit rows per shard, seat occupancy per event and top actions.',
  },
  {
    id: 'audit',
    title: 'Audit log and shards',
    tags: ['audit', 'log', 'logs', 'shard', 'shards', 'history', 'security', 'records'],
    roles: ['admin'],
    answer:
      'Every important action (and every refused request) is recorded in the [Audit log](/admin/audit). Records are spread over **4 tables (shards)** using hash(event id) mod 4. Filtering by one event reads just one shard; showing all events reads all four and merges them.',
  },
  {
    id: 'users-roles',
    title: 'Managing users and roles',
    tags: ['users', 'user', 'role', 'change', 'promote', 'deactivate', 'manage', 'admin'],
    roles: ['admin'],
    answer:
      'In [Users](/admin/users), pick a role (student, organizer, admin) or untick **Active**, then click **Save**. The user is signed out everywhere immediately so the change applies at once.',
  },

  // ---------------------------------------------------------------- social
  {
    id: 'community',
    title: 'Community board',
    tags: ['community', 'post', 'posts', 'board', 'feed', 'share', 'comment', 'like', 'reply'],
    answer:
      'The [Community](/community) board is where everyone talks about the fest. Write a post (you can tag an event and add a photo), like posts, and open **comments** in a side panel to reply or like comments. The feed updates live. Posting is limited to 5 posts per 10 minutes to stop spam.',
  },
  {
    id: 'hot-latest',
    title: 'Hot vs Latest on the board',
    tags: ['hot', 'latest', 'sort', 'ranking', 'top', 'popular', 'order'],
    answer:
      '**Latest** shows newest posts first. **Hot** ranks by likes and comments, decaying with age (the Hacker News formula), so lively new posts rise. Pinned announcements always come first.',
  },
  {
    id: 'moderation',
    title: 'Deleting posts and moderation',
    tags: ['delete', 'remove', 'moderate', 'moderation', 'report', 'pin', 'rules', 'spam'],
    answer:
      'You can delete your own posts and comments. Admins can remove any post or comment and pin announcements; removals are recorded in the audit log and the author is notified.',
  },
  {
    id: 'reviews',
    title: 'Reviews and ratings',
    tags: ['review', 'reviews', 'rating', 'ratings', 'stars', 'rate', 'feedback', 'verified'],
    answer:
      'On [Reviews](/reviews), students who have a confirmed booking for a show can rate it 1 to 5 stars and write a review (submitting again edits it). Checked-in reviewers get a **Verified attendee** badge. Pick an event to see its average, star breakdown and an **AI summary**.',
  },
  {
    id: 'notifications',
    title: 'Notifications (bell icon)',
    tags: ['notification', 'notifications', 'bell', 'alert', 'alerts', 'unread'],
    answer:
      'The bell at the top shows alerts: likes, comments and replies on your posts, booking confirmed, check-in, event changes, new reviews on your events and moderation. Click one to jump to it, or **Mark all read**.',
  },

  // ------------------------------------------------------------ app & help
  {
    id: 'mobile',
    title: 'Using SeatLock on a phone',
    tags: ['mobile', 'phone', 'iphone', 'android', 'tablet', 'responsive', 'menu', 'navigate', 'navigation'],
    answer:
      'On phones, use the **tab bar at the bottom** for the main pages and **More** for the full menu. The ✨ button at the top opens this assistant. The seat map scrolls sideways if the hall is wide.',
  },
  {
    id: 'dark-mode',
    title: 'Dark mode / theme',
    tags: ['dark', 'light', 'theme', 'mode', 'colour', 'color', 'night'],
    answer: 'Use the sun/moon button in the top bar to switch between Light, Dark and System (follows your device).',
  },
  {
    id: 'assistant',
    title: 'About this assistant',
    tags: ['assistant', 'ai', 'bot', 'chat', 'claude', 'help', 'who', 'you', 'voice', 'speak', 'talk'],
    answer:
      "I'm **Ask SeatLock**. I answer questions about events, prices, seats, your tickets and how the site works, using live data you're allowed to see. With an Anthropic key I'm powered by **Claude**; otherwise I use SeatLock's built-in offline brain. Tap 🔊 to hear answers and 🎤 to speak your question. I can't book or pay for you, but I'll link you to the right page.",
  },
  {
    id: 'security',
    title: 'How SeatLock keeps things safe',
    tags: ['security', 'secure', 'safe', 'privacy', 'hack', 'protect', 'csrf', 'data'],
    answer:
      'Every request is checked twice (at the route and in the service), every refused request is audited, forms carry secret anti-forgery tokens, passwords are bcrypt-hashed, logins and posts are rate limited, uploads are verified as real images, and pages after logout are never cached.',
  },
  {
    id: 'double-booking',
    title: 'How double bookings are prevented',
    tags: ['double', 'booking', 'concurrency', 'same', 'seat', 'twice', 'race', 'lock', 'locking', 'fair'],
    answer:
      'When you hold seats, the database **locks those seat rows** (in a fixed order, so requests never deadlock), checks they are free, and saves your hold, all in one transaction. A second person asking for the same seat waits a moment and then sees it is taken. A unique index makes a double booking impossible even if code had a bug.',
  },
  {
    id: 'contact',
    title: 'Getting more help',
    tags: ['help', 'support', 'contact', 'problem', 'issue', 'bug', 'question'],
    answer:
      "Ask me anything about the site. For account problems (role changes, deactivated accounts) contact an admin. Organizers' questions about a show can go on the [Community](/community) board.",
  },
];
