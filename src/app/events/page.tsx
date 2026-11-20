import Link from 'next/link';
import {
  ArmchairIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  ClockIcon,
  MapPinIcon,
  PercentIcon,
  TicketIcon,
  TimerIcon,
} from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { listEvents, type EventSummary } from '@/lib/services/events';
import { dateParts } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateTile, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/common';

export const metadata = { title: 'Events' };

function Availability({ e }: { e: EventSummary }) {
  const pct = (n: number) => `${(100 * n) / Math.max(1, e.total_seats)}%`;
  return (
    <div>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-primary" style={{ width: pct(e.booked) }} />
        <div className="bg-amber-400" style={{ width: pct(e.held) }} />
        <div className="bg-muted-foreground/30" style={{ width: pct(e.blocked) }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground tabular-nums">{e.available}</span> of {e.total_seats} seats left
        </span>
        <span className="tabular-nums">
          {e.booked} booked{e.held > 0 && ` · ${e.held} on hold`}
        </span>
      </div>
    </div>
  );
}

function EventCard({ e, showOrganizer }: { e: EventSummary; showOrganizer: boolean }) {
  const p = dateParts(e.event_date);
  const sold = e.available === 0 && e.booking_open;
  const fast = !sold && e.booking_open && e.available / Math.max(1, e.total_seats) < 0.25;
  return (
    <Link href={`/events/${e.id}`} className="group block focus-visible:outline-none">
      <Card className="h-full gap-0 py-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:ring-primary/30 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className={`relative h-36 overflow-hidden ${!e.booking_open ? 'grayscale' : ''}`}>
          {e.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own stored image
            <img src={e.image_url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="brand-gradient size-full opacity-90">
              <div
                className="size-full opacity-30"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.5px, transparent 0)', backgroundSize: '16px 16px' }}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-transparent" />
          <span className="absolute bottom-2.5 left-4 text-xs font-medium text-white/90 drop-shadow">{e.venue ?? 'Venue TBA'}</span>
        </div>
        <div className="flex gap-4 p-5">
          <DateTile date={e.event_date} className={!e.booking_open ? 'opacity-50 grayscale' : ''} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate text-base font-semibold group-hover:text-primary">{e.name}</h2>
              <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" /> {p.time}
              </span>
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" /> {e.venue ?? 'TBA'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {e.status !== 'published' && <StatusBadge status={e.status} />}
              {e.booking_open ? <StatusBadge status="open">Booking open</StatusBadge> : <StatusBadge status="closed">Booking closed</StatusBadge>}
              {fast && <StatusBadge status="selling fast">Selling fast</StatusBadge>}
              {sold && <StatusBadge status="sold out">Sold out</StatusBadge>}
            </div>
          </div>
        </div>
        <div className="border-t bg-muted/30 px-5 py-3.5">
          <Availability e={e} />
          {showOrganizer && <div className="mt-2 text-xs text-muted-foreground">Organizer · {e.organizer_name}</div>}
        </div>
      </Card>
    </Link>
  );
}

export default async function EventsPage() {
  const user = await requireUser();
  const events = await guard(listEvents(user));
  const staff = user.role !== 'student';
  const upcoming = events.filter((e) => e.booking_open || e.status !== 'published');
  const past = events.filter((e) => !upcoming.includes(e));

  const totals = events.reduce(
    (t, e) => ({ seats: t.seats + e.total_seats, booked: t.booked + e.booked, held: t.held + e.held }),
    { seats: 0, booked: 0, held: 0 }
  );

  return (
    <>
      <PageHeader
        icon={CalendarDaysIcon}
        eyebrow={user.role === 'student' ? 'College fest 2026' : user.role === 'organizer' ? 'Organizer' : 'All organizers'}
        title={user.role === 'organizer' ? 'My events' : 'Upcoming shows'}
        description={
          user.role === 'student'
            ? 'Pick your seats, hold them for 5 minutes, then confirm. Max 4 seats per show.'
            : user.role === 'organizer'
              ? 'Events you organize. Only you can edit them, block seats or check guests in.'
              : 'Every event across all organizers.'
        }
        actions={
          user.role === 'organizer' && (
            <Button asChild>
              <Link href="/events/new">
                <CalendarPlusIcon /> New event
              </Link>
            </Button>
          )
        }
      />

      {staff && events.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Events" value={events.length} icon={CalendarDaysIcon} hint={`${upcoming.length} upcoming`} />
          <StatCard label="Seats booked" value={totals.booked} icon={TicketIcon} tone="success" hint={`of ${totals.seats} total`} />
          <StatCard label="Fill rate" value={`${Math.round((100 * totals.booked) / Math.max(1, totals.seats))}%`} icon={PercentIcon} tone="info" hint="booked / capacity" />
          <StatCard label="On hold now" value={totals.held} icon={TimerIcon} tone="warning" hint="5-minute holds" />
        </div>
      )}

      {events.length === 0 ? (
        <EmptyState icon={ArmchairIcon} title="No events yet" description={user.role === 'organizer' ? 'Create your first event to generate a seat map.' : 'Check back soon.'}>
          {user.role === 'organizer' && (
            <Button asChild>
              <Link href="/events/new">
                <CalendarPlusIcon /> New event
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e) => (
            <EventCard key={e.id} e={e} showOrganizer={user.role === 'admin'} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">Past & closed</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {past.map((e) => (
              <EventCard key={e.id} e={e} showOrganizer={user.role === 'admin'} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
