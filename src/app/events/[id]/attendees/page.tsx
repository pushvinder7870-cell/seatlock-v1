import Link from 'next/link';
import { ArmchairIcon, ArrowLeftIcon, TicketIcon, UserCheckIcon, UsersIcon, XCircleIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { listEventBookings } from '@/lib/services/booking';
import { dateParts, fmtDateTime } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PageHeader, StatCard } from '@/components/common';
import { AttendeesTable } from '@/components/attendees-table';

export const metadata = { title: 'Attendees' };

export default async function AttendeesPage({ params }: PageProps<'/events/[id]/attendees'>) {
  const user = await requireUser();
  const { id } = await params;
  const { event, attendees } = await guard(listEventBookings(user, id));
  const confirmed = attendees.filter((a) => a.status === 'confirmed');
  const checkedIn = confirmed.filter((a) => a.checked_in_at).length;
  const seatCount = confirmed.reduce((n, a) => n + a.seats.length, 0);
  const pct = confirmed.length ? Math.round((100 * checkedIn) / confirmed.length) : 0;

  return (
    <>
      <PageHeader
        icon={UsersIcon}
        eyebrow={dateParts(event.event_date).long}
        title={`${event.name}: attendees`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/events/${id}`}>
              <ArrowLeftIcon /> Seat map
            </Link>
          </Button>
        }
      />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Bookings" value={confirmed.length} icon={TicketIcon} />
        <StatCard label="Seats sold" value={seatCount} icon={ArmchairIcon} tone="info" hint={`of ${event.total_seats}`} />
        <StatCard label="Checked in" value={`${checkedIn}/${confirmed.length}`} icon={UserCheckIcon} tone="success">
          <Progress value={pct} className="mt-1" />
        </StatCard>
        <StatCard label="Cancelled" value={attendees.length - confirmed.length} icon={XCircleIcon} tone="danger" />
      </div>
      <AttendeesTable
        eventId={id}
        csrfToken={user.csrfToken}
        rows={attendees.map((a) => ({
          id: a.id,
          name: a.student_name,
          email: a.student_email,
          status: a.status,
          seats: a.seats,
          bookedAt: fmtDateTime(a.created_at),
          checkedInAt: a.checked_in_at ? fmtDateTime(a.checked_in_at) : null,
          checkedInBy: a.checked_in_by_name,
        }))}
      />
    </>
  );
}
