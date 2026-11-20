import Link from 'next/link';
import { createHash } from 'node:crypto';
import { ArrowLeftIcon, BadgeCheckIcon, CalendarIcon, ClockIcon, CreditCardIcon, MapPinIcon, ReceiptIcon, TicketIcon, UndoIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getTicket, formatINR } from '@/lib/services/payments';
import { dateParts, fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PageHeader, StatusBadge } from '@/components/common';
import { PrintButton } from '@/components/print-button';

export const metadata = { title: 'Ticket' };

/** Deterministic 21×21 "ticket code" pattern derived from the booking id (decorative, not a scannable QR). */
function TicketCode({ seed }: { seed: string }) {
  const n = 21;
  const bits = createHash('sha256').update(seed).digest();
  const cells: [number, number][] = [];
  const finder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      if (inBox(r0, c0)) {
        const rr = r - r0, cc = c - c0;
        return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) ? 1 : 0;
      }
    }
    return -1;
  };
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const f = finder(r, c);
      const on = f === -1 ? (bits[(r * n + c) % 32] >> ((r + c) % 8)) & 1 : f;
      if (on) cells.push([r, c]);
    }
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} className="size-36 rounded-xl bg-white p-1" role="img" aria-label="Ticket code">
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#17162B" />
      ))}
    </svg>
  );
}

export default async function TicketPage({ params }: PageProps<'/tickets/[bookingId]'>) {
  const user = await requireUser();
  const { bookingId } = await params;
  const t = await guard(getTicket(user, bookingId));
  const p = dateParts(t.eventDate);
  const cancelled = t.status === 'cancelled';

  return (
    <>
      <PageHeader
        icon={TicketIcon}
        eyebrow={t.payment ? 'Paid ticket' : 'Ticket'}
        title={t.eventName}
        actions={
          <>
            <PrintButton />
            {user.role === 'student' && (
              <Button variant="outline" asChild className="print:hidden">
                <Link href="/my/bookings">
                  <ArrowLeftIcon /> My tickets
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Ticket */}
        <div className={cn('overflow-hidden rounded-3xl bg-card shadow-xl ring-1 shadow-primary/10 ring-foreground/10', cancelled && 'opacity-60 grayscale')}>
          <div className="relative h-44 sm:h-52">
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- our own stored image
              <img src={t.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="brand-gradient size-full" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute right-5 bottom-4 left-5 text-white">
              <div className="text-xs font-semibold tracking-widest opacity-80">SEATLOCK · COLLEGE FEST 2026</div>
              <div className="mt-1 text-2xl font-semibold sm:text-3xl">{t.eventName}</div>
            </div>
            <div className="absolute top-4 right-4 flex gap-1.5">
              <StatusBadge status={t.status} className="bg-white/90 text-foreground" />
              {t.checkedInAt && <StatusBadge status="checked in" className="bg-white/90">checked in</StatusBadge>}
            </div>
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="size-4 text-primary" /> {p.long}
                </div>
                <div className="flex items-center gap-2">
                  <ClockIcon className="size-4 text-primary" /> Doors {p.time}
                </div>
                <div className="flex items-center gap-2">
                  <MapPinIcon className="size-4 text-primary" /> {t.venue ?? 'TBA'}
                </div>
                <div className="flex items-center gap-2">
                  <BadgeCheckIcon className="size-4 text-primary" /> {t.holderName}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">Seats · admit {t.seats.length}</div>
                <div className="flex flex-wrap gap-2">
                  {t.seats.map((s) => (
                    <span key={s} className="brand-gradient rounded-xl px-3.5 py-2 font-mono text-lg font-semibold text-white shadow-md shadow-primary/25">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 border-t border-dashed pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <TicketCode seed={t.bookingId} />
              <span className="font-mono text-xs text-muted-foreground">#{t.bookingId.slice(0, 8).toUpperCase()}</span>
              <span className="text-[10px] text-muted-foreground">Show this at the door</span>
            </div>
          </div>
        </div>

        {/* Receipt */}
        <Card className="lg:self-start">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ReceiptIcon className="size-4 text-primary" /> Receipt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1 text-sm">
            {t.payment ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt no.</span>
                  <span className="font-mono">{t.payment.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid on</span>
                  <span>{fmtDateTime(t.payment.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <span className="flex items-center gap-1.5">
                    <CreditCardIcon className="size-3.5" />
                    {t.payment.method === 'upi' ? `UPI · ${t.payment.upiId}` : `${t.payment.brand} •••• ${t.payment.last4}`}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t.payment.seats} × {formatINR(t.payment.unitCents)}
                  </span>
                  <span className="tabular-nums">{formatINR(t.payment.unitCents * t.payment.seats)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Convenience fee</span>
                  <span className="tabular-nums">{formatINR(t.payment.feeCents)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>{t.payment.status === 'refunded' ? 'Refunded' : 'Total paid'}</span>
                  <span className={cn('tabular-nums', t.payment.status === 'refunded' && 'text-emerald-600 line-through decoration-2 dark:text-emerald-400')}>
                    {formatINR(t.payment.amountCents)}
                  </span>
                </div>
                {t.payment.status === 'refunded' && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                    <UndoIcon className="size-3.5" /> Refunded on {fmtDateTime(t.payment.refundedAt)} (demo).
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Demo payment: no real money was charged.</p>
              </>
            ) : (
              <p className="text-muted-foreground">Free event. No payment was needed.</p>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booked on</span>
              <span>{fmtDateTime(t.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
