'use client';

import { useEffect, useRef, useState } from 'react';
import { BotIcon, Loader2Icon, RotateCcwIcon, SendIcon, SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { RichText } from './rich-text';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS: Record<string, string[]> = {
  student: ['What shows can I still book?', 'Which event is cheapest?', 'How do I book and pay?', 'What tickets do I have?'],
  organizer: ['How many seats are left for my events?', 'How do I block seats?', 'How do I check people in?', 'How do I set a ticket price?'],
  admin: ['Which event is selling best?', 'What does the audit log show?', 'How do I change a user’s role?', 'Which events have the best reviews?'],
};

/**
 * "Ask SeatLock": floating AI assistant (Claude). Answers are grounded in a
 * server-side snapshot of data this user may see; it can explain and link but
 * not act. The conversation lives only in this browser tab.
 */
export function AssistantWidget({ csrfToken, firstName, role, enabled }: { csrfToken: string; firstName: string; role: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? 'The assistant is unavailable right now.');
        return;
      }
      setMessages([...next, { role: 'assistant', content: json.reply }]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Phones: compact trigger in the top bar (the bottom of the screen belongs to the tab bar + seat selection bar) */}
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="text-primary md:hidden" aria-label="Ask SeatLock AI assistant" data-tour="assistant-mobile">
        <SparklesIcon />
      </Button>
      {/* Desktop: floating bubble */}
      <button
        onClick={() => setOpen(true)}
        data-tour="assistant"
        className="brand-gradient fixed right-6 bottom-6 z-40 hidden items-center gap-2 rounded-full py-3 pr-4 pl-3 text-sm font-medium text-white shadow-xl shadow-primary/30 transition-transform hover:scale-105 md:flex print:hidden"
        aria-label="Ask SeatLock AI assistant"
      >
        <SparklesIcon className="size-5" />
        Ask SeatLock
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <span className="brand-gradient grid size-7 place-items-center rounded-lg text-white">
                <BotIcon className="size-4" />
              </span>
              Ask SeatLock
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">AI · Claude</span>
            </SheetTitle>
            <SheetDescription>Questions about events, prices, seats or how SeatLock works.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!enabled && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                The AI assistant isn&apos;t set up on this server yet. An administrator needs to add an <code>ANTHROPIC_API_KEY</code>.
              </div>
            )}
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-sm">
                  Hi {firstName}! 👋 I can find shows with free seats, compare prices, explain how booking works, or point you to the right page.
                </div>
                <div className="flex flex-wrap gap-2">
                  {(SUGGESTIONS[role] ?? SUGGESTIONS.student).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={!enabled}
                      className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted/60'
                  )}
                >
                  {m.role === 'assistant' ? <RichText text={m.content} onNavigate={() => setOpen(false)} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Thinking…
              </div>
            )}
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div ref={endRef} />
          </div>

          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                maxLength={1500}
                rows={1}
                placeholder={enabled ? 'Ask anything about SeatLock…' : 'AI is not configured'}
                disabled={!enabled}
                className="max-h-32 min-h-10 flex-1 resize-none"
              />
              <Button type="submit" size="icon-lg" disabled={!enabled || pending || !input.trim()} aria-label="Send">
                <SendIcon />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>AI can make mistakes. It can&apos;t book or pay for you.</span>
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} className="flex items-center gap-1 hover:text-foreground">
                  <RotateCcwIcon className="size-3" /> New chat
                </button>
              )}
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
