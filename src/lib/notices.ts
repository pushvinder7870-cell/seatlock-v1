// Success flash messages are passed as codes (?notice=hold_created), never as
// free text, so a crafted link cannot put arbitrary text on the page.
export const NOTICES: Record<string, string> = {
  hold_created: 'Seats held for 5 minutes. Confirm before the timer runs out.',
  booking_confirmed: 'Booking confirmed. See you at the show!',
  hold_released: 'Hold released. The seats are available to others again.',
  booking_cancelled: 'Booking cancelled and seats released.',
  checked_in: 'Attendee checked in.',
  event_created: 'Event created.',
  event_saved: 'Event saved.',
  seats_blocked: 'Seats blocked.',
  seats_unblocked: 'Seats unblocked.',
  user_updated: 'User updated. Their existing sessions were signed out.',
  logged_out: 'You have been logged out.',
  post_created: 'Posted to the community board.',
  post_deleted: 'Post removed.',
  post_pinned: 'Post pinned to the top.',
  post_unpinned: 'Post unpinned.',
  comment_created: 'Comment added.',
  comment_deleted: 'Comment removed.',
  payment_success: 'Payment successful! Your seats are booked. 🎉',
  review_saved: 'Thanks! Your review is live.',
  review_deleted: 'Review removed.',
};

export function noticeText(code: string | string[] | undefined): string | null {
  return typeof code === 'string' ? NOTICES[code] ?? null : null;
}
