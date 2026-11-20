'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LightbulbIcon, PartyPopperIcon, TimerIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SidebarInfo } from '@/lib/services/sidebar';

const TIPS: Record<string, string[]> = {
  student: [
    'Hold up to 4 seats. Picking more later adds them to your hold.',
    'Tap ✨ Ask AI and press 🎤 to ask by voice.',
    'Demo checkout: card 4242 4242 4242 4242 always works.',
    'Checked-in reviewers get a ✅ Verified attendee badge.',
    'Hot posts rise with likes and comments, then cool down over time.',
    'Changed your mind? Cancel before the show for a demo refund.',
  ],
  organizer: [
    '“Write with AI” drafts your event description in seconds.',
    'Block seats for crew or equipment right on the seat map.',
    'Add a cover photo so your event card stands out.',
    'Search the attendee list by seat (e.g. “C5”) at the door.',
    'Ticket holders are notified automatically when you change date or venue.',
  ],
  admin: [
    'Filter the audit log by event to query just one shard.',
    'Every 403 shows up under Recent security events.',
    'Pin announcements to the top of the Community board.',
    'Changing a role signs that user out everywhere instantly.',
    'Run npm run load-test, then watch the activity chart spike.',
  ],
};

function useNow(serverNow: string) {
  const [skew] = useState(() => Date.now() - new Date(serverNow).getTime());
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() - skew), 1000);
    return () => clearInterval(t);
  }, [skew]);
  return now;
}

/** Live countdown to the user's next show (or the organizer's next event). */
export function NextShowCard({ next, serverNow }: { next: NonNullable<SidebarInfo['next']>; serverNow: string }) {
  const now = useNow(serverNow);
  const left = Math.max(0, new Date(next.at).getTime() - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <Link href={next.href} className="brand-gradient block rounded-xl p-3 text-white shadow-md shadow-primary/25 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase opacity-85">
        <TimerIcon className="size-3.5" /> {next.label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{next.name}</div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        {(
          [
            [d, 'days'],
            [h, 'hrs'],
            [m, 'min'],
            [s, 'sec'],
          ] as const
        ).map(([v, l]) => (
          <div key={l} className="rounded-md bg-white/15 py-1">
            <div className="font-mono text-sm leading-none font-semibold tabular-nums">{String(v).padStart(2, '0')}</div>
            <div className="mt-0.5 text-[9px] opacity-80">{l}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function QuickStats({ stats }: { stats: SidebarInfo['stats'] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border bg-background/60 px-2 py-1.5 text-center">
          <div className="text-sm font-semibold tabular-nums">{s.value}</div>
          <div className="truncate text-[10px] text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Rotating tips (auto-advances every 7s, pauses on hover, click to go next). */
export function TipCarousel({ role }: { role: string }) {
  const tips = TIPS[role] ?? TIPS.student;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % tips.length), 7000);
    return () => clearInterval(t);
  }, [paused, tips.length]);
  return (
    <button
      type="button"
      onClick={() => setI((x) => (x + 1) % tips.length)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="w-full rounded-xl border bg-gradient-to-br from-amber-500/10 to-primary/5 p-3 text-left"
      aria-label="Next tip"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <LightbulbIcon className="size-3.5" /> Tip {i + 1}/{tips.length}
      </div>
      <p key={i} className="mt-1 min-h-10 animate-in text-xs leading-relaxed duration-500 fade-in slide-in-from-right-2">
        {tips[i]}
      </p>
      <div className="mt-2 flex gap-1">
        {tips.map((_, k) => (
          <span key={k} className={cn('h-1 rounded-full transition-all', k === i ? 'w-4 bg-primary' : 'w-1 bg-muted-foreground/30')} />
        ))}
      </div>
    </button>
  );
}

const CONFETTI_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9'];

/** 🎉 Fest mode: a burst of CSS confetti across the screen. */
export function ConfettiButton() {
  const [pieces, setPieces] = useState<{ id: number; left: number; delay: number; color: string; size: number; spin: number }[]>([]);
  function burst() {
    const seed = Date.now();
    setPieces(
      Array.from({ length: 70 }, (_, k) => ({
        id: seed + k,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        color: CONFETTI_COLORS[k % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 6,
        spin: Math.random() > 0.5 ? 1 : -1,
      }))
    );
    setTimeout(() => setPieces([]), 2800);
  }
  return (
    <>
      <button
        type="button"
        onClick={burst}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
      >
        <PartyPopperIcon className="size-3.5" /> Fest mode
      </button>
      {pieces.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
          {pieces.map((p) => (
            <span
              key={p.id}
              className="confetti-piece"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size * 0.45,
                background: p.color,
                animationDelay: `${p.delay}s`,
                ['--spin' as string]: p.spin,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
