import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon, CalendarIcon, MapPinIcon, ShieldCheckIcon, ShoppingCartIcon, TimerIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getCheckout, formatINR, CONVENIENCE_FEE_RATE } from '@/lib/services/payments';
import { ConflictError } from '@/lib/errors';
import { dateParts } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { EmptyState, PageHeader } from '@/components/common';
import { CheckoutForm } from '@/components/checkout-form';
import { Countdown } from '@/components/countdown';

export const metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: PageProps<'/checkout/[holdId]'>) {
  const user = await requireUser();
  const { holdId } = await params;
  let c;
  try {
    c = await guard(getCheckout(user, holdId));
  } catch (e) {
    if (e instanceof ConflictError) {
      return (
        <EmptyState icon={TimerIcon} title="This checkout has expired" description={e.message}>
          <Button asChild>
            <Link href="/events">Pick seats again</Link>
          </Button>
        </EmptyState>
      );
    }
    throw e;
  }
  if (c.unitCents === 0) redirect(`/events/${c.eventId}`); // free events are confirmed on the seat map
  const p = dateParts(c.eventDate);

  return (
    <>
      <PageHeader
        icon={ShoppingCartIcon}
        eyebrow="Checkout · demo payment"
        title="Complete your booking"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/events/${c.eventId}`}>
              <ArrowLeftIcon /> Back to seats
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <CheckoutForm holdId={holdId} csrfToken={user.csrfToken} totalLabel={formatINR(c.amounts.total)} />
          </CardContent>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-0 py-0">
            <div className="relative h-32 overflow-hidden">
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- our own stored image
                <img src={c.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="brand-gradient size-full" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="truncate text-lg font-semibold">{c.eventName}</div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="size-4" /> {p.long} · {p.time}
                </div>
                <div className="flex items-center gap-2">
                  <MapPinIcon className="size-4" /> {c.venue ?? 'TBA'}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.seats.map((s) => (
                  <Badge key={s} className="bg-sky-500 font-mono text-white">
                    {s}
                  </Badge>
                ))}
              </div>
              <Separator />
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {c.seats.length} × {formatINR(c.unitCents)}
                  </dt>
                  <dd className="tabular-nums">{formatINR(c.amounts.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Convenience fee ({Math.round(CONVENIENCE_FEE_RATE * 100)}%)</dt>
                  <dd className="tabular-nums">{formatINR(c.amounts.fee)}</dd>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatINR(c.amounts.total)}</dd>
                </div>
              </dl>
            </div>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center gap-4">
              <Countdown expiresAt={new Date(c.expiresAt).toISOString()} serverNow={new Date().toISOString()} />
              <div className="text-sm">
                <div className="font-medium">Seats reserved for you</div>
                <div className="text-muted-foreground">Pay before the timer ends or they go back to everyone.</div>
              </div>
            </CardContent>
          </Card>
          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            Payment and booking are saved in one database transaction: you never pay without getting your seats.
          </p>
        </aside>
      </div>
    </>
  );
}
