import Link from 'next/link';
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  PencilIcon,
  ScrollTextIcon,
  ShoppingCartIcon,
  TagIcon,
  TicketCheckIcon,
  TicketIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getSeatMap, MAX_SEATS_PER_STUDENT } from '@/lib/services/events';
import { computeAmounts, formatINR } from '@/lib/services/payments';
import { dateParts } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { FormMeta, PageHeader, StatusBadge } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { SeatMap } from '@/components/seat-map';
import { Countdown } from '@/components/countdown';

export default async function EventPage({ params }: PageProps<'/events/[id]'>) {
  const user = await requireUser();
  const { id } = await params;
  const map = await guard(getSeatMap(user, id));
  const { event, bookingOpen, myHold, myBookedCount } = map;
  const p = dateParts(event.event_date);

  const mode = user.role === 'student' && bookingOpen ? 'student' : user.role === 'organizer' ? 'organizer' : 'view';
  const counts = { available: 0, held: 0, booked: 0, blocked: 0 };
  for (const s of map.seats) counts[s.state]++;
  const total = map.seats.length || 1;

  return (
    <>
      {event.image_url && (
        <div className="relative mb-6 overflow-hidden rounded-2xl border shadow-lg shadow-primary/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own stored image */}
          <img src={event.image_url} alt={`${event.name} cover`} className="aspect-[16/6] max-h-80 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}
      <PageHeader
        eyebrow={p.long}
        title={event.name}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            {bookingOpen ? <StatusBadge status="open">Booking open</StatusBadge> : <StatusBadge status="closed">Booking closed</StatusBadge>}
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3.5" /> {event.venue ?? 'TBA'}
            </span>
          </div>
        }
        actions={
          <>
            {user.role === 'organizer' && (
              <Button variant="outline" asChild>
                <Link href={`/events/${id}/edit`}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
            )}
            {user.role !== 'student' && (
              <Button variant="outline" asChild>
                <Link href={`/events/${id}/attendees`}>
                  <UsersIcon /> Attendees
                </Link>
              </Button>
            )}
            {user.role === 'admin' && (
              <Button variant="outline" asChild>
                <Link href={`/admin/audit?eventId=${id}`}>
                  <ScrollTextIcon /> Audit
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {user.role === 'student' && myHold && (
            <Card className="bg-gradient-to-r from-sky-500/10 via-primary/5 to-transparent ring-sky-500/30">
              <CardContent className="flex flex-wrap items-center gap-5">
                <Countdown expiresAt={new Date(myHold.expires_at).toISOString()} serverNow={new Date().toISOString()} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Seats on hold for you</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {myHold.seats.map((s) => (
                      <Badge key={s} className="bg-sky-500 font-mono text-white">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Confirm before the timer runs out or the seats go back to everyone.</p>
                </div>
                <div className="flex gap-2">
                  <ActionForm action={`/api/holds/${myHold.id}/release`}>
                    <FormMeta user={user} redirect={`/events/${id}`} />
                    <SubmitButton variant="ghost">Release</SubmitButton>
                  </ActionForm>
                  {event.price_cents > 0 ? (
                    <Button size="lg" className="h-10 px-4" asChild data-tour="checkout">
                      <Link href={`/checkout/${myHold.id}`}>
                        <ShoppingCartIcon /> Checkout · {formatINR(computeAmounts(event.price_cents, myHold.seats.length).total)}
                      </Link>
                    </Button>
                  ) : (
                    <ActionForm action={`/api/holds/${myHold.id}/confirm`}>
                      <FormMeta user={user} redirect="/my/bookings" />
                      <SubmitButton size="lg" className="h-10 px-4">
                        <TicketCheckIcon /> Confirm booking
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <SeatMap
            eventId={id}
            initialSeats={map.seats}
            mode={mode}
            csrfToken={user.csrfToken}
            maxSelect={Math.max(0, MAX_SEATS_PER_STUDENT - myBookedCount - (myHold?.seats.length ?? 0))}
            myHoldId={myHold?.id ?? null}
          />
        </div>

        <aside className="space-y-6">
          {user.role === 'student' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TicketIcon className="size-4 text-primary" /> Your seats
                </CardTitle>
                <CardDescription>Each student may own up to {MAX_SEATS_PER_STUDENT} seats per show.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-semibold tabular-nums">{myBookedCount}</span>
                  <span className="text-sm text-muted-foreground">of {MAX_SEATS_PER_STUDENT} booked</span>
                </div>
                <Progress value={(100 * myBookedCount) / MAX_SEATS_PER_STUDENT} />
                {myBookedCount > 0 && (
                  <Button variant="link" className="h-auto px-0" asChild>
                    <Link href="/my/bookings">View my tickets →</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Seat availability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ['Available', counts.available, 'bg-emerald-500'],
                  ['On hold', counts.held, 'bg-amber-400'],
                  ['Booked', counts.booked, 'bg-primary'],
                  ['Blocked', counts.blocked, 'bg-muted-foreground/40'],
                ] as const
              ).map(([label, n, color]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${color}`} /> {label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${(100 * n) / total}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(
                [
                  [TagIcon, event.price_cents > 0 ? `${formatINR(event.price_cents)} per seat (+2% fee)` : 'Free entry'],
                  [CalendarIcon, p.long],
                  [ClockIcon, `Doors ${p.time}`],
                  [MapPinIcon, event.venue ?? 'TBA'],
                  [UserRoundIcon, `Organized by ${event.organizer_name}`],
                ] as const
              ).map(([Icon, text]) => (
                <div key={text} className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{text}</span>
                </div>
              ))}
              {event.description && (
                <>
                  <Separator />
                  <p className="leading-relaxed text-muted-foreground">{event.description}</p>
                </>
              )}
              {user.role === 'organizer' && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Select seats on the map to block them for crew or equipment. Booked or held seats can&apos;t be blocked.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
