import { StarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Read-only star rating; supports halves visually via a clipped overlay. */
export function Stars({ value, className, size = 'size-4' }: { value: number; className?: string; size?: string }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span className={cn('relative inline-flex', className)} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="flex text-muted-foreground/30">
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} className={cn(size, 'fill-current')} />
        ))}
      </span>
      <span className="absolute inset-0 flex overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} className={cn(size, 'shrink-0 fill-current')} />
        ))}
      </span>
    </span>
  );
}
