'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Real-time" by polling: every few seconds (only while the tab is visible) ask
 * the server to re-render this page. React reconciles the new server output into
 * the existing UI, so typed-but-unsent text in forms is preserved.
 * Cheap, works on any host (no websockets needed on serverless).
 */
export function LiveRefresh({ intervalMs = 5000, label = 'Live' }: { intervalMs?: number; label?: string }) {
  const router = useRouter();
  const [tick, setTick] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
      setTick(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, router]);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <span className="live-dot relative size-2 rounded-full bg-emerald-500 text-emerald-500" />
      {label}
      {tick && <span className="hidden tabular-nums sm:inline">· {tick}</span>}
    </span>
  );
}
