import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Tiny, safe renderer for AI answers: paragraphs, "- " bullets, **bold** and
 * [text](/relative/path) links. Only same-site relative links become clickable;
 * anything else is shown as plain text. No HTML is ever injected.
 */
function inline(text: string, key: string, onNavigate?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      out.push(
        /^\/(?![/\\])[\w\-/?=&.#]*$/.test(href) ? (
          <Link key={`${key}-${i++}`} href={href} onClick={onNavigate} className="font-medium text-primary underline underline-offset-2">
            {m[1]}
          </Link>
        ) : (
          m[1]
        )
      );
    } else {
      out.push(<strong key={`${key}-${i++}`}>{m[3]}</strong>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split('\n').filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ''), `${b}-${i}`, onNavigate)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b} className="whitespace-pre-wrap">
            {inline(block, `${b}`, onNavigate)}
          </p>
        );
      })}
    </div>
  );
}
