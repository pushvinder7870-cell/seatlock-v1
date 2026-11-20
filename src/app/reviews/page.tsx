import Link from 'next/link';
import { BadgeCheckIcon, MessageSquareQuoteIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { listReviews, ratingSummaries, reviewableEvents } from '@/lib/services/reviews';
import { initials, timeAgo } from '@/lib/format';
import { dateParts } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, FormMeta, PageHeader } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { LiveRefresh } from '@/components/live-refresh';
import { ReviewForm } from '@/components/review-form';
import { Stars } from '@/components/stars';

export const metadata = { title: 'Reviews' };

export default async function ReviewsPage({ searchParams }: PageProps<'/reviews'>) {
  const user = await requireUser();
  const sp = await searchParams;
  const eventId = typeof sp.event === 'string' && sp.event ? sp.event : undefined;
  const [reviews, ratings, eligible] = await Promise.all([guard(listReviews(user, { eventId })), ratingSummaries(), reviewableEvents(user)]);
  const live = reviews.filter((r) => !r.deleted_at);
  const overall = live.length ? live.reduce((s, r) => s + r.rating, 0) / live.length : 0;
  const selected = eventId ? ratings.find((r) => r.event_id === eventId) : undefined;

  return (
    <>
      <PageHeader
        icon={StarIcon}
        eyebrow="Reviews"
        title="What people thought"
        description="Honest reviews from students who actually booked the show. Only verified ticket holders can post."
        actions={<LiveRefresh label="Live" intervalMs={8000} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Event rating summaries */}
          {ratings.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {ratings.map((r) => {
                const p = dateParts(r.event_date);
                const max = Math.max(...r.dist, 1);
                return (
                  <Link
                    key={r.event_id}
                    href={eventId === r.event_id ? '/reviews' : `/reviews?event=${r.event_id}`}
                    className={cn(
                      'group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10',
                      eventId === r.event_id && 'border-primary ring-3 ring-primary/15'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold group-hover:text-primary">{r.event_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.day} {p.month} · {r.count} review{r.count === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl leading-none font-semibold tabular-nums">{r.average.toFixed(1)}</div>
                        <Stars value={r.average} size="size-3.5" className="mt-1" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-1">
                      {[5, 4, 3, 2, 1].map((star) => (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-muted-foreground tabular-nums">{star}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-amber-400" style={{ width: `${(100 * r.dist[star - 1]) / max}%` }} />
                          </div>
                          <span className="w-4 text-right text-muted-foreground tabular-nums">{r.dist[star - 1]}</span>
                        </div>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              {selected ? `Reviews for ${selected.event_name}` : 'Latest reviews'}
            </h2>
            {eventId && (
              <Link href="/reviews" className="text-xs text-primary hover:underline">
                Show all
              </Link>
            )}
          </div>

          {reviews.length === 0 ? (
            <EmptyState icon={MessageSquareQuoteIcon} title="No reviews yet" description="Reviews appear here once ticket holders share their experience." />
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => {
                const canDelete = !r.deleted_at && (r.author_id === user.id || user.role === 'admin');
                return (
                  <article key={r.id} className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', r.deleted_at && 'border-dashed opacity-60')}>
                    <div className="flex items-start gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(r.author_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{r.author_name}</span>
                          <span className={cn('inline-flex items-center gap-1 text-xs', r.checked_in ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                            <BadgeCheckIcon className="size-3.5" /> {r.checked_in ? 'Verified attendee' : 'Ticket holder'}
                          </span>
                          <span className="text-xs text-muted-foreground">· {timeAgo(r.updated_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Stars value={r.rating} />
                          <Link href={`/reviews?event=${r.event_id}`} className="text-xs font-medium text-primary hover:underline">
                            # {r.event_name}
                          </Link>
                        </div>
                        <p className={cn('mt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap', r.deleted_at && 'line-through')}>{r.body}</p>
                        {r.deleted_at && <p className="mt-1 text-xs text-destructive">Removed. Visible to admins only.</p>}
                      </div>
                      {canDelete && (
                        <ActionForm action={`/api/reviews/${r.id}/delete`} confirm={r.author_id === user.id ? 'Delete your review?' : 'Remove this review? (moderation)'}>
                          <FormMeta user={user} />
                          <SubmitButton variant="ghost" size="icon-sm" aria-label="Delete review" className="text-muted-foreground hover:text-destructive">
                            <Trash2Icon />
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="brand-gradient grid size-14 place-items-center rounded-2xl text-2xl font-semibold text-white shadow-lg shadow-primary/25">
                {overall ? overall.toFixed(1) : '–'}
              </div>
              <div>
                <Stars value={overall} />
                <div className="mt-1 text-sm text-muted-foreground">
                  {live.length} review{live.length === 1 ? '' : 's'} {eventId ? 'for this event' : 'overall'}
                </div>
              </div>
            </CardContent>
          </Card>

          {user.role === 'student' && (
            <Card>
              <CardHeader>
                <CardTitle>Write a review</CardTitle>
                <CardDescription>Tag an event you booked. Submitting again updates your review.</CardDescription>
              </CardHeader>
              <CardContent>
                {eligible.length ? (
                  <ReviewForm csrfToken={user.csrfToken} events={eligible} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Book a show first. Only ticket holders can review.{' '}
                    <Link href="/events" className="text-primary hover:underline">
                      Browse events →
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
