'use client';

import { useEffect, useRef, useState } from 'react';
import { BotIcon, Loader2Icon, MicIcon, MicOffIcon, RotateCcwIcon, SendIcon, SparklesIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { RichText } from './rich-text';

type Msg = { role: 'user' | 'assistant'; content: string; source?: 'claude' | 'offline' };

const OPEN_EVENT = 'seatlock:open-assistant';

const SUGGESTIONS: Record<string, string[]> = {
  student: ['What shows can I still book?', 'Which event is cheapest?', 'How do I book and pay?', 'What tickets do I have?', 'How do refunds work?'],
  organizer: ['How many seats are left for my events?', 'How do I block seats?', 'How do I check people in?', 'How do I set a ticket price?'],
  admin: ['Which event is selling best?', 'What does the audit log show?', 'How do I change a user’s role?', 'Which events are top rated?'],
};

/** Top-bar button that opens the assistant (works on every screen size). */
export function AssistantTrigger() {
  return (
    <Button
      variant="ghost"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="h-8 gap-1.5 rounded-full px-2 text-primary hover:bg-primary/10 hover:text-primary sm:px-3"
      aria-label="Ask SeatLock AI assistant"
      data-tour="assistant"
    >
      <SparklesIcon />
      <span className="hidden text-sm font-medium sm:inline">Ask AI</span>
    </Button>
  );
}

/** Markdown → plain text for speech. */
function speakable(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/₹/g, 'rupees ')
    .replace(/★/g, 'stars ');
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

/**
 * "Ask SeatLock" chat panel. Answers come from Claude (with the knowledge seed
 * + live data) or, without an AI key, from SeatLock's offline brain. Voice:
 * answers can be read aloud (speechSynthesis) and questions dictated
 * (SpeechRecognition, where the browser supports it).
 */
export function AssistantWidget({ csrfToken, firstName, role, claude }: { csrfToken: string; firstName: string; role: string; claude: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('seatlock:speak') === '1';
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending]);

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
    u.rate = 1.03;
    window.speechSynthesis.speak(u);
  }

  function toggleSpeak() {
    const next = !autoSpeak;
    setAutoSpeak(next);
    try {
      localStorage.setItem('seatlock:speak', next ? '1' : '0');
    } catch {}
    if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function listen() {
    const w = window as SpeechWindow;
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? '';
      if (said) send(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ messages: next.slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? 'The assistant is unavailable right now.');
        return;
      }
      setMessages([...next, { role: 'assistant', content: json.reply, source: json.source }]);
      if (autoSpeak) speak(json.reply);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const w = typeof window !== 'undefined' ? (window as SpeechWindow) : null;
  const canListen = !!(w && (w.SpeechRecognition || w.webkitSpeechRecognition));
  const canSpeak = !!(w && 'speechSynthesis' in w);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && canSpeak) window.speechSynthesis.cancel();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="flex items-center gap-2">
            <span className="brand-gradient grid size-7 place-items-center rounded-lg text-white">
              <BotIcon className="size-4" />
            </span>
            Ask SeatLock
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{claude ? 'AI · Claude' : 'Smart offline mode'}</span>
            {canSpeak && (
              <Button variant="ghost" size="icon-sm" onClick={toggleSpeak} aria-pressed={autoSpeak} aria-label={autoSpeak ? 'Stop reading answers aloud' : 'Read answers aloud'} className="ml-auto">
                {autoSpeak ? <Volume2Icon className="text-primary" /> : <VolumeXIcon />}
              </Button>
            )}
          </SheetTitle>
          <SheetDescription>Events, prices, seats, your tickets, or how anything works.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-sm">
                Hi {firstName}! 👋 I know everything about SeatLock: what&apos;s on, prices, seats left, your tickets and how to book, pay or cancel.
                {canSpeak && ' Tap 🔊 to hear my answers'}
                {canListen && ' or 🎤 to ask by voice'}.
              </div>
              <div className="flex flex-wrap gap-2">
                {(SUGGESTIONS[role] ?? SUGGESTIONS.student).map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted/60'
                )}
              >
                {m.role === 'assistant' ? <RichText text={m.content} onNavigate={() => setOpen(false)} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
              {m.role === 'assistant' && (
                <div className="mt-1 flex items-center gap-2 pl-1 text-[10px] text-muted-foreground">
                  {m.source === 'claude' ? 'Claude' : 'SeatLock offline brain'}
                  {canSpeak && (
                    <button onClick={() => speak(m.content)} className="flex items-center gap-0.5 hover:text-foreground" aria-label="Read this answer aloud">
                      <Volume2Icon className="size-3" /> Listen
                    </button>
                  )}
                </div>
              )}
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
            {canListen && (
              <Button type="button" variant={listening ? 'destructive' : 'outline'} size="icon-lg" onClick={listen} aria-label={listening ? 'Stop listening' : 'Ask by voice'} aria-pressed={listening}>
                {listening ? <MicOffIcon className="animate-pulse" /> : <MicIcon />}
              </Button>
            )}
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
              placeholder={listening ? 'Listening…' : 'Ask anything about SeatLock…'}
              className="max-h-32 min-h-10 flex-1 resize-none"
            />
            <Button type="submit" size="icon-lg" disabled={pending || !input.trim()} aria-label="Send">
              <SendIcon />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Answers can be wrong. I can&apos;t book or pay for you.</span>
            {messages.length > 0 && (
              <button type="button" onClick={() => setMessages([])} className="flex items-center gap-1 hover:text-foreground">
                <RotateCcwIcon className="size-3" /> New chat
              </button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
