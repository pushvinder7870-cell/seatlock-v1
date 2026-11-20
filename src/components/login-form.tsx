'use client';

import { useState } from 'react';
import { ArrowRightIcon, EyeIcon, EyeOffIcon, Loader2Icon, ShieldIcon, UserIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const DEMO = [
  { email: 'admin@seatlock.test', label: 'Admin', hint: 'Dashboard, audit, users', icon: ShieldIcon, tone: 'text-rose-500' },
  { email: 'organizer1@seatlock.test', label: 'Organizer 1', hint: 'Owns Headline Night', icon: UsersIcon, tone: 'text-amber-500' },
  { email: 'organizer2@seatlock.test', label: 'Organizer 2', hint: 'Owns Comedy Hour', icon: UsersIcon, tone: 'text-amber-500' },
  { email: 'student01@seatlock.test', label: 'Student 01', hint: 'Book seats', icon: UserIcon, tone: 'text-primary' },
  { email: 'student02@seatlock.test', label: 'Student 02', hint: 'Book seats', icon: UserIcon, tone: 'text-primary' },
];
const DEMO_PASSWORD = 'password123';

export function LoginForm({ next, invalid }: { next: string; invalid: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(invalid ? 'Invalid email or password.' : '');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-seatlock-enhanced': '1' },
        body: JSON.stringify({ email, password, next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? 'Login failed.');
        toast.error(json.message ?? 'Login failed.');
        return;
      }
      toast.success(`Welcome back, ${json.user.name.split(' ')[0]}!`);
      // Full page load so the authenticated shell (sidebar) renders fresh.
      window.location.assign(json.redirect ?? '/events');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <form method="post" action="/api/auth/login" onSubmit={submit} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="username" placeholder="you@seatlock.test" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Sign in
          {!pending && <ArrowRightIcon />}
        </Button>
      </form>

      <div>
        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>
            Demo accounts · click to fill · password <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO.map(({ email: e, label, hint, icon: Icon, tone }) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setEmail(e);
                setPassword(DEMO_PASSWORD);
                setError('');
              }}
              className={cn(
                'group flex flex-col items-start gap-0.5 rounded-xl border bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                email === e && 'border-primary ring-3 ring-primary/15'
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className={cn('size-3.5', tone)} />
                {label}
              </span>
              <span className="text-[11px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
