'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BanIcon, LockIcon, LockOpenIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SeatView } from '@/lib/services/events';
import { ActionForm, SubmitButton } from './action-form';

type Mode = 'student' | 'organizer' | 'view';

type Props = {
  eventId: string;
  initialSeats: SeatView[];
  mode: Mode;
  csrfToken: string;
  maxSelect: number;
  myHoldId: string | null;
  live?: boolean;
};

const POLL_MS = 4000;

function seatClass(s: SeatView) {
  if (s.state === 'available') return 'seat seat-available';
  if (s.state === 'blocked') return 'seat seat-blocked';
  if (s.state === 'held') return s.mine ? 'seat seat-held-mine' : 'seat seat-held';
  return s.mine ? 'seat seat-booked-mine' : 'seat seat-booked';
}

function seatTitle(s: SeatView) {
  const label = { available: 'Available', held: 'On hold', booked: 'Booked', blocked: 'Blocked by organizer' }[s.state];
  return `Seat ${s.number} · ${label}${s.mine ? ' (yours)' : ''}${s.holder ? ` · ${s.holder}` : ''}`;
}

function selectableFor(mode: Mode, s: SeatView) {
  // Your own held seats are kept automatically when you add more, so only free seats are selectable.
  if (mode === 'student') return s.state === 'available';
  if (mode === 'organizer') return s.state === 'available' || s.state === 'blocked';
  return false;
}

export function SeatMap({ eventId, initialSeats, mode, csrfToken, maxSelect, myHoldId, live = true }: Props) {
  const router = useRouter();
  const [seats, setSeats] = useState(initialSeats);
  const [prevInitial, setPrevInitial] = useState(initialSeats);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const holdRef = useRef(myHoldId);

  if (prevInitial !== initialSeats) {
    setPrevInitial(initialSeats);
    setSeats(initialSeats);
  }
  useEffect(() => {
    holdRef.current = myHoldId;
  }, [myHoldId]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/seats`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: { seats: SeatView[]; myHold: { id: string } | null } = await res.json();
      setSeats(data.seats);
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      const ok = new Set(data.seats.filter((s) => selectableFor(mode, s)).map((s) => s.number));
      setSelected((prev) => {
        const lost = [...prev].filter((n) => !ok.has(n));
        if (lost.length) toast.warning(`Seat ${lost.join(', ')} was just taken by someone else.`);
        return lost.length ? new Set([...prev].filter((n) => ok.has(n))) : prev;
      });
      if ((data.myHold?.id ?? null) !== holdRef.current) {
        holdRef.current = data.myHold?.id ?? null;
        router.refresh();
      }
    } catch {}
  }, [eventId, mode, router]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [live, refresh]);

  const rows = useMemo(() => {
    const m = new Map<string, SeatView[]>();
    for (const s of seats) m.set(s.row, [...(m.get(s.row) ?? []), s]);
    return [...m.entries()];
  }, [seats]);

  const counts = useMemo(() => {
    const c = { available: 0, held: 0, booked: 0, blocked: 0 };
    for (const s of seats) c[s.state]++;
    return c;
  }, [seats]);

  const atLimit = mode === 'student' && selected.size >= maxSelect;
  const toggle = (n: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });

  const renderSeat = (s: SeatView) =>
    selectableFor(mode, s) ? (
      <label key={s.id} title={seatTitle(s)}>
        <input
          type="checkbox"
          name="seats"
          value={s.number}
          className="seat-input sr-only"
          checked={selected.has(s.number)}
          disabled={atLimit && !selected.has(s.number)}
          onChange={(e) => toggle(s.number, e.target.checked)}
          aria-label={seatTitle(s)}
        />
        <span className={seatClass(s)}>{s.index}</span>
      </label>
    ) : (
      <span key={s.id} title={seatTitle(s)} aria-label={seatTitle(s)} className={seatClass(s)}>
        {s.state === 'blocked' ? <XIcon className="size-3" /> : s.index}
      </span>
    );

  const panel = (
    <div className="auditorium overflow-hidden rounded-2xl p-4 shadow-xl shadow-primary/10 ring-1 ring-white/5 sm:p-8">
      <div className="mb-6 flex items-center justify-between text-xs text-white/60">
        <span>
          <span className="font-semibold text-emerald-300 tabular-nums">{counts.available}</span> available
          <span className="mx-1.5 opacity-40">·</span>
          <span className="tabular-nums">{seats.length}</span> seats
        </span>
        {live && (
          <span className="flex items-center gap-2">
            <span className="live-dot relative size-2 rounded-full bg-emerald-400 text-emerald-400" />
            Live{updatedAt && <span className="hidden sm:inline"> · {updatedAt}</span>}
          </span>
        )}
      </div>

      <div className="mx-auto mb-10 w-full max-w-lg">
        <div className="stage-arc h-1.5 rounded-full" />
        <div className="mt-3 text-center text-[10px] font-semibold tracking-[0.5em] text-white/50">STAGE</div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex w-max flex-col gap-1.5 sm:gap-2">
          {rows.map(([row, rowSeats]) => {
            const half = Math.ceil(rowSeats.length / 2);
            return (
              <div key={row} className="flex items-center gap-1.5 sm:gap-2">
                <span className="w-4 text-right font-mono text-[11px] text-white/40">{row}</span>
                {rowSeats.slice(0, half).map(renderSeat)}
                <span className="w-3 sm:w-6" aria-hidden />
                {rowSeats.slice(half).map(renderSeat)}
                <span className="w-4 font-mono text-[11px] text-white/40">{row}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Legend mode={mode} />
    </div>
  );

  if (mode === 'view') return panel;

  const list = [...selected].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <ActionForm
      action={mode === 'student' ? `/api/events/${eventId}/hold` : `/api/events/${eventId}/block`}
      onSuccess={() => setSelected(new Set())}
      onError={(json) => {
        const lost = (json.unavailableSeats as { seat: string }[] | undefined)?.map((u) => u.seat) ?? [];
        if (lost.length) setSelected((prev) => new Set([...prev].filter((n) => !lost.includes(n))));
        refresh();
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="_redirect" value={`/events/${eventId}`} />
      {panel}

      <div className="sticky bottom-24 z-10 mt-4 md:bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-card/90 p-3 shadow-lg backdrop-blur-lg sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {mode === 'student' ? (
              <>
                Your selection · <span className="tabular-nums">{selected.size}</span>/{maxSelect}
                {atLimit && <span className="text-amber-600 dark:text-amber-400"> · limit reached</span>}
              </>
            ) : (
              'Selected seats'
            )}
          </div>
          <div className="mt-1 flex min-h-6 flex-wrap gap-1">
            {list.length ? (
              list.map((n) => (
                <Badge key={n} variant="secondary" className="font-mono">
                  {n}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                {mode === 'student'
                  ? maxSelect > 0
                    ? `Tap up to ${maxSelect} green seat${maxSelect === 1 ? '' : 's'}. They're added to your hold.`
                    : 'You have the maximum of 4 seats (held + booked).'
                  : 'Select available seats to block, or blocked seats to release.'}
              </span>
            )}
          </div>
        </div>
        {selected.size > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        )}
        {mode === 'student' ? (
          <SubmitButton size="lg" className="h-10 px-4" disabled={selected.size === 0}>
            <LockIcon /> Hold {selected.size > 0 ? selected.size : ''} seat{selected.size === 1 ? '' : 's'} · 5 min
          </SubmitButton>
        ) : (
          <div className="flex gap-2">
            <SubmitButton name="op" value="unblock" variant="outline" disabled={selected.size === 0}>
              <LockOpenIcon /> Unblock
            </SubmitButton>
            <SubmitButton name="op" value="block" disabled={selected.size === 0}>
              <BanIcon /> Block
            </SubmitButton>
          </div>
        )}
      </div>
    </ActionForm>
  );
}

function Legend({ mode }: { mode: Mode }) {
  const items: [string, string][] = [
    ['seat seat-available', 'Available'],
    ...(mode !== 'view' ? ([['seat seat-selected', 'Selected']] as [string, string][]) : []),
    ['seat seat-held', 'On hold'],
    ...(mode === 'student'
      ? ([
          ['seat seat-held-mine', 'Your hold'],
          ['seat seat-booked-mine', 'Your seat'],
        ] as [string, string][])
      : []),
    ['seat seat-booked', 'Booked'],
    ['seat seat-blocked', 'Blocked'],
  ];
  return (
    <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-white/60">
      {items.map(([cls, label]) => (
        <li key={label} className="flex items-center gap-2">
          <span className={cn(cls, '!size-4 !transform-none after:hidden')} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
