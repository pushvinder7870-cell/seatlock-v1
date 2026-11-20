// Runs once when the Next.js server starts. Starts the hold-expiry sweeper
// (Node.js runtime only). Expired holds are also handled lazily: the seat map
// treats them as available immediately, and holdSeats/confirmHold reclaim
// them under lock, so the sweeper only tidies up and writes HOLD_EXPIRED.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const g = globalThis as unknown as { __seatlockSweeper?: NodeJS.Timeout };
  if (g.__seatlockSweeper) return;
  const { expireStaleHolds } = await import('./lib/services/booking');
  const intervalMs = Number(process.env.HOLD_SWEEP_INTERVAL_MS ?? 15000);
  g.__seatlockSweeper = setInterval(() => {
    expireStaleHolds()
      .then((n) => n > 0 && console.log(`[sweeper] expired ${n} hold(s)`))
      .catch((e) => console.error('[sweeper] failed', e.message));
  }, intervalMs);
  g.__seatlockSweeper.unref?.();
}
