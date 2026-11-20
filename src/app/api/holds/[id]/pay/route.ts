import { apiRoute, str } from '@/lib/http';
import { payAndConfirm } from '@/lib/services/booking';

/**
 * Demo checkout. POST { method: "card"|"upi", cardNumber, expiry, cvc, name | upiId }
 * → 201 { bookingId, receiptNo, amountCents } | 400 invalid details | 402 declined | 409 hold expired
 */
export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const r = await payAndConfirm(user, params.id, {
    method: str(body, 'method') || 'card',
    cardNumber: str(body, 'cardNumber'),
    expiry: str(body, 'expiry'),
    cvc: str(body, 'cvc'),
    name: str(body, 'name'),
    upiId: str(body, 'upiId'),
  });
  return { status: r.alreadyConfirmed ? 200 : 201, json: r, redirect: `/tickets/${r.bookingId}`, notice: 'payment_success' };
});
