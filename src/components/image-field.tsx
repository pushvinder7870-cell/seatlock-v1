'use client';

import { useRef, useState } from 'react';
import { ImagePlusIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/**
 * Cover-photo picker for event forms. Uploads the file to /api/uploads (server
 * validates + stores it), then puts the returned URL in a hidden `imageUrl`
 * input that is submitted with the rest of the form.
 */
export function ImageField({ csrfToken, initialUrl, name = 'imageUrl' }: { csrfToken: string; initialUrl?: string | null; name?: string }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'event');
      const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'Upload failed');
      setUrl(json.url);
      toast.success('Photo uploaded. Save the event to apply it.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {url ? (
        <div className="group relative overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own stored image */}
          <img src={url} alt="Event cover" className="aspect-[16/7] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Replace
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setUrl('')} disabled={uploading}>
              <Trash2Icon /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          {uploading ? <Loader2Icon className="size-6 animate-spin" /> : <ImagePlusIcon className="size-6" />}
          <span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Add a cover photo'}</span>
          <span className="text-xs">PNG, JPEG, GIF or WebP · up to 4 MB</span>
        </button>
      )}
    </div>
  );
}
