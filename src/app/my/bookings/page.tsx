import Link from 'next/link';
import { CalendarDaysIcon, CheckCircle2Icon, ClockIcon, MapPinIcon, TicketIcon, XIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { listMyBookings, type BookingView } from '@/lib/services/booking';
import { formatINR } from '@/lib/services/payments';
import { dateParts } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, FormMeta, PageHeader, StatusBadge } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/action-form';
import type { CurrentUser } from '@/lib/session';

export const metadata = { title: 'My tickets' };

function Ticket({ b, user }: { b: BookingView; user: CurrentUser }) {
  const p = dateParts(b.event_date);
  const dim = b.status === 'cancelled';
  return (
    <div className={cn('flex overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10', dim && 'opacity-60')}>
      <div className={cn('flex w-20 shrink-0 flex-col items-center justify-center text-white sm:w-24', dim ? 'bg-muted-foreground/60' : 'brand-gradient')}>
        <span className="text-[10px] font-semibold tracking-widest opacity-85">{p.month}</span>
        <span className="text-3xl leading-none font-semibold tabular-nums">{p.day}</span>
        <span className="mt-1 text-[11px] opacity-80">{p.weekday}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/events/${b.event_id}`} className="font-semibold hover:text-primary">
              {b.event_name}
            </Link>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" /> {p.time}
              </span>
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" /> {b.venue ?? 'TBA'}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <StatusBadge status={b.status} />
            {b.checked_in_at && (
              <StatusBadge status="checked in">
                <CheckCircle2Icon /> checked in
              </StatusBadge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {b.seats.map((s) => (
            <span key={s} className="rounded-lg border bg-muted/50 px-2.5 py-1 font-mono text-sm font-semibold">
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="ticket-cut w-3.5 shrink-0 border-l border-dashed" aria-hidden />
      <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-2 p-3 text-center sm:w-40">
        <div className="text-[10px] tracking-widest text-muted-foreground uppercase">Admit</div>
        <div className="text-2xl font-semibold tabular-nums">{b.seats.length}</div>
        <div className="font-mono text-[10px] text-muted-foreground">#{b.id.slice(0, 8).toUpperCase()}</div>
        {b.paid_cents != null && (
          <div className={cn('text-xs font-medium', b.payment_status === 'refunded' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary')}>
            {b.payment_status === 'refunded' ? 'Refunded ' : 'Paid '}
            {formatINR(b.paid_cents)}
          </div>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/tickets/${b.id}`}>View ticket</Link>
        </Button>
        {b.can_cancel && (
          <ActionForm action={`/api/bookings/${b.id}/cancel`} confirm={`Cancel your booking for ${b.event_name} (${b.seats.join(', ')})?`}>
            <FormMeta user={user} redirect="/my/bookings" />
            <SubmitButton variant="destructive" size="sm">
              <XIcon /> Cancel
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}

export default async function MyBookingsPage() {
  const user = await requireUser();
  const bookings = await guard(listMyBookings(user));
  const active = bookings.filter((b) => b.status === 'confirmed');
  const cancelled = bookings.filter((b) => b.status !== 'confirmed');

  return (
    <>
      <PageHeader icon={TicketIcon} eyebrow="Student" title="My tickets" description="Cancel any time before the show starts. Seats go straight back to the pool." />
      {bookings.length === 0 ? (
        <EmptyState icon={TicketIcon} title="No tickets yet" description="Find a show, pick your seats and confirm within 5 minutes.">
          <Button asChild>
            <Link href="/events">
              <CalendarDaysIcon /> Browse events
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="max-w-4xl space-y-4">
          {active.map((b) => (
            <Ticket key={b.id} b={b} user={user} />
          ))}
          {cancelled.length > 0 && (
            <>
              <h2 className="pt-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">Cancelled</h2>
              {cancelled.map((b) => (
                <Ticket key={b.id} b={b} user={user} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
