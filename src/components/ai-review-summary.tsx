'use client';

import { useState } from 'react';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** "Summarize reviews with AI" card. The server caches the result until the reviews change. */
export function AiReviewSummary({ eventId, eventName, csrfToken, enabled }: { eventId: string; eventName: string; csrfToken: string; enabled: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [meta, setMeta] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/ai/review-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? 'Could not summarise the reviews.');
      setSummary(json.summary);
      setMeta(
        `Based on ${json.reviewCount} reviews · ${json.source === 'claude' ? 'written by Claude, may contain mistakes' : 'offline summary of the most representative review sentences'}${json.cached ? ' · cached' : ''}`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-fuchsia-500/5 to-transparent p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <SparklesIcon className="size-4 text-primary" /> What people say about {eventName}
        </div>
        {!summary && (
          <Button size="sm" onClick={run} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {pending ? 'Summarising…' : 'Summarize with AI'}
          </Button>
        )}
      </div>
      {summary && (
        <>
          <p className="mt-3 text-[15px] leading-relaxed">{summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">{meta}</p>
        </>
      )}
      {!enabled && !summary && <p className="mt-2 text-xs text-muted-foreground">Offline mode: add an ANTHROPIC_API_KEY for Claude-written summaries.</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
