'use client';

import { useRef, useState } from 'react';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Event description textarea with a "Write with AI" button (organizers). Reads the other form fields as facts. */
export function DescriptionField({ defaultValue, csrfToken, aiEnabled }: { defaultValue: string; csrfToken: string; aiEnabled: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function write() {
    const form = ref.current?.form;
    if (!form) return;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      toast.error('Give the event a name first.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/ai/describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          name,
          venue: data.get('venue'),
          eventDate: data.get('eventDate'),
          priceRupees: data.get('priceRupees'),
          notes: value,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'AI could not write a description.');
      setValue(json.description);
      toast.success('Draft written. Edit it as you like before saving.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        id="description"
        name="description"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What's the show about? Or type a few notes and let AI write it."
      />
      <Button type="button" variant="outline" size="sm" onClick={write} disabled={!aiEnabled || pending} className="text-primary">
        {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {pending ? 'Writing…' : 'Write with AI'}
      </Button>
      {!aiEnabled && <span className="ml-2 text-xs text-muted-foreground">AI not configured</span>}
    </div>
  );
}
