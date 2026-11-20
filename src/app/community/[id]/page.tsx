import Link from 'next/link';
import { ArrowLeftIcon, MessageCircleIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getPost } from '@/lib/services/community';
import { initials, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormMeta } from '@/components/common';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { PostCard } from '@/components/post-card';
import { RoleBadge } from '@/components/site-nav';

export const metadata = { title: 'Discussion' };

export default async function PostPage({ params }: PageProps<'/community/[id]'>) {
  const user = await requireUser();
  const { id } = await params;
  const { post, comments } = await guard(getPost(user, id));
  const here = `/community/${id}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/community">
          <ArrowLeftIcon /> Back to the board
        </Link>
      </Button>

      <PostCard post={post} user={user} redirect={here} linkToThread={false} />

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MessageCircleIcon className="size-4" /> {comments.filter((c) => !c.deleted_at).length} comments
        </h2>

        <div className="space-y-3">
          {comments.map((c) => {
            const canDelete = !c.deleted_at && (c.author_id === user.id || user.role === 'admin');
            return (
              <div key={c.id} className={cn('flex gap-3 rounded-xl border bg-card p-3 sm:p-4', c.parent_id && 'ml-8 sm:ml-12', c.deleted_at && 'border-dashed opacity-60')}>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">{initials(c.author_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">{c.author_name}</span>
                    {c.author_role !== 'student' && <RoleBadge role={c.author_role} />}
                    <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                    {c.deleted_at && <span className="text-xs text-destructive">removed</span>}
                  </div>
                  <p className={cn('mt-1 text-sm break-words whitespace-pre-wrap', c.deleted_at && 'line-through')}>{c.body}</p>
                </div>
                {canDelete && (
                  <ActionForm action={`/api/comments/${c.id}/delete`} confirm="Delete this comment?">
                    <FormMeta user={user} redirect={here} />
                    <SubmitButton variant="ghost" size="icon-sm" aria-label="Delete comment" className="text-muted-foreground hover:text-destructive">
                      <Trash2Icon />
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            );
          })}
        </div>

        {!post.deleted_at && (
          <ActionForm action={`/api/posts/${id}/comments`} className="mt-4 flex gap-3 rounded-2xl border bg-card p-3 shadow-sm">
            <FormMeta user={user} redirect={here} />
            <Avatar className="hidden size-8 sm:flex">
              <AvatarFallback className="brand-gradient text-[11px] font-semibold text-white">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <Textarea name="body" required maxLength={1000} rows={2} placeholder="Write a comment…" className="min-h-10 flex-1 resize-none" />
            <SubmitButton className="self-end">
              <SendIcon /> <span className="hidden sm:inline">Reply</span>
            </SubmitButton>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
