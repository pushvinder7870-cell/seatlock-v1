import 'server-only';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  toAppError,
} from '../errors';
import type { CurrentUser } from '../session';
import { deny, requireRole } from './authz';
import { writeAudit } from './audit';
import { notify } from './notifications';
import {
  HOLD_MINUTES,
  MAX_SEATS_PER_STUDENT,
  assertUuid,
  getEventForUser,
  isBookingOpen,
} from './events';

/*
 * LOCKING STRATEGY (see README for the full rationale)
 *
 *  - Every state change happens in ONE transaction (READ COMMITTED) with
 *    `SET LOCAL lock_timeout = '2s'` (see withTransaction).
 *  - The seat row is the mutex: `SELECT ... FROM seats ... ORDER BY id FOR UPDATE`.
 *    Sorting by id gives every transaction the same lock order, so two
 *    requests for overlapping seat sets queue up instead of deadlocking.
 *  - Global lock order everywhere: seats (by id) -> holds row -> bookings row.
 *  - Availability (including hold expiry, via clock_timestamp()) is checked
 *    only AFTER the locks are held, so the check and the write are atomic.
 *  - Partial unique indexes are the safety net if a bug ever skipped a lock:
 *      hold_seats(seat_id) WHERE active
 *      booking_seats(seat_id) WHERE active
 *      holds(user_id, event_id) WHERE status = 'active'
 *  - The critical section contains only a handful of indexed statements; no
 *    network calls or rendering happen while locks are held.
 */

const SEAT_RE = /^[A-Z]{1,2}\d{1,3}$/;

type HoldOk = { kind: 'ok'; holdId: string; expiresAt: Date; seats: string[]; replacedHoldId: string | null };
type HoldRejected = { kind: 'rejected'; unavailable: { seat: string; reason: string }[] };

function actorOf(user: CurrentUser) {
  return { id: user.id, role: user.role };
}

/** Marks holds expired (if still active), frees their seats and audits each one, inside `tx`. */
async function expireHoldsTx(tx: PoolClient, holdIds: string[], reason: string) {
  if (holdIds.length === 0) return;
  const { rows } = await tx.query<{ id: string; user_id: string; event_id: string }>(
    `UPDATE holds SET status = 'expired' WHERE id = ANY($1::uuid[]) AND status = 'active'
     RETURNING id, user_id, event_id`,
    [holdIds]
  );
  await tx.query('UPDATE hold_seats SET active = FALSE WHERE hold_id = ANY($1::uuid[]) AND active', [holdIds]);
  for (const h of rows) {
    await writeAudit(
      {
        action: 'HOLD_EXPIRED',
        actor: null,
        eventId: h.event_id,
        targetType: 'hold',
        targetId: h.id,
        details: { holdOwner: h.user_id, reason },
      },
      tx
    );
  }
}

function unavailableError(unavailable: { seat: string; reason: string }[]) {
  return new ConflictError(
    'SEATS_UNAVAILABLE',
    `These seats are not available: ${unavailable.map((u) => `${u.seat} (${u.reason})`).join(', ')}. No seats were held.`,
    { unavailableSeats: unavailable }
  );
}

/** Rejection found by the unlocked pre-check: audit it, then 409. */
async function rejectHold(
  user: CurrentUser,
  eventId: string,
  seats: string[],
  unavailable: { seat: string; reason: string }[],
  stage: string
): Promise<never> {
  await writeAudit({
    action: 'SEAT_HOLD_REJECTED',
    actor: actorOf(user),
    eventId,
    targetType: 'seats',
    targetId: seats.join(','),
    details: { seats, code: 'SEATS_UNAVAILABLE', status: 409, unavailable, stage },
  });
  throw unavailableError(unavailable);
}

async function auditHoldRejected(user: CurrentUser, eventId: string, seats: string[], err: AppError) {
  await writeAudit({
    action: 'SEAT_HOLD_REJECTED',
    actor: actorOf(user),
    eventId,
    targetType: 'seats',
    targetId: seats.join(','),
    details: { seats, code: err.code, status: err.status, message: err.message, ...err.extra },
  });
}

/**
 * Hold 1-4 seats for 5 minutes, all-or-nothing. A new hold replaces the
 * student's previous active hold for the same event.
 *   201 -> hold created
 *   409 -> SEATS_UNAVAILABLE (lists every unavailable seat) / BOOKING_CLOSED / HOLD_IN_PROGRESS
 *   422 -> SEAT_LIMIT (would exceed 4 booked+held seats)
 *   503 -> LOCK_TIMEOUT
 */
export async function holdSeats(user: CurrentUser, eventId: string, seatNumbers: string[]) {
  await requireRole(user, ['student'], { action: 'holdSeats', eventId, targetType: 'event', targetId: eventId });
  const event = await getEventForUser(user, eventId, 'holdSeats');

  const seats = [...new Set((seatNumbers ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  try {
    if (seats.length < 1 || seats.length > MAX_SEATS_PER_STUDENT) {
      throw new ValidationError(`Select between 1 and ${MAX_SEATS_PER_STUDENT} seats.`);
    }
    const bad = seats.filter((s) => !SEAT_RE.test(s));
    if (bad.length) throw new ValidationError(`Invalid seat numbers: ${bad.join(', ')}`);
    if (!isBookingOpen(event)) {
      throw new ConflictError('BOOKING_CLOSED', 'Booking for this event is closed.');
    }

    // Read (unlocked) which hold we expect to replace, so its seats can be
    // locked in the same ordered statement as the requested ones.
    const prev = await pool.query<{ id: string; seat_ids: string[] }>(
      `SELECT h.id, coalesce(array_agg(hs.seat_id) FILTER (WHERE hs.seat_id IS NOT NULL), '{}') AS seat_ids
         FROM holds h LEFT JOIN hold_seats hs ON hs.hold_id = h.id AND hs.active
        WHERE h.user_id = $1 AND h.event_id = $2 AND h.status = 'active'
        GROUP BY h.id`,
      [user.id, eventId]
    );
    const prevHold = prev.rows[0] ?? null;

    // Fast path (no locks): reject seats that are already clearly taken
    // without queueing on their row locks. A stale read here can only cause a
    // false *rejection* (user retries); it can never grant a seat, because
    // granting only happens after the locked re-check below. This keeps losers
    // out of the critical section during a stampede.
    const pre = await pool.query<{ seat_number: string; reason: string | null }>(
      `SELECT s.seat_number,
              CASE WHEN s.is_blocked THEN 'blocked'
                   WHEN EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active) THEN 'booked'
                   WHEN EXISTS (SELECT 1 FROM hold_seats hs JOIN holds h ON h.id = hs.hold_id
                                 WHERE hs.seat_id = s.id AND hs.active AND h.status = 'active'
                                   AND h.expires_at > clock_timestamp() AND h.user_id <> $3) THEN 'held'
              END AS reason
         FROM seats s
        WHERE s.event_id = $1 AND s.seat_number = ANY($2::text[])
        ORDER BY s.seat_number`,
      [eventId, seats, user.id]
    );
    const preUnavailable = pre.rows.filter((r) => r.reason).map((r) => ({ seat: r.seat_number, reason: r.reason! }));
    if (preUnavailable.length) return rejectHold(user, eventId, seats, preUnavailable, 'pre_check');

    const result = await withTransaction<HoldOk | HoldRejected>(async (tx) => {
      // 1. Lock requested seats + seats of the hold being replaced, in id order.
      const locked = await tx.query<{ id: string; seat_number: string }>(
        `SELECT id, seat_number FROM seats
          WHERE event_id = $1 AND (seat_number = ANY($2::text[]) OR id = ANY($3::uuid[]))
          ORDER BY id
          FOR UPDATE`,
        [eventId, seats, prevHold?.seat_ids ?? []]
      );
      const requested = locked.rows.filter((r) => seats.includes(r.seat_number));
      if (requested.length !== seats.length) {
        const found = new Set(requested.map((r) => r.seat_number));
        throw new ValidationError(`Unknown seats: ${seats.filter((s) => !found.has(s)).join(', ')}`);
      }

      // 2. Lock this student's current active hold and make sure it is the one we planned around.
      const own = await tx.query<{ id: string; expired: boolean }>(
        `SELECT id, expires_at <= clock_timestamp() AS expired FROM holds
          WHERE user_id = $1 AND event_id = $2 AND status = 'active' FOR UPDATE`,
        [user.id, eventId]
      );
      const ownHold = own.rows[0] ?? null;
      if (ownHold && ownHold.id !== prevHold?.id) {
        throw new ConflictError('HOLD_IN_PROGRESS', 'Another hold request of yours is in progress. Please retry.');
      }

      // 3. Availability, evaluated while we hold the seat locks.
      const state = await tx.query<{
        seat_number: string;
        is_blocked: boolean;
        booked: boolean;
        hold_id: string | null;
        hold_live: boolean | null;
      }>(
        `SELECT s.seat_number, s.is_blocked,
                EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active) AS booked,
                hs.hold_id,
                (h.status = 'active' AND h.expires_at > clock_timestamp()) AS hold_live
           FROM seats s
           LEFT JOIN hold_seats hs ON hs.seat_id = s.id AND hs.active
           LEFT JOIN holds h ON h.id = hs.hold_id
          WHERE s.id = ANY($1::uuid[])
          ORDER BY s.seat_number`,
        [requested.map((r) => r.id)]
      );
      const unavailable: { seat: string; reason: string }[] = [];
      const staleHolds = new Set<string>();
      for (const s of state.rows) {
        if (s.is_blocked) unavailable.push({ seat: s.seat_number, reason: 'blocked' });
        else if (s.booked) unavailable.push({ seat: s.seat_number, reason: 'booked' });
        else if (s.hold_id && s.hold_id !== ownHold?.id) {
          if (s.hold_live) unavailable.push({ seat: s.seat_number, reason: 'held' });
          else staleHolds.add(s.hold_id); // expired hold: reclaim it
        }
      }

      // Expired holds found under lock are released now (and audited) even if this request is rejected.
      await expireHoldsTx(tx, [...staleHolds], 'expired_reclaimed_on_hold');

      if (unavailable.length) {
        await writeAudit(
          {
            action: 'SEAT_HOLD_REJECTED',
            actor: actorOf(user),
            eventId,
            targetType: 'seats',
            targetId: seats.join(','),
            details: { seats, code: 'SEATS_UNAVAILABLE', status: 409, unavailable, stage: 'locked_check' },
          },
          tx
        );
        return { kind: 'rejected', unavailable };
      }

      // 4. Merge with the student's current (unexpired) hold: new seats are ADDED,
      //    previously held seats are kept. Still one active hold per student per event.
      const keptIds = ownHold && !ownHold.expired ? (prevHold?.seat_ids ?? []) : [];
      const combinedIds = [...new Set([...keptIds, ...requested.map((r) => r.id)])];
      const numberOf = new Map(locked.rows.map((r) => [r.id, r.seat_number]));
      const combinedSeats = combinedIds.map((id) => numberOf.get(id)!).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // 5. Business rule: booked + held (after merge) <= 4. Over the limit → 422 and
      //    NOTHING changes: the existing hold and bookings are left untouched.
      const booked = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM booking_seats WHERE user_id = $1 AND event_id = $2 AND active`,
        [user.id, eventId]
      );
      if (booked.rows[0].n + combinedIds.length > MAX_SEATS_PER_STUDENT) {
        const held = keptIds.length;
        throw new BusinessRuleError(
          'SEAT_LIMIT',
          `A student may have at most ${MAX_SEATS_PER_STUDENT} seats per event. You have ${booked.rows[0].n} booked and ${held} on hold, so you can add ${Math.max(0, MAX_SEATS_PER_STUDENT - booked.rows[0].n - held)} more. Your current seats were kept.`,
          { booked: booked.rows[0].n, held, requested: seats.length }
        );
      }

      // 6. Retire the previous hold record (its seats move into the merged hold).
      if (ownHold) {
        await tx.query(`UPDATE holds SET status = $2 WHERE id = $1`, [ownHold.id, ownHold.expired ? 'expired' : 'replaced']);
        await tx.query('UPDATE hold_seats SET active = FALSE WHERE hold_id = $1 AND active', [ownHold.id]);
      }

      // 7. Create the merged hold (fresh 5-minute timer).
      const hold = await tx.query<{ id: string; expires_at: Date }>(
        `INSERT INTO holds (user_id, event_id, expires_at)
         VALUES ($1, $2, clock_timestamp() + make_interval(mins => $3))
         RETURNING id, expires_at`,
        [user.id, eventId, HOLD_MINUTES]
      );
      const holdId = hold.rows[0].id;
      await tx.query(
        `INSERT INTO hold_seats (hold_id, seat_id, event_id)
         SELECT $1, unnest($2::uuid[]), $3`,
        [holdId, combinedIds, eventId]
      );
      await writeAudit(
        {
          action: 'SEAT_HOLD',
          actor: actorOf(user),
          eventId,
          targetType: 'hold',
          targetId: holdId,
          details: { seats: combinedSeats, added: seats, expiresAt: hold.rows[0].expires_at, mergedFromHoldId: ownHold?.id ?? null },
        },
        tx
      );
      return { kind: 'ok', holdId, expiresAt: hold.rows[0].expires_at, seats: combinedSeats, replacedHoldId: ownHold?.id ?? null };
    });

    if (result.kind === 'rejected') throw unavailableError(result.unavailable);
    return {
      holdId: result.holdId,
      expiresAt: result.expiresAt,
      seats: result.seats,
      replacedHoldId: result.replacedHoldId,
    };
  } catch (e) {
    const err = toAppError(e);
    // SEATS_UNAVAILABLE was already audited inside its transaction; everything else
    // (validation, closed, limit, lock timeout, unique-index safety net) is audited here.
    if (err.code !== 'SEATS_UNAVAILABLE' && !(err instanceof ForbiddenError)) {
      await auditHoldRejected(user, eventId, seats, err).catch((auditErr) => console.error(auditErr));
    }
    throw err;
  }
}

async function loadHold(user: CurrentUser, holdId: string, operation: string) {
  assertUuid(holdId, 'hold');
  const { rows } = await pool.query<{ id: string; user_id: string; event_id: string; status: string }>(
    'SELECT id, user_id, event_id, status FROM holds WHERE id = $1',
    [holdId]
  );
  const hold = rows[0];
  if (!hold) throw new NotFoundError('Hold not found.');
  if (hold.user_id !== user.id) {
    await deny(user, { action: operation, eventId: hold.event_id, targetType: 'hold', targetId: holdId, reason: 'ownership' });
  }
  return hold;
}

/**
 * Confirm the student's own, unexpired hold into a booking.
 * Idempotent: confirming an already-confirmed hold returns the same booking.
 */
export async function confirmHold(user: CurrentUser, holdId: string) {
  await requireRole(user, ['student'], { action: 'confirmHold', targetType: 'hold', targetId: holdId });
  const hold = await loadHold(user, holdId, 'confirmHold');

  type R =
    | { kind: 'ok'; bookingId: string; seats: string[]; alreadyConfirmed: boolean }
    | { kind: 'expired' };

  const result = await withTransaction<R>(async (tx) => {
    // Lock order: seats (by id) -> hold.
    const seats = await tx.query<{ id: string; seat_number: string; is_blocked: boolean }>(
      `SELECT s.id, s.seat_number, s.is_blocked
         FROM seats s JOIN hold_seats hs ON hs.seat_id = s.id
        WHERE hs.hold_id = $1
        ORDER BY s.id
        FOR UPDATE OF s`,
      [holdId]
    );
    const h = await tx.query<{ status: string; expired: boolean; open: boolean }>(
      `SELECT h.status, h.expires_at <= clock_timestamp() AS expired,
              (e.status = 'published' AND e.event_date > clock_timestamp()) AS open
         FROM holds h JOIN events e ON e.id = h.event_id
        WHERE h.id = $1
        FOR UPDATE OF h`,
      [holdId]
    );
    const cur = h.rows[0];
    const seatNumbers = seats.rows.map((s) => s.seat_number).sort();

    if (cur.status === 'confirmed') {
      const b = await tx.query<{ id: string }>('SELECT id FROM bookings WHERE hold_id = $1', [holdId]);
      return { kind: 'ok', bookingId: b.rows[0].id, seats: seatNumbers, alreadyConfirmed: true };
    }
    if (cur.status !== 'active') {
      throw new ConflictError('HOLD_NOT_ACTIVE', `This hold is no longer active (${cur.status}). Please select seats again.`);
    }
    if (cur.expired) {
      await expireHoldsTx(tx, [holdId], 'expired_on_confirm');
      return { kind: 'expired' }; // commit the expiry + audit, then report 409
    }
    if (!cur.open) throw new ConflictError('BOOKING_CLOSED', 'Booking for this event is closed.');
    if (seats.rows.some((s) => s.is_blocked)) {
      throw new ConflictError('SEATS_UNAVAILABLE', 'One of the held seats was blocked by the organizer.');
    }

    const booked = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM booking_seats WHERE user_id = $1 AND event_id = $2 AND active',
      [user.id, hold.event_id]
    );
    if (booked.rows[0].n + seats.rows.length > MAX_SEATS_PER_STUDENT) {
      throw new BusinessRuleError(
        'SEAT_LIMIT',
        `Confirming would give you more than ${MAX_SEATS_PER_STUDENT} seats for this event.`
      );
    }

    const b = await tx.query<{ id: string }>(
      `INSERT INTO bookings (user_id, event_id, hold_id) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, hold.event_id, holdId]
    );
    const bookingId = b.rows[0].id;
    // booking_seats_one_active_per_seat is the safety net here (23505 -> 409).
    await tx.query(
      `INSERT INTO booking_seats (booking_id, seat_id, event_id, user_id)
       SELECT $1, unnest($2::uuid[]), $3, $4`,
      [bookingId, seats.rows.map((s) => s.id), hold.event_id, user.id]
    );
    await tx.query(`UPDATE holds SET status = 'confirmed' WHERE id = $1`, [holdId]);
    await tx.query('UPDATE hold_seats SET active = FALSE WHERE hold_id = $1', [holdId]);
    await writeAudit(
      {
        action: 'BOOKING_CONFIRMED',
        actor: actorOf(user),
        eventId: hold.event_id,
        targetType: 'booking',
        targetId: bookingId,
        details: { holdId, seats: seatNumbers },
      },
      tx
    );
    await notify(
      { userId: user.id, type: 'booking_confirmed', title: `Booking confirmed: ${seatNumbers.join(', ')}`, body: 'Your tickets are in My tickets.', link: '/my/bookings' },
      tx
    );
    return { kind: 'ok', bookingId, seats: seatNumbers, alreadyConfirmed: false };
  });

  if (result.kind === 'expired') {
    throw new ConflictError('HOLD_EXPIRED', 'Your 5-minute hold expired and the seats were released. Please select seats again.');
  }
  return {
    bookingId: result.bookingId,
    seats: result.seats,
    alreadyConfirmed: result.alreadyConfirmed,
    eventId: hold.event_id,
  };
}

/** Student gives up their own hold early. Idempotent. */
export async function releaseHold(user: CurrentUser, holdId: string) {
  await requireRole(user, ['student'], { action: 'releaseHold', targetType: 'hold', targetId: holdId });
  const hold = await loadHold(user, holdId, 'releaseHold');
  await withTransaction(async (tx) => {
    await tx.query(
      `SELECT s.id FROM seats s JOIN hold_seats hs ON hs.seat_id = s.id
        WHERE hs.hold_id = $1 ORDER BY s.id FOR UPDATE OF s`,
      [holdId]
    );
    const upd = await tx.query(
      `UPDATE holds SET status = 'released' WHERE id = $1 AND status = 'active' RETURNING id`,
      [holdId]
    );
    if (upd.rowCount) {
      await tx.query('UPDATE hold_seats SET active = FALSE WHERE hold_id = $1 AND active', [holdId]);
      await writeAudit(
        { action: 'HOLD_RELEASED', actor: actorOf(user), eventId: hold.event_id, targetType: 'hold', targetId: holdId },
        tx
      );
    }
  });
  return { eventId: hold.event_id };
}

/** Student cancels their own booking before the event starts. Idempotent. */
export async function cancelBooking(user: CurrentUser, bookingId: string) {
  await requireRole(user, ['student'], { action: 'cancelBooking', targetType: 'booking', targetId: bookingId });
  assertUuid(bookingId, 'booking');
  const { rows } = await pool.query<{ user_id: string; event_id: string; status: string }>(
    'SELECT user_id, event_id, status FROM bookings WHERE id = $1',
    [bookingId]
  );
  const booking = rows[0];
  if (!booking) throw new NotFoundError('Booking not found.');
  if (booking.user_id !== user.id) {
    await deny(user, { action: 'cancelBooking', eventId: booking.event_id, targetType: 'booking', targetId: bookingId, reason: 'ownership' });
  }

  return withTransaction(async (tx) => {
    const seats = await tx.query<{ seat_number: string }>(
      `SELECT s.seat_number FROM seats s JOIN booking_seats bs ON bs.seat_id = s.id
        WHERE bs.booking_id = $1 ORDER BY s.id FOR UPDATE OF s`,
      [bookingId]
    );
    const b = await tx.query<{ status: string; checked_in: boolean; started: boolean }>(
      `SELECT b.status, b.checked_in_at IS NOT NULL AS checked_in, e.event_date <= clock_timestamp() AS started
         FROM bookings b JOIN events e ON e.id = b.event_id
        WHERE b.id = $1 FOR UPDATE OF b`,
      [bookingId]
    );
    const cur = b.rows[0];
    if (cur.status === 'cancelled') return { eventId: booking.event_id, alreadyCancelled: true };
    if (cur.started) throw new ConflictError('EVENT_STARTED', 'The event has started; bookings can no longer be cancelled.');
    if (cur.checked_in) throw new ConflictError('CHECKED_IN', 'Checked-in bookings cannot be cancelled.');

    await tx.query(`UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [bookingId]);
    await tx.query('UPDATE booking_seats SET active = FALSE WHERE booking_id = $1', [bookingId]);
    await writeAudit(
      {
        action: 'BOOKING_CANCELLED',
        actor: actorOf(user),
        eventId: booking.event_id,
        targetType: 'booking',
        targetId: bookingId,
        details: { seats: seats.rows.map((s) => s.seat_number).sort() },
      },
      tx
    );
    return { eventId: booking.event_id, alreadyCancelled: false };
  });
}

export type BookingView = {
  id: string;
  event_id: string;
  event_name: string;
  event_date: Date;
  venue: string | null;
  status: 'confirmed' | 'cancelled';
  created_at: Date;
  cancelled_at: Date | null;
  checked_in_at: Date | null;
  seats: string[];
  can_cancel: boolean;
};

export async function listMyBookings(user: CurrentUser): Promise<BookingView[]> {
  await requireRole(user, ['student'], { action: 'listMyBookings' });
  const { rows } = await pool.query<BookingView>(
    `SELECT b.id, b.event_id, e.name AS event_name, e.event_date, e.venue, b.status,
            b.created_at, b.cancelled_at, b.checked_in_at,
            array_agg(s.seat_number ORDER BY s.row_label, s.seat_index) AS seats,
            (b.status = 'confirmed' AND b.checked_in_at IS NULL AND e.event_date > now()) AS can_cancel
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN seats s ON s.id = bs.seat_id
      WHERE b.user_id = $1
      GROUP BY b.id, e.id
      ORDER BY b.status, e.event_date, b.created_at DESC`,
    [user.id]
  );
  return rows;
}

export type AttendeeView = {
  id: string;
  student_name: string;
  student_email: string;
  status: 'confirmed' | 'cancelled';
  created_at: Date;
  checked_in_at: Date | null;
  checked_in_by_name: string | null;
  seats: string[];
};

export async function listEventBookings(user: CurrentUser, eventId: string) {
  await requireRole(user, ['organizer', 'admin'], { action: 'listEventBookings', eventId, targetType: 'event', targetId: eventId });
  const event = await getEventForUser(user, eventId, 'listEventBookings');
  const { rows } = await pool.query<AttendeeView>(
    `SELECT b.id, u.name AS student_name, u.email AS student_email, b.status, b.created_at,
            b.checked_in_at, cu.name AS checked_in_by_name,
            array_agg(s.seat_number ORDER BY s.row_label, s.seat_index) AS seats
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       LEFT JOIN users cu ON cu.id = b.checked_in_by
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN seats s ON s.id = bs.seat_id
      WHERE b.event_id = $1
      GROUP BY b.id, u.id, cu.name
      ORDER BY b.status, min(s.row_label), min(s.seat_index)`,
    [eventId]
  );
  return { event, attendees: rows };
}

/** Organizer (own events) or admin checks an attendee in. */
export async function checkIn(user: CurrentUser, bookingId: string) {
  await requireRole(user, ['organizer', 'admin'], { action: 'checkIn', targetType: 'booking', targetId: bookingId });
  assertUuid(bookingId, 'booking');
  const { rows } = await pool.query<{ event_id: string; organizer_id: string; user_id: string; event_name: string }>(
    'SELECT b.event_id, e.organizer_id, b.user_id, e.name AS event_name FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = $1',
    [bookingId]
  );
  const b = rows[0];
  if (!b) throw new NotFoundError('Booking not found.');
  if (user.role === 'organizer' && b.organizer_id !== user.id) {
    await deny(user, { action: 'checkIn', eventId: b.event_id, targetType: 'booking', targetId: bookingId, reason: 'ownership' });
  }
  return withTransaction(async (tx) => {
    const upd = await tx.query(
      `UPDATE bookings SET checked_in_at = now(), checked_in_by = $2
        WHERE id = $1 AND status = 'confirmed' AND checked_in_at IS NULL RETURNING id`,
      [bookingId, user.id]
    );
    if (!upd.rowCount) {
      const cur = await tx.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingId]);
      throw cur.rows[0]?.status === 'cancelled'
        ? new ConflictError('BOOKING_CANCELLED', 'This booking was cancelled.')
        : new ConflictError('ALREADY_CHECKED_IN', 'This attendee is already checked in.');
    }
    await writeAudit(
      { action: 'CHECKIN', actor: actorOf(user), eventId: b.event_id, targetType: 'booking', targetId: bookingId },
      tx
    );
    await notify(
      { userId: b.user_id, actorId: user.id, type: 'checked_in', title: `You're checked in to ${b.event_name} 🎉`, body: 'Enjoy the show! You can review it afterwards.', link: '/reviews' },
      tx
    );
    return { eventId: b.event_id };
  });
}

/**
 * Background sweeper: expires holds past their 5 minutes and audits
 * HOLD_EXPIRED. SKIP LOCKED means it never waits on (or blocks) a request
 * that is currently working with that hold.
 */
export async function expireStaleHolds(batch = 200): Promise<number> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM holds
        WHERE status = 'active' AND expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [batch]
    );
    await expireHoldsTx(tx, rows.map((r) => r.id), 'expired_by_sweeper');
    return rows.length;
  });
}
