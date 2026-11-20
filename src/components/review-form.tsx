'use client';

import { useState } from 'react';
import { BadgeCheckIcon, SendIcon, StarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionForm, SubmitButton } from './action-form';

const LABELS = ['', 'Poor', 'Meh', 'Good', 'Great', 'Unforgettable'];

/** Write or edit a review. Only events the student actually booked are offered (server re-checks). */
export function ReviewForm({ csrfToken, events }: { csrfToken: string; events: { id: string; name: string; my_rating: number | null; checked_in: boolean }[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const current = events.find((e) => e.id === eventId);
  const [rating, setRating] = useState(current?.my_rating ?? 0);
  const [hover, setHover] = useState(0);
  const [key, setKey] = useState(0);
  const shown = hover || rating;

  return (
    <ActionForm
      key={key}
      action="/api/reviews"
      className="space-y-4"
      onSuccess={() => {
        setRating(0);
        setKey((k) => k + 1);
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="rating" value={rating || ''} />
      <div className="space-y-2">
        <Label htmlFor="review-event">Event you attended</Label>
        <select
          id="review-event"
          name="eventId"
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setRating(events.find((x) => x.id === e.target.value)?.my_rating ?? 0);
          }}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.my_rating ? ' (edit your review)' : ''}
            </option>
          ))}
        </select>
        {current?.checked_in && (
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <BadgeCheckIcon className="size-3.5" /> Checked in: your review gets a verified badge
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Your rating</Label>
        <div className="flex items-center gap-3" onMouseLeave={() => setHover(0)}>
          <div className="flex" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <StarIcon className={cn('size-7', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
              </button>
            ))}
          </div>
          <span className="text-sm font-medium text-muted-foreground">{LABELS[shown]}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea id="review-body" name="body" required maxLength={1000} rows={4} placeholder="What was great? What could be better?" />
      </div>
      <SubmitButton className="w-full" disabled={!rating || !eventId}>
        <SendIcon /> Publish review
      </SubmitButton>
    </ActionForm>
  );
}
