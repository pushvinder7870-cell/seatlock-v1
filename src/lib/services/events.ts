import 'server-only';
import { pool, withTransaction } from '../db';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { deny, requireRole } from './authz';
import { writeAudit } from './audit';
import { parseLocal } from '../time';
import { notifyMany } from './notifications';

export const MAX_SEATS_PER_STUDENT = 4;
export const HOLD_MINUTES = 5;

export type EventStatus = 'draft' | 'published' | 'cancelled';

export type EventRow = {
  id: string;
  organizer_id: string;
  organizer_name: string;
  name: string;
  description: string | null;
  venue: string | null;
  event_date: Date;
  status: EventStatus;
  total_seats: number;
  version: number;
  updated_at: Date;
};

export type EventSummary = EventRow & {
  available: number;
  held: number;
  booked: number;
  blocked: number;
  booking_open: boolean;
};

export type SeatState = 'available' | 'held' | 'booked' | 'blocked';
export type SeatView = {
  id: string;
  number: string;
  row: string;
  index: number;
  state: SeatState;
  mine: boolean; // held/booked by the current student
  holder?: string | null; // only exposed to organizers/admins
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string, label = 'id') {
  if (!UUID_RE.test(id)) throw new NotFoundError(`Unknown ${label}.`);
}

export function isBookingOpen(e: Pick<EventRow, 'status' | 'event_date'>) {
  return e.status === 'published' && new Date(e.event_date).getTime() > Date.now();
}

const EVENT_COLUMNS = `
  e.id, e.organizer_id, o.name AS organizer_name, e.name, e.description, e.venue,
  e.event_date, e.status, e.total_seats, e.version, e.updated_at`;

async function loadEvent(eventId: string): Promise<EventRow | undefined> {
  assertUuid(eventId, 'event');
  const { rows } = await pool.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events e JOIN users o ON o.id = e.organizer_id WHERE e.id = $1`,
    [eventId]
  );
  return rows[0];
}

/**
 * Visibility rule shared by every event-scoped service:
 *  - admin: every event
 *  - organizer: only events they own (others -> 403 + ACCESS_DENIED)
 *  - student: only published events (drafts -> 404, they shouldn't know it exists)
 */
export async function getEventForUser(user: CurrentUser, eventId: string, operation: string): Promise<EventRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new NotFoundError('Event not found.');
  if (user.role === 'organizer' && event.organizer_id !== user.id) {
    await deny(user, { action: operation, eventId, targetType: 'event', targetId: eventId, reason: 'ownership' });
  }
  if (user.role === 'student' && event.status !== 'published') throw new NotFoundError('Event not found.');
  return event;
}

/** Owner-only check for organizer write operations. */
async function getOwnedEvent(user: CurrentUser, eventId: string, operation: string): Promise<EventRow> {
  await requireRole(user, ['organizer'], { action: operation, eventId, targetType: 'event', targetId: eventId });
  return getEventForUser(user, eventId, operation);
}

export async function listEvents(user: CurrentUser): Promise<EventSummary[]> {
  const filter =
    user.role === 'admin' ? 'TRUE' : user.role === 'organizer' ? 'e.organizer_id = $1' : `e.status = 'published'`;
  const { rows } = await pool.query<EventSummary>(
    `SELECT ${EVENT_COLUMNS},
            (e.status = 'published' AND e.event_date > now()) AS booking_open,
            count(*) FILTER (WHERE st.state = 'available')::int AS available,
            count(*) FILTER (WHERE st.state = 'held')::int      AS held,
            count(*) FILTER (WHERE st.state = 'booked')::int    AS booked,
            count(*) FILTER (WHERE st.state = 'blocked')::int   AS blocked
       FROM events e
       JOIN users o ON o.id = e.organizer_id
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN s.is_blocked THEN 'blocked'
                  WHEN EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active) THEN 'booked'
                  WHEN EXISTS (SELECT 1 FROM hold_seats hs JOIN holds h ON h.id = hs.hold_id
                                WHERE hs.seat_id = s.id AND hs.active AND h.expires_at > now()) THEN 'held'
                  ELSE 'available' END AS state
           FROM seats s WHERE s.event_id = e.id
       ) st ON TRUE
      WHERE ${filter}
      GROUP BY e.id, o.name
      ORDER BY e.event_date < now(), e.event_date`,
    user.role === 'organizer' ? [user.id] : []
  );
  return rows;
}

export type ActiveHold = { id: string; expires_at: Date; seats: string[] };

export type SeatMap = {
  event: EventRow;
  bookingOpen: boolean;
  seats: SeatView[];
  myHold: ActiveHold | null;
  myBookedCount: number;
};

/** Seat map with derived state. Expired holds show as available even before the sweeper runs. */
export async function getSeatMap(user: CurrentUser, eventId: string): Promise<SeatMap> {
  const event = await getEventForUser(user, eventId, 'getSeatMap');
  const staff = user.role !== 'student';
  const { rows } = await pool.query<{
    id: string;
    seat_number: string;
    row_label: string;
    seat_index: number;
    is_blocked: boolean;
    booked_by: string | null;
    booked_by_name: string | null;
    held_by: string | null;
    held_by_name: string | null;
  }>(
    `SELECT s.id, s.seat_number, s.row_label, s.seat_index, s.is_blocked,
            bs.user_id AS booked_by, bu.name AS booked_by_name,
            h.user_id  AS held_by,   hu.name AS held_by_name
       FROM seats s
       LEFT JOIN booking_seats bs ON bs.seat_id = s.id AND bs.active
       LEFT JOIN users bu ON bu.id = bs.user_id
       LEFT JOIN hold_seats hs ON hs.seat_id = s.id AND hs.active
       LEFT JOIN holds h ON h.id = hs.hold_id AND h.status = 'active' AND h.expires_at > now()
       LEFT JOIN users hu ON hu.id = h.user_id
      WHERE s.event_id = $1
      ORDER BY s.row_label, s.seat_index`,
    [eventId]
  );
  const seats: SeatView[] = rows.map((r) => {
    const state: SeatState = r.is_blocked ? 'blocked' : r.booked_by ? 'booked' : r.held_by ? 'held' : 'available';
    return {
      id: r.id,
      number: r.seat_number,
      row: r.row_label,
      index: r.seat_index,
      state,
      mine: (state === 'booked' && r.booked_by === user.id) || (state === 'held' && r.held_by === user.id),
      ...(staff ? { holder: state === 'booked' ? r.booked_by_name : state === 'held' ? r.held_by_name : null } : {}),
    };
  });

  let myHold: ActiveHold | null = null;
  let myBookedCount = 0;
  if (user.role === 'student') {
    const h = await pool.query<ActiveHold>(
      `SELECT h.id, h.expires_at, array_agg(s.seat_number ORDER BY s.row_label, s.seat_index) AS seats
         FROM holds h JOIN hold_seats hs ON hs.hold_id = h.id AND hs.active JOIN seats s ON s.id = hs.seat_id
        WHERE h.user_id = $1 AND h.event_id = $2 AND h.status = 'active' AND h.expires_at > now()
        GROUP BY h.id`,
      [user.id, eventId]
    );
    myHold = h.rows[0] ?? null;
    myBookedCount = seats.filter((s) => s.state === 'booked' && s.mine).length;
  }
  return { event, bookingOpen: isBookingOpen(event), seats, myHold, myBookedCount };
}

export async function getEventForEdit(user: CurrentUser, eventId: string) {
  return getOwnedEvent(user, eventId, 'getEventForEdit');
}

export type EventInput = {
  name: string;
  description?: string;
  venue?: string;
  eventDate: string;
  status: EventStatus;
};

function validateEventInput(input: EventInput) {
  const name = (input.name ?? '').trim();
  if (!name || name.length > 255) throw new ValidationError('Name is required (max 255 characters).');
  const date = parseLocal(input.eventDate ?? '');
  if (Number.isNaN(date.getTime())) throw new ValidationError('A valid event date/time is required.');
  if (!['draft', 'published', 'cancelled'].includes(input.status)) throw new ValidationError('Invalid status.');
  return {
    name,
    description: (input.description ?? '').trim() || null,
    venue: (input.venue ?? '').trim() || null,
    event_date: date,
    status: input.status,
  };
}

export async function createEvent(
  user: CurrentUser,
  input: EventInput & { rows: number; seatsPerRow: number }
): Promise<{ id: string }> {
  await requireRole(user, ['organizer'], { action: 'createEvent' });
  const v = validateEventInput(input);
  const rows = Math.trunc(Number(input.rows));
  const perRow = Math.trunc(Number(input.seatsPerRow));
  if (!(rows >= 1 && rows <= 26)) throw new ValidationError('Rows must be between 1 and 26.');
  if (!(perRow >= 1 && perRow <= 40)) throw new ValidationError('Seats per row must be between 1 and 40.');

  return withTransaction(async (tx) => {
    const { rows: ev } = await tx.query<{ id: string }>(
      `INSERT INTO events (organizer_id, name, description, venue, event_date, status, total_seats)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.id, v.name, v.description, v.venue, v.event_date, v.status, rows * perRow]
    );
    const id = ev[0].id;
    await tx.query(
      `INSERT INTO seats (event_id, seat_number, row_label, seat_index)
       SELECT $1, chr(64 + r) || s, chr(64 + r), s
         FROM generate_series(1, $2::int) r, generate_series(1, $3::int) s`,
      [id, rows, perRow]
    );
    await writeAudit(
      {
        action: 'EVENT_CREATED',
        actor: { id: user.id, role: user.role },
        eventId: id,
        targetType: 'event',
        targetId: id,
        details: { name: v.name, seats: rows * perRow, status: v.status },
      },
      tx
    );
    return { id };
  });
}

/**
 * Optimistic locking: the form carries the version it was rendered from and
 * the UPDATE only applies if the row still has that version. If someone else
 * saved first, zero rows match and we return 409 with the current version.
 */
export async function updateEvent(user: CurrentUser, eventId: string, input: EventInput, expectedVersion: number) {
  const current = await getOwnedEvent(user, eventId, 'updateEvent');
  const v = validateEventInput(input);
  if (!Number.isInteger(expectedVersion)) throw new ValidationError('Missing version.');

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ version: number }>(
      `UPDATE events
          SET name = $3, description = $4, venue = $5, event_date = $6, status = $7,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2
        RETURNING version`,
      [eventId, expectedVersion, v.name, v.description, v.venue, v.event_date, v.status]
    );
    if (!rows[0]) {
      const latest = await tx.query<{ version: number }>('SELECT version FROM events WHERE id = $1', [eventId]);
      throw new ConflictError(
        'VERSION_CONFLICT',
        `This event was changed by someone else while you were editing (you had version ${expectedVersion}, current is ${latest.rows[0]?.version}). Reload the page and re-apply your changes.`,
        { expectedVersion, currentVersion: latest.rows[0]?.version }
      );
    }
    // `current` was read at expectedVersion (else the UPDATE would not have matched), so this diff is exact.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const before: Record<string, unknown> = {
      name: current.name,
      description: current.description,
      venue: current.venue,
      event_date: new Date(current.event_date).toISOString(),
      status: current.status,
    };
    const after: Record<string, unknown> = { ...v, event_date: v.event_date.toISOString() };
    for (const k of Object.keys(after)) if (before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };

    await writeAudit(
      {
        action: 'EVENT_UPDATED',
        actor: { id: user.id, role: user.role },
        eventId,
        targetType: 'event',
        targetId: eventId,
        details: { fromVersion: expectedVersion, toVersion: rows[0].version, changes },
      },
      tx
    );
    // Tell every ticket holder when something they care about changed (one INSERT ... SELECT fan-out).
    const important = ['event_date', 'venue', 'status'].filter((k) => k in changes);
    if (important.length) {
      await notifyMany(
        tx,
        `SELECT DISTINCT user_id FROM bookings WHERE event_id = $1 AND status = 'confirmed'`,
        [eventId],
        {
          actorId: user.id,
          type: 'event_updated',
          title: `${v.name} was updated`,
          body: `Changed: ${important.map((k) => (k === 'event_date' ? 'date/time' : k)).join(', ')}. Check the details.`,
          link: `/events/${eventId}`,
        }
      );
    }
    return { version: rows[0].version };
  });
}

/**
 * Organizer blocks/unblocks seats on their own event. Seats are locked in a
 * stable order; booked or actively-held seats cannot be blocked (409).
 */
export async function setSeatsBlocked(user: CurrentUser, eventId: string, seatNumbers: string[], block: boolean) {
  await getOwnedEvent(user, eventId, block ? 'blockSeats' : 'unblockSeats');
  const numbers = [...new Set(seatNumbers.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  if (numbers.length === 0) throw new ValidationError('Select at least one seat.');
  if (numbers.length > 200) throw new ValidationError('Too many seats in one request.');

  return withTransaction(async (tx) => {
    const locked = await tx.query<{ id: string; seat_number: string; is_blocked: boolean }>(
      `SELECT id, seat_number, is_blocked FROM seats
        WHERE event_id = $1 AND seat_number = ANY($2::text[])
        ORDER BY id FOR UPDATE`,
      [eventId, numbers]
    );
    const found = new Set(locked.rows.map((r) => r.seat_number));
    const unknown = numbers.filter((n) => !found.has(n));
    if (unknown.length) throw new ValidationError(`Unknown seats: ${unknown.join(', ')}`, { unknownSeats: unknown });

    if (block) {
      const busy = await tx.query<{ seat_number: string; reason: string }>(
        `SELECT s.seat_number,
                CASE WHEN EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active)
                     THEN 'booked' ELSE 'held' END AS reason
           FROM seats s
          WHERE s.id = ANY($1::uuid[])
            AND (EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active)
              OR EXISTS (SELECT 1 FROM hold_seats hs JOIN holds h ON h.id = hs.hold_id
                          WHERE hs.seat_id = s.id AND hs.active AND h.status = 'active'
                            AND h.expires_at > clock_timestamp()))
          ORDER BY s.seat_number`,
        [locked.rows.map((r) => r.id)]
      );
      if (busy.rows.length) {
        throw new ConflictError(
          'SEATS_NOT_BLOCKABLE',
          `Booked or held seats cannot be blocked: ${busy.rows.map((r) => `${r.seat_number} (${r.reason})`).join(', ')}`,
          { seats: busy.rows }
        );
      }
    }
    const changed = locked.rows.filter((r) => r.is_blocked !== block).map((r) => r.id);
    if (changed.length) await tx.query('UPDATE seats SET is_blocked = $2 WHERE id = ANY($1::uuid[])', [changed, block]);
    await writeAudit(
      {
        action: block ? 'SEATS_BLOCKED' : 'SEATS_UNBLOCKED',
        actor: { id: user.id, role: user.role },
        eventId,
        targetType: 'seats',
        targetId: numbers.join(','),
        details: { seats: numbers, changed: changed.length },
      },
      tx
    );
    return { changed: changed.length };
  });
}
