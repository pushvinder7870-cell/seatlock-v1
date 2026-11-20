'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartIcon, Loader2Icon, MessageCircleIcon, ReplyIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ActionForm, SubmitButton } from './action-form';

type Comment = {
  id: string;
  parentId: string | null;
  likes: number;
  liked: boolean;
  body: string;
  author: string;
  initials: string;
  role: string;
  ago: string;
  deleted: boolean;
  canDelete: boolean;
};

/**
 * Comments open in a slide-over sheet (right on desktop, full width on phones).
 * Supports likes and one level of replies. While open it polls every 4 s so
 * new comments from others appear live. The trigger is a real link to the
 * thread page, so it still works without JavaScript.
 */
export function CommentsSheet({
  postId,
  count,
  csrfToken,
  authorName,
  excerpt,
  disabled,
}: {
  postId: string;
  count: number;
  csrfToken: string;
  authorName: string;
  excerpt: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/posts/${postId}/comments`, { cache: 'no-store' });
    if (res.ok) setComments((await res.json()).comments);
  }, [postId]);

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [open, load]);

  // Group replies under their top-level comment (one pass, O(n)).
  const threads = useMemo(() => {
    if (!comments) return null;
    const replies = new Map<string, Comment[]>();
    for (const c of comments) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
    return comments.filter((c) => !c.parentId).map((c) => ({ c, replies: replies.get(c.id) ?? [] }));
  }, [comments]);

  const renderComment = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={cn('flex gap-2.5', c.deleted && 'opacity-50', isReply && 'ml-10')}>
      <Avatar className={isReply ? 'size-7' : 'size-8'}>
        <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">{c.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-medium">{c.author}</span>
            {c.role !== 'student' && <span className="text-primary capitalize">{c.role}</span>}
            <span className="text-muted-foreground">{c.ago}</span>
            {c.deleted && <span className="text-destructive">removed</span>}
          </div>
          <p className={cn('mt-0.5 text-sm break-words whitespace-pre-wrap', c.deleted && 'line-through')}>{c.body}</p>
        </div>
        {!c.deleted && (
          <div className="mt-0.5 flex items-center gap-1 pl-1">
            <ActionForm action={`/api/comments/${c.id}/like`} stay onSuccess={load}>
              <input type="hidden" name="_csrf" value={csrfToken} />
              <SubmitButton variant="ghost" size="xs" className={cn('text-muted-foreground', c.liked && 'text-rose-500')} aria-pressed={c.liked}>
                <HeartIcon className={cn(c.liked && 'fill-current')} /> {c.likes > 0 && <span className="tabular-nums">{c.likes}</span>}
              </SubmitButton>
            </ActionForm>
            {!disabled && (
              <button
                type="button"
                onClick={() => setReplyTo({ id: c.parentId ?? c.id, author: c.author })}
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ReplyIcon className="size-3" /> Reply
              </button>
            )}
            {c.canDelete && (
              <ActionForm action={`/api/comments/${c.id}/delete`} confirm="Delete this comment?" stay onSuccess={load}>
                <input type="hidden" name="_csrf" value={csrfToken} />
                <SubmitButton variant="ghost" size="xs" aria-label="Delete comment" className="text-muted-foreground hover:text-destructive">
                  <Trash2Icon />
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <a
          href={`/community/${postId}`}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MessageCircleIcon className="size-3.5" />
          <span className="tabular-nums">{count}</span>
          <span className="hidden sm:inline">{count === 1 ? 'comment' : 'comments'}</span>
        </a>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            Comments
            <span className="live-dot relative size-1.5 rounded-full bg-emerald-500 text-emerald-500" />
          </SheetTitle>
          <SheetDescription className="line-clamp-2">
            {authorName}: {excerpt}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {threads === null ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No comments yet. Start the conversation!</p>
          ) : (
            threads.map(({ c, replies }) => (
              <div key={c.id} className="space-y-2">
                {renderComment(c, false)}
                {replies.map((r) => renderComment(r, true))}
              </div>
            ))
          )}
        </div>

        {!disabled && (
          <ActionForm
            key={formKey}
            action={`/api/posts/${postId}/comments`}
            stay
            onSuccess={() => {
              setFormKey((k) => k + 1);
              setReplyTo(null);
              load();
            }}
            className="border-t p-3"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            {replyTo && (
              <>
                <input type="hidden" name="parentId" value={replyTo.id} />
                <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  Replying to {replyTo.author}
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Textarea name="body" required maxLength={1000} rows={2} placeholder={replyTo ? `Reply to ${replyTo.author}…` : 'Write a comment…'} className="min-h-10 flex-1 resize-none" />
              <SubmitButton className="self-end" aria-label="Send comment">
                <SendIcon />
              </SubmitButton>
            </div>
          </ActionForm>
        )}
      </SheetContent>
    </Sheet>
  );
}
