'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, MapPinIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CarouselEvent = {
  id: string;
  name: string;
  venue: string | null;
  month: string;
  day: string;
  time: string;
  price: string;
  imageUrl: string | null;
  available: number;
  total: number;
  open: boolean;
};

function advance(el: HTMLDivElement | null, dir: 1 | -1) {
  if (!el) return;
  const card = el.querySelector<HTMLElement>('[data-card]');
  const step = (card?.offsetWidth ?? 320) + 20;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
  el.scrollTo({ left: dir === 1 && atEnd ? 0 : el.scrollLeft + dir * step, behavior: 'smooth' });
}

/** Scroll-snap carousel: swipe on phones, arrows on desktop, auto-advances until touched. */
export function EventCarousel({ events }: { events: CarouselEvent[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(true);
  const scrollBy = (dir: 1 | -1) => advance(track.current, dir);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => advance(track.current, 1), 4500);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <div className="relative" onPointerDown={() => setAuto(false)} onMouseEnter={() => setAuto(false)} onMouseLeave={() => setAuto(true)}>
      <div ref={track} className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/login?next=${encodeURIComponent(`/events/${e.id}`)}`}
            data-card
            className="tilt-3d group w-[78%] shrink-0 snap-start overflow-hidden rounded-3xl border bg-card shadow-lg shadow-primary/5 sm:w-[46%] lg:w-[31.5%]"
          >
            <div className="relative h-44 overflow-hidden">
              {e.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- our own stored image
                <img src={e.imageUrl} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-110" />
              ) : (
                <div className="brand-gradient size-full">
                  <div className="size-full opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.5px, transparent 0)', backgroundSize: '16px 16px' }} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute top-3 left-3 rounded-xl bg-white/95 px-2.5 py-1.5 text-center leading-none text-foreground shadow-md dark:bg-black/70 dark:text-white">
                <div className="text-[10px] font-semibold tracking-widest text-primary">{e.month}</div>
                <div className="text-xl font-bold tabular-nums">{e.day}</div>
              </div>
              <span className="absolute top-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-foreground dark:bg-black/70 dark:text-white">{e.price}</span>
              <div className="absolute right-4 bottom-3 left-4 text-white">
                <div className="truncate text-lg font-semibold">{e.name}</div>
                <div className="flex items-center gap-1 text-xs opacity-90">
                  <MapPinIcon className="size-3" /> {e.venue ?? 'TBA'} · {e.time}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="text-sm">
                {e.open ? (
                  <>
                    <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">{e.available}</span>
                    <span className="text-muted-foreground"> of {e.total} seats left</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Booking closed</span>
                )}
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                Book <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => scrollBy(-1)} aria-label="Previous events">
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon" onClick={() => scrollBy(1)} aria-label="Next events">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
