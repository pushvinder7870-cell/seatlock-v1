'use client';

import { useRef, useState } from 'react';
import { ImagePlusIcon, Loader2Icon, SendIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ActionForm, SubmitButton } from './action-form';

const MAX = 2000;

export function PostComposer({
  csrfToken,
  initialsText,
  events,
  uploadsEnabled,
}: {
  csrfToken: string;
  initialsText: string;
  events: { id: string; name: string }[];
  uploadsEnabled: boolean;
}) {
  const [body, setBody] = useState('');
  const [key, setKey] = useState(0); // remount the form after a successful post
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const left = MAX - body.length;

  // Upload first (server validates + stores in Supabase), then attach the returned URL to the post.
  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'Upload failed');
      setImage(json.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <ActionForm
      key={key}
      action="/api/posts"
      className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
      onSuccess={() => {
        setBody('');
        setImage(null);
        setKey((k) => k + 1);
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="_redirect" value="/community" />
      {image && <input type="hidden" name="imageUrl" value={image} />}
      <div className="flex gap-3">
        <Avatar className="hidden size-9 sm:flex">
          <AvatarFallback className="brand-gradient text-xs font-semibold text-white">{initialsText}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Textarea
            name="body"
            required
            maxLength={MAX}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share something with the fest: plans, questions, seat swaps…"
            className="min-h-20 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {image && (
            <div className="relative mt-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview of our own uploaded image */}
              <img src={image} alt="Attached" className="max-h-48 rounded-xl border object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                aria-label="Remove image"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-3">
            {uploadsEnabled && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Add image">
                  {uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
                </Button>
              </>
            )}
            <select
              name="eventId"
              defaultValue=""
              aria-label="Tag an event"
              className="h-8 max-w-[55%] rounded-lg border border-input bg-transparent px-2 text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover"
            >
              <option value="">No event tag</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  # {e.name}
                </option>
              ))}
            </select>
            <span className={cn('ml-auto text-xs tabular-nums text-muted-foreground', left < 100 && 'text-amber-600', left < 0 && 'text-destructive')}>
              {left}
            </span>
            <SubmitButton size="sm" disabled={!body.trim() || left < 0 || uploading}>
              <SendIcon /> Post
            </SubmitButton>
          </div>
        </div>
      </div>
    </ActionForm>
  );
}
