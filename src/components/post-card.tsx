import Link from 'next/link';
import { HeartIcon, MessageCircleIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
import type { PostView } from '@/lib/services/community';
import type { CurrentUser } from '@/lib/session';
import { initials, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ActionForm, SubmitButton } from './action-form';
import { FormMeta } from './common';
import { RoleBadge } from './site-nav';
import { CommentsSheet } from './comments-sheet';

export function PostCard({ post, user, redirect, linkToThread = true }: { post: PostView; user: CurrentUser; redirect: string; linkToThread?: boolean }) {
  const removed = !!post.deleted_at;
  const canDelete = !removed && (post.author_id === user.id || user.role === 'admin');
  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5',
        post.pinned && 'border-primary/40 bg-gradient-to-br from-primary/5 to-transparent',
        removed && 'border-dashed opacity-60'
      )}
    >
      <header className="flex items-start gap-3">
        <Avatar className="size-9">
          <AvatarFallback className={cn('text-xs font-semibold', post.author_role === 'student' ? 'bg-primary/10 text-primary' : 'brand-gradient text-white')}>
            {initials(post.author_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{post.author_name}</span>
            {post.author_role !== 'student' && <RoleBadge role={post.author_role} />}
            <span className="text-xs text-muted-foreground">· {timeAgo(post.created_at)}</span>
            {post.pinned && (
              <Badge variant="secondary" className="gap-1">
                <PinIcon /> Pinned
              </Badge>
            )}
          </div>
          {post.event_name && post.event_id && (
            <Link href={`/events/${post.event_id}`} className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline">
              # {post.event_name}
            </Link>
          )}
        </div>
      </header>

      {removed ? (
        <p className="mt-3 text-sm text-muted-foreground italic">
          Removed{post.deleted_by_name ? ` by ${post.deleted_by_name}` : ''}. Only admins can see this.
          <span className="mt-2 block whitespace-pre-wrap not-italic line-through">{post.body}</span>
        </p>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{post.body}</p>
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- user images from our own storage bucket
            <img src={post.image_url} alt="" loading="lazy" className="mt-3 max-h-[28rem] w-full rounded-xl border object-cover" />
          )}
        </>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-1">
        {!removed && (
          <ActionForm action={`/api/posts/${post.id}/like`}>
            <FormMeta user={user} redirect={redirect} />
            <SubmitButton variant="ghost" size="sm" className={cn('gap-1.5', post.liked_by_me && 'text-rose-500 hover:text-rose-600')} aria-pressed={post.liked_by_me}>
              <HeartIcon className={cn(post.liked_by_me && 'fill-current')} />
              <span className="tabular-nums">{post.like_count}</span>
            </SubmitButton>
          </ActionForm>
        )}
        {linkToThread ? (
          <CommentsSheet
            postId={post.id}
            count={post.comment_count}
            csrfToken={user.csrfToken}
            authorName={post.author_name}
            excerpt={post.body.slice(0, 140)}
            disabled={removed}
          />
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 text-[0.8rem] text-muted-foreground">
            <MessageCircleIcon className="size-3.5" /> {post.comment_count}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {user.role === 'admin' && !removed && (
            <ActionForm action={`/api/posts/${post.id}/pin`}>
              <FormMeta user={user} redirect={redirect} />
              <SubmitButton variant="ghost" size="sm" aria-label={post.pinned ? 'Unpin' : 'Pin'}>
                {post.pinned ? <PinOffIcon /> : <PinIcon />}
                <span className="hidden sm:inline">{post.pinned ? 'Unpin' : 'Pin'}</span>
              </SubmitButton>
            </ActionForm>
          )}
          {canDelete && (
            <ActionForm action={`/api/posts/${post.id}/delete`} confirm={post.author_id === user.id ? 'Delete your post?' : `Remove this post by ${post.author_name}? (moderation)`}>
              <FormMeta user={user} redirect="/community" />
              <SubmitButton variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" aria-label="Delete post">
                <Trash2Icon />
                <span className="hidden sm:inline">{post.author_id === user.id ? 'Delete' : 'Remove'}</span>
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </footer>
    </article>
  );
}
