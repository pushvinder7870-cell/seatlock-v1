import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRightIcon,
  BellIcon,
  BotIcon,
  CreditCardIcon,
  LockKeyholeIcon,
  MessagesSquareIcon,
  MousePointerClickIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  TicketCheckIcon,
  TimerIcon,
  UserCheckIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/session';
import { homeFor } from '@/lib/home';
import { listPublicEvents, listPublicReviews, publicStats } from '@/lib/services/public';
import { formatINR } from '@/lib/services/payments';
import { dateParts } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/logo';
import { ThemeToggle } from '@/components/site-nav';
import { EventCarousel } from '@/components/landing/event-carousel';

export const metadata = { title: 'SeatLock · Every seat, exactly one owner' };

// Which seats light up in the 3D hero (deterministic, so server and client agree)
const HOT = new Set([3, 14, 22, 31, 40, 45, 57, 63, 70, 81]);

function Seat3D() {
  const rows = 8;
  const cols = 11;
  return (
    <div className="scene-3d relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden>
      <div className="orb absolute top-6 left-10 size-56 rounded-full bg-primary/40" />
      <div className="orb absolute right-6 bottom-10 size-52 rounded-full bg-fuchsia-500/30 [animation-delay:-5s]" />
      <div className="stage-3d absolute inset-8 rounded-[2rem] bg-gradient-to-b from-[#1e1b4b] to-[#0f0d26] p-6 shadow-[0_40px_80px_-20px_rgba(79,70,229,0.6)] ring-1 ring-white/10">
        <div className="mx-auto mb-5 h-2 w-2/3 rounded-full bg-gradient-to-r from-transparent via-indigo-200 to-transparent shadow-[0_0_30px_8px_rgba(129,140,248,0.55)]" />
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows * cols }, (_, i) => (
            <span
              key={i}
              className={`seat-3d ${HOT.has(i) ? 'hot' : ''} ${i % cols === 5 ? 'ml-1' : ''}`}
              style={{ animationDelay: `${(i * 0.37) % 6}s` }}
            />
          ))}
        </div>
      </div>
      {/* floating 3D ticket */}
      <div className="float-card absolute right-0 bottom-6 w-56 rounded-2xl bg-white p-4 text-[#17162b] shadow-2xl ring-1 ring-black/5 sm:-right-4">
        <div className="flex items-center justify-between text-[10px] font-semibold tracking-widest text-indigo-600">
          <span>ADMIT 2</span>
          <TicketCheckIcon className="size-4" />
        </div>
        <div className="mt-1 text-sm font-semibold">Fest Headline Night</div>
        <div className="mt-2 flex gap-1.5">
          {['C5', 'C6'].map((s) => (
            <span key={s} className="brand-gradient rounded-lg px-2 py-1 font-mono text-xs font-semibold text-white">
              {s}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-zinc-500">Paid ₹1,018 · confirmed in 0.2 s</div>
      </div>
      {/* floating hold timer */}
      <div className="float-card absolute top-4 left-0 flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-xs font-medium text-[#17162b] shadow-xl [animation-delay:-3s] sm:-left-4">
        <TimerIcon className="size-4 text-sky-500" /> Seats held · 4:59
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: LockKeyholeIcon, title: 'Race-free booking', text: 'Row-level locks guarantee exactly one owner per seat, even when 60 people click at once.' },
  { icon: TimerIcon, title: '5-minute holds', text: 'Hold up to 4 seats, then confirm or pay before the ring timer runs out.' },
  { icon: CreditCardIcon, title: 'Checkout & tickets', text: 'Demo card or UPI checkout, receipts and printable tickets with a door code.' },
  { icon: BotIcon, title: 'Ask SeatLock AI', text: 'An assistant that knows every show, price and seat, and even talks back.' },
  { icon: MessagesSquareIcon, title: 'Community & reviews', text: 'Posts, threaded comments, likes and verified-attendee reviews.' },
  { icon: ShieldCheckIcon, title: 'Secure by design', text: 'Two-layer permissions, CSRF tokens, rate limits and a sharded audit log.' },
];

const STEPS = [
  { icon: MousePointerClickIcon, title: 'Pick seats', text: 'Tap up to 4 seats on the live map.' },
  { icon: TimerIcon, title: 'Hold', text: 'They are yours for 5 minutes.' },
  { icon: CreditCardIcon, title: 'Confirm or pay', text: 'Free shows confirm instantly.' },
  { icon: UserCheckIcon, title: 'Show your ticket', text: 'Get checked in at the door.' },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  const [events, reviews, stats] = await Promise.all([listPublicEvents(), listPublicReviews(), publicStats()]);
  const slides = events.map((e) => {
    const p = dateParts(e.event_date);
    return {
      id: e.id,
      name: e.name,
      venue: e.venue,
      month: p.month,
      day: p.day,
      time: p.time,
      price: e.price_cents ? formatINR(e.price_cents) : 'Free',
      imageUrl: e.image_url,
      available: e.available,
      total: e.total_seats,
      open: e.booking_open,
    };
  });
  const marquee = reviews.length ? [...reviews, ...reviews] : [];

  return (
    <div className="page-glow min-h-svh overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <LogoMark /> SeatLock
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#events" className="hover:text-foreground">Shows</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#reviews" className="hover:text-foreground">Reviews</a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Get started <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-2 lg:pt-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <SparklesIcon className="size-3.5 text-primary" /> College Fest 2026 · bookings are live
          </div>
          <h1 className="mt-5 text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Every seat.
            <br />
            <span className="gradient-text">Exactly one owner.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Grab numbered seats for the fest&apos;s biggest shows. Hundreds of students can click the same seat at the same moment, and SeatLock guarantees only one gets it. No double bookings, ever.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base shadow-lg shadow-primary/30">
              <Link href="/login">
                Book your seats <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <a href="#events">See what&apos;s on</a>
            </Button>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              [stats.events, 'live shows'],
              [stats.seats, 'numbered seats'],
              [stats.students, 'students'],
            ].map(([n, l]) => (
              <div key={String(l)}>
                <dt className="text-3xl font-bold tabular-nums">{n}</dt>
                <dd className="text-sm text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Seat3D />
      </section>

      {/* Events carousel */}
      <section id="events" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">Upcoming shows</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Pick your night</h2>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">Seat counts are live. Sign in to hold seats for 5 minutes while you check out.</p>
        </div>
        {slides.length ? <EventCarousel events={slides} /> : <p className="text-muted-foreground">New shows are coming soon.</p>}
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Why SeatLock</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Built for the rush</h2>
          <p className="mt-3 text-muted-foreground">Everything students, organizers and admins need for fest night.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="tilt-3d rounded-3xl border bg-card p-6 shadow-sm">
              <div className={`grid size-12 place-items-center rounded-2xl text-white shadow-lg ${['brand-gradient', 'bg-sky-500', 'bg-emerald-500', 'bg-fuchsia-500', 'bg-amber-500', 'bg-rose-500'][i]}`}>
                <Icon className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="brand-gradient relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] px-6 py-14 text-white sm:px-12">
          <div className="orb absolute -top-20 -right-10 size-72 rounded-full bg-white/20" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">From click to curtain in 4 steps</h2>
          <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm transition-transform hover:-translate-y-1">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-white text-lg font-bold text-indigo-600">{i + 1}</span>
                  <Icon className="size-5 opacity-90" />
                </div>
                <div className="mt-4 text-lg font-semibold">{title}</div>
                <div className="mt-1 text-sm text-white/80">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews marquee */}
      {marquee.length > 0 && (
        <section id="reviews" className="scroll-mt-20 py-16">
          <div className="mx-auto mb-8 max-w-7xl px-4 sm:px-6">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">Loved by students</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">What the crowd says</h2>
          </div>
          <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="marquee flex w-max gap-5 px-4">
              {marquee.map((r, i) => (
                <figure key={i} className="w-80 shrink-0 rounded-3xl border bg-card p-5 shadow-sm">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }, (_, k) => (
                      <StarIcon key={k} className={`size-4 ${k < r.rating ? 'fill-current' : 'opacity-25'}`} />
                    ))}
                  </div>
                  <blockquote className="mt-3 line-clamp-4 text-sm leading-relaxed">&ldquo;{r.body}&rdquo;</blockquote>
                  <figcaption className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.first_name}</span> · {r.event_name}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* AI + CTA */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="tilt-3d rounded-[2rem] border bg-card p-6 shadow-xl shadow-primary/10">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="brand-gradient grid size-8 place-items-center rounded-lg text-white">
              <BotIcon className="size-4" />
            </span>
            Ask SeatLock
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-primary-foreground">Which show is cheapest this week?</div>
            <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2">
              <strong>Stand-up Comedy Hour</strong> is ₹199 per seat with 58 seats left. Want me to take you there? 🎤
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">AI inside</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">An assistant that knows the fest</h2>
          <p className="mt-3 text-muted-foreground">
            Ask about shows, prices, free seats or your tickets, by text or by voice. It reads live data, summarises reviews and helps organizers write event descriptions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {[
              [BellIcon, 'Live notifications'],
              [ScrollTextIcon, 'Audited actions'],
              [StarIcon, 'Verified reviews'],
            ].map(([Icon, label]) => {
              const I = Icon as typeof BellIcon;
              return (
                <span key={label as string} className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5">
                  <I className="size-4 text-primary" /> {label as string}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[2.5rem] border bg-card px-6 py-12 text-center shadow-xl shadow-primary/10">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready for <span className="gradient-text">fest night?</span>
          </h2>
          <p className="mt-3 text-muted-foreground">Sign in with a demo account and grab your seats in under a minute.</p>
          <Button asChild size="lg" className="mt-7 h-12 px-8 text-base shadow-lg shadow-primary/30">
            <Link href="/login">
              Get started <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" /> SeatLock · College Fest 2026
          </div>
          <div>
            Built by <span className="font-medium text-foreground">Aluko Israel Temiloluwa</span> &amp; <span className="font-medium text-foreground">Pushvinder Sharma</span> · BCA 5th Sem
          </div>
        </div>
      </footer>
    </div>
  );
}
