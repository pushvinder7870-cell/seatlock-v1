import Link from 'next/link';

export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <span className={`brand-gradient grid shrink-0 place-items-center rounded-lg text-white shadow-md shadow-primary/30 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
        <path d="M4 11h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M7 18v2M17 18v2" />
      </svg>
    </span>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-semibold tracking-tight">
      <LogoMark />
      <span className="text-[15px]">SeatLock</span>
    </Link>
  );
}
