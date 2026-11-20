import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { CurrentUser } from '@/lib/session';
import { dateParts } from '@/lib/time';

/** Hidden inputs every mutating form needs: CSRF token + where to go back to. */
export function FormMeta({ user, redirect }: { user: CurrentUser; redirect?: string }) {
  return (
    <>
      <input type="hidden" name="_csrf" value={user.csrfToken} />
      {redirect && <input type="hidden" name="_redirect" value={redirect} />}
    </>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  icon: Icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <div className="brand-gradient hidden size-11 shrink-0 place-items-center rounded-xl text-white shadow-lg shadow-primary/25 sm:grid">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          {description && <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'primary',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  children?: ReactNode;
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  };
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {Icon && (
            <span className={cn('grid size-8 place-items-center rounded-lg', tones[tone])}>
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        {children}
      </CardContent>
    </Card>
  );
}

const STATUS: Record<string, string> = {
  published: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  open: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  draft: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'checked in': 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  'selling fast': 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'sold out': 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

export function StatusBadge({ status, children, className }: { status: string; children?: ReactNode; className?: string }) {
  return (
    <Badge className={cn('capitalize', STATUS[status] ?? 'bg-muted text-muted-foreground', className)}>
      {children ?? status}
    </Badge>
  );
}

export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function DateTile({ date, className }: { date: Date | string; className?: string }) {
  const p = dateParts(date);
  return (
    <div className={cn('brand-gradient flex w-14 shrink-0 flex-col items-center rounded-xl py-2 text-white shadow-md shadow-primary/25', className)}>
      <span className="text-[10px] font-semibold tracking-widest opacity-85">{p.month}</span>
      <span className="text-2xl leading-none font-semibold tabular-nums">{p.day}</span>
      <span className="mt-0.5 text-[10px] opacity-80">{p.weekday}</span>
    </div>
  );
}
