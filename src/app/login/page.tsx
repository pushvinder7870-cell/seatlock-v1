import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LockKeyholeIcon, ScrollTextIcon, ShieldCheckIcon, TimerIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/session';
import { safePath } from '@/lib/http';
import { homeFor } from '@/lib/home';
import { LoginForm } from '@/components/login-form';
import { LogoMark } from '@/components/logo';
import { ThemeToggle } from '@/components/site-nav';

export const metadata = { title: 'Sign in' };

const FEATURES = [
  { icon: LockKeyholeIcon, title: 'Race-free holds', text: 'Row-level locks: one owner per seat.' },
  { icon: TimerIcon, title: '5-minute holds', text: 'Hold up to 4 seats, then confirm.' },
  { icon: ShieldCheckIcon, title: 'Server-side RBAC', text: 'Checked at the route and the service.' },
  { icon: ScrollTextIcon, title: 'Sharded audit', text: 'Every action logged across 4 shards.' },
];

// Decorative seat grid for the brand panel
function SeatPattern() {
  const rows = 6;
  const cols = 12;
  return (
    <div className="mx-auto grid max-w-md gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden>
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const lit = (r * 7 + c * 3) % 11 === 0;
        const held = (r * 5 + c * 2) % 13 === 0;
        return (
          <span
            key={i}
            className={`aspect-square rounded-t-[5px] rounded-b-[3px] border ${
              lit ? 'border-white/80 bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.6)]' : held ? 'border-amber-200/60 bg-amber-200/30' : 'border-white/25 bg-white/5'
            } ${c === 5 ? 'mr-2' : ''}`}
          />
        );
      })}
    </div>
  );
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? safePath(sp.next, '') : '';
  const user = await getCurrentUser();
  if (user) redirect(next || homeFor(user.role));

  return (
    // Desktop: exactly one screen tall, nothing scrolls. Mobile: natural scrolling.
    <div className="page-glow grid min-h-svh lg:h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
      <section className="brand-gradient relative m-3 hidden flex-col overflow-hidden rounded-3xl p-8 text-white lg:flex xl:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5 font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-white/15">
            <LogoMark className="size-9 bg-none shadow-none [background:transparent]" />
          </span>
          SeatLock
        </div>
        <div className="relative my-auto py-6">
          <div className="mx-auto mb-2 h-1.5 w-2/3 max-w-sm rounded-full bg-white/80 shadow-[0_0_24px_6px_rgba(255,255,255,0.35)]" />
          <p className="mb-5 text-center text-[10px] font-semibold tracking-[0.35em] text-white/70">STAGE</p>
          <SeatPattern />
        </div>
        <div className="relative">
          <h2 className="text-3xl leading-tight font-semibold">
            Every seat.
            <br />
            Exactly one owner.
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <Icon className="mb-1.5 size-4" />
                <div className="text-sm font-medium">{title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-white/75">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 py-10 lg:overflow-y-auto">
        <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Home
          </Link>
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 font-semibold lg:hidden">
            <LogoMark /> SeatLock
          </div>
          <h1 className="text-3xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to grab your seats for the fest headline show.</p>
          <div className="mt-8">
            <LoginForm next={next} invalid={sp.error === 'invalid'} />
          </div>
        </div>
      </section>
    </div>
  );
}
