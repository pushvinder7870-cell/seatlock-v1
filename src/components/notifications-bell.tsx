'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  HeartIcon,
  MessageCircleIcon,
  ReplyIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StarIcon,
  TicketCheckIcon,
  UserCheckIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; ago: string };

const ICONS: Record<string, [React.ComponentType<{ className?: string }>, string]> = {
  post_like: [HeartIcon, 'text-rose-500 bg-rose-500/10'],
  comment_like: [HeartIcon, 'text-rose-500 bg-rose-500/10'],
  comment: [MessageCircleIcon, 'text-sky-500 bg-sky-500/10'],
  reply: [ReplyIcon, 'text-sky-500 bg-sky-500/10'],
  booking_confirmed: [TicketCheckIcon, 'text-emerald-500 bg-emerald-500/10'],
  checked_in: [UserCheckIcon, 'text-emerald-500 bg-emerald-500/10'],
  event_updated: [CalendarClockIcon, 'text-amber-500 bg-amber-500/10'],
  review: [StarIcon, 'text-amber-500 bg-amber-500/10'],
  moderation: [ShieldAlertIcon, 'text-destructive bg-destructive/10'],
  welcome: [SparklesIcon, 'text-primary bg-primary/10'],
};

/** Bell with unread badge. Polls every 15 s (and when the menu opens). */
export function NotificationsBell({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items);
      setUnread(json.unread);
    } catch {}
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => !document.hidden && load(), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function markRead(id?: string) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(id ? { id } : {}),
    }).catch(() => {});
    load();
  }

  return (
    <DropdownMenu onOpenChange={(o) => o && load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <BellIcon />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={() => markRead()} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <CheckCheckIcon className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n) => {
              const [Icon, tone] = ICONS[n.type] ?? ICONS.welcome;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead(n.id);
                    if (n.link) router.push(n.link);
                  }}
                  className={cn('flex w-full gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60', !n.read_at && 'bg-primary/5')}
                >
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{n.ago}</span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
