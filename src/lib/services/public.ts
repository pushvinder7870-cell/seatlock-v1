import 'server-only';
import { pool } from '../db';

/*
 * Data for the public landing page (no login). Only PUBLISHED events and
 * anonymised review snippets (first name only) are exposed.
 */

export type PublicEvent = {
  id: string;
  name: string;
  venue: string | null;
  event_date: Date;
  price_cents: number;
  image_url: string | null;
  total_seats: number;
  available: number;
  booking_open: boolean;
};

export async function listPublicEvents(): Promise<PublicEvent[]> {
  const { rows } = await pool.query<PublicEvent>(
    `SELECT e.id, e.name, e.venue, e.event_date, e.price_cents, e.image_url, e.total_seats,
            (e.event_date > now()) AS booking_open,
            (SELECT count(*) FROM seats s
              WHERE s.event_id = e.id AND NOT s.is_blocked
                AND NOT EXISTS (SELECT 1 FROM booking_seats bs WHERE bs.seat_id = s.id AND bs.active)
                AND NOT EXISTS (SELECT 1 FROM hold_seats hs JOIN holds h ON h.id = hs.hold_id
                                 WHERE hs.seat_id = s.id AND hs.active AND h.status = 'active' AND h.expires_at > now()))::int AS available
       FROM events e
      WHERE e.status = 'published'
      ORDER BY (e.event_date < now()), e.event_date
      LIMIT 12`
  );
  return rows;
}

export type PublicReview = { first_name: string; rating: number; body: string; event_name: string };

export async function listPublicReviews(): Promise<PublicReview[]> {
  const { rows } = await pool.query<PublicReview>(
    `SELECT split_part(u.name, ' ', 1) AS first_name, r.rating, left(r.body, 180) AS body, e.name AS event_name
       FROM reviews r JOIN users u ON u.id = r.author_id JOIN events e ON e.id = r.event_id
      WHERE r.deleted_at IS NULL AND e.status = 'published' AND r.rating >= 3
      ORDER BY r.rating DESC, r.updated_at DESC LIMIT 10`
  );
  return rows;
}

export async function publicStats() {
  const { rows } = await pool.query<{ events: number; seats: number; booked: number; students: number }>(
    `SELECT (SELECT count(*) FROM events WHERE status = 'published')::int AS events,
            (SELECT coalesce(sum(total_seats), 0) FROM events WHERE status = 'published')::int AS seats,
            (SELECT count(*) FROM booking_seats WHERE active)::int AS booked,
            (SELECT count(*) FROM users WHERE role = 'student' AND is_active)::int AS students`
  );
  return rows[0];
}
