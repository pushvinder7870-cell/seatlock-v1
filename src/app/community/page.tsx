import Link from 'next/link';
import { FlameIcon, HeartIcon, MessageCircleIcon, MessagesSquareIcon, ShieldIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { communityStats, listPosts, type PostSort } from '@/lib/services/community';
import { listEvents } from '@/lib/services/events';
import { initials } from '@/lib/format';
import { dateParts } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, StatCard } from '@/components/common';
import { PostCard } from '@/components/post-card';
import { PostComposer } from '@/components/post-composer';
import { LiveRefresh } from '@/components/live-refresh';
import { imageUploadsEnabled } from '@/lib/services/storage';

export const metadata = { title: 'Community' };

export default async function CommunityPage({ searchParams }: PageProps<'/community'>) {
  const user = await requireUser();
  const sp = await searchParams;
  const sort: PostSort = sp.sort === 'latest' ? 'latest' : 'hot';
  const eventId = typeof sp.event === 'string' && sp.event ? sp.event : undefined;

  const [posts, events, stats] = await Promise.all([
    guard(listPosts(user, { sort, eventId })),
    guard(listEvents(user)),
    user.role === 'admin' ? guard(communityStats(user)) : Promise.resolve(null),
  ]);
  const upcoming = events.filter((e) => e.booking_open).slice(0, 4);
  const tab = (s: PostSort) => `/community?sort=${s}${eventId ? `&event=${eventId}` : ''}`;
  const filteredEvent = eventId ? events.find((e) => e.id === eventId) : undefined;

  return (
    <>
      <PageHeader
        icon={MessagesSquareIcon}
        eyebrow="Community"
        title="Fest board"
        description="Talk about the shows, find seat buddies, ask organizers questions. Be kind. Moderators can remove posts."
        actions={<LiveRefresh label="Live feed" />}
      />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Live posts" value={stats.posts} icon={MessagesSquareIcon} hint={`${stats.today} in the last 24h`} />
          <StatCard label="Comments" value={stats.comments} icon={MessageCircleIcon} tone="info" />
          <StatCard label="Likes" value={stats.likes} icon={HeartIcon} tone="danger" />
          <StatCard label="Removed (moderated)" value={stats.removed} icon={ShieldIcon} tone="warning" hint="visible to admins only" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <PostComposer
            csrfToken={user.csrfToken}
            initialsText={initials(user.name)}
            uploadsEnabled={imageUploadsEnabled()}
            events={events.filter((e) => e.status === 'published').map((e) => ({ id: e.id, name: e.name }))}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border bg-muted/50 p-1">
              {(
                [
                  ['hot', 'Hot', FlameIcon],
                  ['latest', 'Latest', SparklesIcon],
                ] as const
              ).map(([s, label, Icon]) => (
                <Link
                  key={s}
                  href={tab(s)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors',
                    sort === s && 'bg-background font-medium text-foreground shadow-sm'
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </Link>
              ))}
            </div>
            {filteredEvent && (
              <Link href={`/community?sort=${sort}`} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15">
                # {filteredEvent.name} ✕
              </Link>
            )}
          </div>

          {posts.length === 0 ? (
            <EmptyState icon={MessagesSquareIcon} title="No posts yet" description="Be the first to say something!" />
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} user={user} redirect={tab(sort)} />)
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Browse by event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcoming.map((e) => {
                const p = dateParts(e.event_date);
                return (
                  <Link
                    key={e.id}
                    href={`/community?sort=${sort}&event=${e.id}`}
                    className={cn('flex items-center gap-3 rounded-lg p-2 hover:bg-muted', eventId === e.id && 'bg-accent')}
                  >
                    <span className="brand-gradient grid size-9 shrink-0 place-items-center rounded-lg text-[10px] leading-tight font-semibold text-white">
                      {p.month}
                      <br />
                      {p.day}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">{e.available} seats left</span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldIcon className="size-4 text-primary" /> House rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>• No selling or scalping seats. Bookings are personal.</p>
              <p>• Posting is rate-limited (5 posts / 10 min) to stop spam.</p>
              <p className="flex items-center gap-1">
                • <Trash2Icon className="size-3" /> Admins can remove any post; removals are audited.
              </p>
              <p>• &ldquo;Hot&rdquo; ranks by likes + comments, decaying with age.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
