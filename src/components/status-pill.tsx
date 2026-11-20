import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Client-safe twin of StatusBadge (common.tsx imports server-only helpers).
const STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

export function StatusPill({ status }: { status: string }) {
  return <Badge className={cn('capitalize', STYLES[status] ?? 'bg-muted text-muted-foreground')}>{status}</Badge>;
}
