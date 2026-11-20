import 'server-only';
import { pool } from '../db';
import type { CurrentUser } from '../session';

export type SidebarInfo = {
  next: { label: string; name: string; href: string; at: string } | null;
  stats: { label: string; value: string }[];
};

/** Small, role-aware facts for the sidebar widgets (next show countdown + quick stats). */
export async function getSidebarInfo(user: CurrentUser): Promise<SidebarInfo> {
  if (user.role === 'student') {
    const [next, stats] = await Promise.all([
      pool.query<{ id: string; name: string; event_date: Date }>(
        `SELECT e.id, e.name, e.event_date FROM bookings b JOIN events e ON e.id = b.event_id
          WHERE b.user_id = $1 AND b.status = 'confirmed' AND e.event_date > now() ORDER BY e.event_date LIMIT 1`,
        [user.id]
      ),
      pool.query<{ tickets: number; seats: number; posts: number }>(
        `SELECT (SELECT count(*) FROM bookings WHERE user_id = $1 AND status = 'confirmed')::int AS tickets,
                (SELECT count(*) FROM booking_seats WHERE user_id = $1 AND active)::int AS seats,
                (SELECT count(*) FROM posts WHERE author_id = $1 AND deleted_at IS NULL)::int AS posts`,
        [user.id]
      ),
    ]);
    const n = next.rows[0];
    const s = stats.rows[0];
    return {
      next: n ? { label: 'Your next show', name: n.name, href: `/events/${n.id}`, at: new Date(n.event_date).toISOString() } : null,
      stats: [
        { label: 'Tickets', value: String(s.tickets) },
        { label: 'Seats', value: String(s.seats) },
        { label: 'Posts', value: String(s.posts) },
      ],
    };
  }
  const own = user.role === 'organizer';
  const [next, stats] = await Promise.all([
    pool.query<{ id: string; name: string; event_date: Date }>(
      `SELECT id, name, event_date FROM events WHERE event_date > now() AND status = 'published' ${own ? 'AND organizer_id = $1' : ''}
        ORDER BY event_date LIMIT 1`,
      own ? [user.id] : []
    ),
    pool.query<{ events: number; sold: number; today: number }>(
      `SELECT (SELECT count(*) FROM events ${own ? 'WHERE organizer_id = $1' : ''})::int AS events,
              (SELECT count(*) FROM booking_seats bs JOIN events e ON e.id = bs.event_id WHERE bs.active ${own ? 'AND e.organizer_id = $1' : ''})::int AS sold,
              (SELECT count(*) FROM bookings b JOIN events e ON e.id = b.event_id
                WHERE b.created_at > now() - interval '24 hours' ${own ? 'AND e.organizer_id = $1' : ''})::int AS today`,
      own ? [user.id] : []
    ),
  ]);
  const n = next.rows[0];
  const s = stats.rows[0];
  return {
    next: n ? { label: own ? 'Your next event' : 'Next show', name: n.name, href: `/events/${n.id}`, at: new Date(n.event_date).toISOString() } : null,
    stats: [
      { label: 'Events', value: String(s.events) },
      { label: 'Seats sold', value: String(s.sold) },
      { label: 'Today', value: String(s.today) },
    ],
  };
}
