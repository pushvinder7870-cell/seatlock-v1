import 'server-only';
import { randomBytes } from 'node:crypto';
import { pool } from '../db';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { deny, requireRole } from './authz';
import { writeAudit } from './audit';
import { assertUuid } from './events';
import { hit } from './ratelimit';

/*
 * DEMO PAYMENTS: no real money moves and no payment provider is called.
 *
 *  - Card numbers are validated with the LUHN checksum (the same mod-10 check
 *    banks use to catch typos), plus expiry, CVC length and brand detection
 *    from the number's prefix (IIN ranges).
 *  - Only brand + last 4 digits are stored, never the full number or CVC.
 *  - Test inputs simulate failures: card 4000 0000 0000 0002 / UPI fail@upi
 *    are "declined" (recorded as declined payments + audit, HTTP 402).
 *  - A successful payment and the booking are written in ONE transaction
 *    (inside confirmHold), so you can't pay without getting seats or get
 *    seats without paying. Re-submitting returns the same booking (idempotent).
 */

export const CONVENIENCE_FEE_RATE = 0.02; // 2% demo convenience fee

export type PaymentInput = {
  method: string;
  cardNumber?: string;
  expiry?: string; // MM/YY
  cvc?: string;
  name?: string;
  upiId?: string;
};

export type VerifiedPayment = {
  method: 'card' | 'upi';
  brand: string | null;
  last4: string | null;
  upiId: string | null;
  receiptNo: string;
};

export function formatINR(cents: number) {
  const rupees = cents / 100;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export function computeAmounts(unitCents: number, seats: number) {
  const subtotal = unitCents * seats;
  const fee = Math.round(subtotal * CONVENIENCE_FEE_RATE);
  return { subtotal, fee, total: subtotal + fee };
}

/** Luhn (mod 10): double every second digit from the right, subtract 9 if > 9, sum must be divisible by 10. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(digits)) return 'RuPay';
  return 'Card';
}

const DECLINED_CARDS: Record<string, string> = {
  '4000000000000002': 'Card declined by the issuing bank (demo test card).',
  '4000000000009995': 'Insufficient funds (demo test card).',
};

function receiptNo() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `SL-${d}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Validates the payment details. Returns a verified payment or a simulated decline reason. */
export function verifyPayment(input: PaymentInput): { ok: true; payment: VerifiedPayment } | { ok: false; reason: string; payment: VerifiedPayment } {
  if (input.method === 'upi') {
    const upi = String(input.upiId ?? '').trim().toLowerCase();
    if (!/^[a-z0-9.\-_]{2,64}@[a-z]{2,32}$/.test(upi)) throw new ValidationError('Enter a valid UPI ID, e.g. name@okaxis.');
    const payment: VerifiedPayment = { method: 'upi', brand: 'UPI', last4: null, upiId: upi, receiptNo: receiptNo() };
    return upi.startsWith('fail@') ? { ok: false, reason: 'UPI request was declined (demo test ID).', payment } : { ok: true, payment };
  }
  if (input.method !== 'card') throw new ValidationError('Choose card or UPI.');
  const digits = String(input.cardNumber ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits) || !luhnValid(digits)) throw new ValidationError('That card number is not valid. Check the digits (try 4242 4242 4242 4242).');
  const m = String(input.expiry ?? '').trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || +m[1] < 1 || +m[1] > 12) throw new ValidationError('Expiry must look like MM/YY.');
  const expiryEnd = new Date(Date.UTC(2000 + +m[2], +m[1], 1)); // first day after the expiry month
  if (expiryEnd.getTime() <= Date.now()) throw new ValidationError('This card has expired.');
  const brand = cardBrand(digits);
  const cvc = String(input.cvc ?? '').trim();
  if (!(brand === 'Amex' ? /^\d{4}$/ : /^\d{3}$/).test(cvc)) throw new ValidationError(brand === 'Amex' ? 'CVC must be 4 digits.' : 'CVC must be 3 digits.');
  if (!String(input.name ?? '').trim()) throw new ValidationError('Enter the name on the card.');
  const payment: VerifiedPayment = { method: 'card', brand, last4: digits.slice(-4), upiId: null, receiptNo: receiptNo() };
  return DECLINED_CARDS[digits] ? { ok: false, reason: DECLINED_CARDS[digits], payment } : { ok: true, payment };
}

export type CheckoutView = {
  holdId: string;
  eventId: string;
  eventName: string;
  eventDate: Date;
  venue: string | null;
  imageUrl: string | null;
  seats: string[];
  unitCents: number;
  expiresAt: Date;
  amounts: { subtotal: number; fee: number; total: number };
};

/** Data for the checkout page. Only the hold's owner may see it. */
export async function getCheckout(user: CurrentUser, holdId: string): Promise<CheckoutView> {
  await requireRole(user, ['student'], { action: 'getCheckout', targetType: 'hold', targetId: holdId });
  assertUuid(holdId, 'hold');
  const { rows } = await pool.query<{
    user_id: string; status: string; expires_at: Date; expired: boolean; event_id: string; name: string; event_date: Date;
    venue: string | null; image_url: string | null; price_cents: number; seats: string[];
  }>(
    `SELECT h.user_id, h.status, h.expires_at, h.expires_at <= now() AS expired, e.id AS event_id, e.name, e.event_date,
            e.venue, e.image_url, e.price_cents,
            coalesce(array_agg(s.seat_number ORDER BY s.row_label, s.seat_index) FILTER (WHERE s.id IS NOT NULL), '{}') AS seats
       FROM holds h JOIN events e ON e.id = h.event_id
       LEFT JOIN hold_seats hs ON hs.hold_id = h.id AND hs.active
       LEFT JOIN seats s ON s.id = hs.seat_id
      WHERE h.id = $1
      GROUP BY h.id, e.id`,
    [holdId]
  );
  const r = rows[0];
  if (!r) throw new NotFoundError('Checkout not found.');
  if (r.user_id !== user.id) await deny(user, { action: 'getCheckout', eventId: r.event_id, targetType: 'hold', targetId: holdId, reason: 'ownership' });
  if (r.status !== 'active' || r.expired) throw new ConflictError('HOLD_NOT_ACTIVE', 'This hold has expired or was already used. Please pick your seats again.');
  return {
    holdId, eventId: r.event_id, eventName: r.name, eventDate: r.event_date, venue: r.venue, imageUrl: r.image_url,
    seats: r.seats, unitCents: r.price_cents, expiresAt: r.expires_at, amounts: computeAmounts(r.price_cents, r.seats.length),
  };
}

/** Records a simulated decline (own connection, so it survives) and returns the 402 error to throw. */
export async function recordDecline(user: CurrentUser, checkout: CheckoutView, payment: VerifiedPayment, reason: string) {
  await pool.query(
    `INSERT INTO payments (receipt_no, user_id, event_id, hold_id, seats, unit_cents, fee_cents, amount_cents, method, card_brand, card_last4, upi_id, status, decline_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'declined', $13)`,
    [payment.receiptNo, user.id, checkout.eventId, checkout.holdId, checkout.seats.length, checkout.unitCents, checkout.amounts.fee, checkout.amounts.total,
      payment.method, payment.brand, payment.last4, payment.upiId, reason]
  );
  await writeAudit({
    action: 'PAYMENT_DECLINED',
    actor: { id: user.id, role: user.role },
    eventId: checkout.eventId,
    targetType: 'hold',
    targetId: checkout.holdId,
    details: { amount: checkout.amounts.total, method: payment.method, brand: payment.brand, last4: payment.last4, reason },
  });
  return new AppError(402, 'PAYMENT_DECLINED', reason);
}

export async function paymentRateLimit(user: CurrentUser) {
  await hit(`pay:${user.id}`, 10, 600, 'Too many payment attempts. Wait a few minutes and try again.');
}

export type TicketView = {
  bookingId: string;
  status: 'confirmed' | 'cancelled';
  createdAt: Date;
  checkedInAt: Date | null;
  holderName: string;
  holderEmail: string;
  eventId: string;
  eventName: string;
  eventDate: Date;
  venue: string | null;
  imageUrl: string | null;
  seats: string[];
  payment: {
    receiptNo: string; status: string; method: string; brand: string | null; last4: string | null; upiId: string | null;
    seats: number; unitCents: number; feeCents: number; amountCents: number; createdAt: Date; refundedAt: Date | null;
  } | null;
};

/** A ticket + receipt. Visible to its owner, the event's organizer and admins. */
export async function getTicket(user: CurrentUser, bookingId: string): Promise<TicketView> {
  assertUuid(bookingId, 'booking');
  const { rows } = await pool.query<{
    id: string; status: 'confirmed' | 'cancelled'; created_at: Date; checked_in_at: Date | null; user_id: string; holder_name: string; holder_email: string;
    event_id: string; organizer_id: string; event_name: string; event_date: Date; venue: string | null; image_url: string | null; seats: string[];
  }>(
    `SELECT b.id, b.status, b.created_at, b.checked_in_at, b.user_id, u.name AS holder_name, u.email AS holder_email,
            e.id AS event_id, e.organizer_id, e.name AS event_name, e.event_date, e.venue, e.image_url,
            array_agg(s.seat_number ORDER BY s.row_label, s.seat_index) AS seats
       FROM bookings b JOIN users u ON u.id = b.user_id JOIN events e ON e.id = b.event_id
       JOIN booking_seats bs ON bs.booking_id = b.id JOIN seats s ON s.id = bs.seat_id
      WHERE b.id = $1 GROUP BY b.id, u.id, e.id`,
    [bookingId]
  );
  const t = rows[0];
  if (!t) throw new NotFoundError('Ticket not found.');
  const allowed = t.user_id === user.id || user.role === 'admin' || (user.role === 'organizer' && t.organizer_id === user.id);
  if (!allowed) await deny(user, { action: 'getTicket', eventId: t.event_id, targetType: 'booking', targetId: bookingId, reason: 'ownership' });
  const p = await pool.query<{
    receipt_no: string; status: string; method: string; card_brand: string | null; card_last4: string | null; upi_id: string | null;
    seats: number; unit_cents: number; fee_cents: number; amount_cents: number; created_at: Date; refunded_at: Date | null;
  }>(`SELECT * FROM payments WHERE booking_id = $1 AND status IN ('paid', 'refunded') LIMIT 1`, [bookingId]);
  const pay = p.rows[0];
  return {
    bookingId: t.id, status: t.status, createdAt: t.created_at, checkedInAt: t.checked_in_at, holderName: t.holder_name, holderEmail: t.holder_email,
    eventId: t.event_id, eventName: t.event_name, eventDate: t.event_date, venue: t.venue, imageUrl: t.image_url, seats: t.seats,
    payment: pay
      ? {
          receiptNo: pay.receipt_no, status: pay.status, method: pay.method, brand: pay.card_brand, last4: pay.card_last4, upiId: pay.upi_id,
          seats: pay.seats, unitCents: pay.unit_cents, feeCents: pay.fee_cents, amountCents: pay.amount_cents, createdAt: pay.created_at, refundedAt: pay.refunded_at,
        }
      : null,
  };
}
