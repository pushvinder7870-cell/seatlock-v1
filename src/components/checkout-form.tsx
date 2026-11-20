'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, CreditCardIcon, Loader2Icon, LockIcon, SmartphoneIcon, ZapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const TEST = {
  card: [
    { label: 'Success', number: '4242 4242 4242 4242', tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Declined', number: '4000 0000 0000 0002', tone: 'text-rose-600 dark:text-rose-400' },
  ],
  upi: [
    { label: 'Success', id: 'student@okaxis', tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Declined', id: 'fail@upi', tone: 'text-rose-600 dark:text-rose-400' },
  ],
};
const STEPS = ['Contacting your bank…', 'Authorising payment…', 'Locking in your seats…'];

function brandOf(d: string) {
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^(60|65|81|82|508)/.test(d)) return 'RuPay';
  return '';
}

/**
 * Demo payment form. A plain HTML form (works without JS) that, with JS,
 * shows a live card preview and a short processing animation, then posts to
 * /api/holds/:id/pay. The server does all validation (Luhn, expiry, CVC).
 */
export function CheckoutForm({ holdId, csrfToken, totalLabel }: { holdId: string; csrfToken: string; totalLabel: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<'card' | 'upi'>('card');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [step, setStep] = useState(-1);
  const [error, setError] = useState('');
  const digits = number.replace(/\D/g, '');
  const busy = step >= 0;

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650);
    try {
      const [res] = await Promise.all([
        fetch(`/api/holds/${holdId}/pay`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken, 'x-seatlock-enhanced': '1' },
          body: JSON.stringify({ method, cardNumber: number, expiry, cvc, name, upiId }),
        }),
        new Promise((r) => setTimeout(r, 1900)), // let the animation play
      ]);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? 'Payment failed.');
        toast.error(json.message ?? 'Payment failed.');
        setStep(-1);
        return;
      }
      setStep(STEPS.length);
      router.push(`${json.redirect ?? `/tickets/${json.bookingId}`}?notice=payment_success`);
    } catch {
      setError('Network error. Please try again.');
      setStep(-1);
    } finally {
      clearInterval(ticker);
    }
  }

  return (
    <form method="post" action={`/api/holds/${holdId}/pay`} onSubmit={pay} className="space-y-6">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="method" value={method} />

      <div className="inline-flex rounded-xl border bg-muted/50 p-1" role="tablist" aria-label="Payment method">
        {(
          [
            ['card', 'Card', CreditCardIcon],
            ['upi', 'UPI', SmartphoneIcon],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={cn('flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm text-muted-foreground transition-colors', method === m && 'bg-background font-medium text-foreground shadow-sm')}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {method === 'card' ? (
        <>
          {/* Live card preview */}
          <div className="brand-gradient relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl p-5 text-white shadow-xl shadow-primary/30">
            <div className="absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-widest opacity-80">SEATLOCK DEMO</span>
                <span className="text-sm font-bold italic">{brandOf(digits)}</span>
              </div>
              <div className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" />
              <div className="font-mono text-lg tracking-[0.15em] tabular-nums sm:text-xl">
                {(digits.padEnd(16, '•').match(/.{1,4}/g) ?? []).slice(0, 4).join(' ')}
              </div>
              <div className="flex justify-between text-xs">
                <span className="truncate uppercase opacity-90">{name || 'Your name'}</span>
                <span className="font-mono opacity-90">{expiry || 'MM/YY'}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cardNumber">Card number</Label>
              <Input
                id="cardNumber"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="4242 4242 4242 4242"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
                className="h-10 font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry">Expiry</Label>
              <Input
                id="expiry"
                name="expiry"
                inputMode="numeric"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
                className="h-10 font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvc">CVC</Label>
              <Input id="cvc" name="cvc" inputMode="numeric" autoComplete="off" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-10 font-mono" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name on card</Label>
              <Input id="name" name="name" autoComplete="off" placeholder="Aluko Israel" value={name} onChange={(e) => setName(e.target.value)} className="h-10" required />
            </div>
          </div>
          <TestHints>
            {TEST.card.map((t) => (
              <button
                key={t.number}
                type="button"
                onClick={() => {
                  setNumber(t.number);
                  setExpiry('12/30');
                  setCvc('123');
                  setName((n) => n || 'Demo Student');
                }}
                className="rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs hover:border-primary/40"
              >
                <span className={cn('font-semibold', t.tone)}>{t.label}</span> <span className="font-mono text-muted-foreground">{t.number}</span>
              </button>
            ))}
          </TestHints>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="upiId">UPI ID</Label>
            <Input id="upiId" name="upiId" placeholder="yourname@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} className="h-10" required />
            <p className="text-xs text-muted-foreground">In the demo the request is approved instantly. No app opens.</p>
          </div>
          <TestHints>
            {TEST.upi.map((t) => (
              <button key={t.id} type="button" onClick={() => setUpiId(t.id)} className="rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs hover:border-primary/40">
                <span className={cn('font-semibold', t.tone)}>{t.label}</span> <span className="font-mono text-muted-foreground">{t.id}</span>
              </button>
            ))}
          </TestHints>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy}>
        {step === STEPS.length ? (
          <>
            <CheckCircle2Icon /> Paid!
          </>
        ) : busy ? (
          <>
            <Loader2Icon className="animate-spin" /> {STEPS[step]}
          </>
        ) : (
          <>
            <LockIcon /> Pay {totalLabel}
          </>
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <LockIcon className="size-3" /> Demo mode: no real money is charged and card numbers are never stored.
      </p>
    </form>
  );
}

function TestHints({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ZapIcon className="size-3.5 text-amber-500" /> Test details: click to fill
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
