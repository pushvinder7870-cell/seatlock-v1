'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Circular mm:ss countdown. Corrects for client/server clock skew using the server's render time. */
export function Countdown({ expiresAt, serverNow, totalMs = 5 * 60_000 }: { expiresAt: string; serverNow: string; totalMs?: number }) {
  const router = useRouter();
  const [skew] = useState(() => Date.now() - new Date(serverNow).getTime());
  const [now, setNow] = useState(() => new Date(serverNow).getTime());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() - skew), 1000);
    return () => clearInterval(t);
  }, [skew]);

  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  useEffect(() => {
    if (left === 0) {
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [left, router]);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, left / totalMs);
  const urgent = left < 60_000;

  return (
    <div className="relative grid size-16 shrink-0 place-items-center" role="timer" aria-label={`${m} minutes ${s} seconds left`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', urgent ? 'stroke-rose-500' : 'stroke-sky-500')}
        />
      </svg>
      <span className={cn('font-mono text-sm font-semibold tabular-nums', urgent && 'text-rose-600 dark:text-rose-400')}>
        {left === 0 ? '0:00' : `${m}:${String(s).padStart(2, '0')}`}
      </span>
    </div>
  );
}
