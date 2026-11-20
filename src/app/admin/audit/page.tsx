import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon, DatabaseIcon, FilterIcon, RotateCcwIcon, ScrollTextIcon } from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { AUDIT_ACTIONS, listAuditLogs, shardFor } from '@/lib/services/audit';
import { listEvents } from '@/lib/services/events';
import { fmtTimeSeconds } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NativeSelect, PageHeader } from '@/components/common';

export const metadata = { title: 'Audit log' };

const ACTION_STYLES: Record<string, string> = {
  ACCESS_DENIED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  LOGIN_FAILED: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  SEAT_HOLD_REJECTED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  HOLD_EXPIRED: 'bg-muted text-muted-foreground',
  HOLD_RELEASED: 'bg-muted text-muted-foreground',
  BOOKING_CONFIRMED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  CHECKIN: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  BOOKING_CANCELLED: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  SEAT_HOLD: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  EVENT_UPDATED: 'bg-primary/10 text-primary',
  EVENT_CREATED: 'bg-primary/10 text-primary',
  ROLE_CHANGED: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
};

function summarize(details: Record<string, unknown> | null): string {
  if (!details) return '';
  const d = details;
  const parts: string[] = [];
  if (Array.isArray(d.seats)) parts.push(`seats ${(d.seats as string[]).join(', ')}`);
  if (d.code) parts.push(String(d.code));
  if (d.reason) parts.push(String(d.reason));
  if (d.operation) parts.push(String(d.operation));
  if (d.path) parts.push(String(d.path));
  if (d.email) parts.push(String(d.email));
  if (d.changes && typeof d.changes === 'object') parts.push(`changed ${Object.keys(d.changes).join(', ')}`);
  return parts.join(' · ');
}

export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' && sp[k] ? (sp[k] as string) : undefined);
  const filter = { eventId: one('eventId'), from: one('from'), to: one('to'), action: one('action'), cursor: one('cursor') };

  const [page, events] = await Promise.all([guard(listAuditLogs(user, filter)), guard(listEvents(user))]);
  const pageHref = (cursor?: string) => {
    const q = new URLSearchParams(Object.entries({ ...filter, cursor }).filter(([, v]) => v) as [string, string][]);
    return `/admin/audit?${q}`;
  };
  const perShard = [0, 1, 2, 3].map((s) => page.rows.filter((r) => r.shard === s).length);
  const pruned = page.shardsQueried.length === 1;

  return (
    <>
      <PageHeader
        icon={ScrollTextIcon}
        eyebrow="Admin"
        title="Audit log"
        description="Every action, stored in 4 shards routed by hash(event_id) mod 4 (actor id for non-event actions)."
      />

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.4fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="eventId">Event</Label>
              <NativeSelect id="eventId" name="eventId" defaultValue={filter.eventId ?? ''}>
                <option value="">All events: scatter-gather across 4 shards</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} → shard {shardFor(e.id)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input type="date" id="from" name="from" defaultValue={filter.from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To (inclusive)</Label>
              <Input type="date" id="to" name="to" defaultValue={filter.to} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <NativeSelect id="action" name="action" defaultValue={filter.action ?? ''}>
                <option value="">Any action</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button type="submit">
                <FilterIcon /> Apply
              </Button>
              <Button variant="outline" size="icon" asChild aria-label="Reset filters">
                <Link href="/admin/audit">
                  <RotateCcwIcon />
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((s) => {
          const hit = page.shardsQueried.includes(s);
          return (
            <div
              key={s}
              className={cn(
                'relative overflow-hidden rounded-xl border p-3.5 transition-all',
                hit ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/10' : 'border-dashed opacity-50'
              )}
            >
              {hit && <div className="brand-gradient absolute inset-x-0 top-0 h-0.5" />}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-xs">
                  <DatabaseIcon className={cn('size-3.5', hit ? 'text-primary' : 'text-muted-foreground')} />
                  audit_logs_{s}
                </span>
                <Badge variant={hit ? 'default' : 'outline'} className="text-[10px]">
                  {hit ? 'queried' : 'pruned'}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {hit ? (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">{perShard[s]}</span> rows on this page
                  </>
                ) : (
                  'skipped (event filter)'
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">
        {pruned
          ? 'Shard pruning: the event filter routes this query to exactly one shard.'
          : 'Scatter-gather: newest rows fetched from every shard in parallel, merged by (time, id), top 50 shown.'}{' '}
        Showing {page.rows.length} rows{filter.cursor ? ' (older page)' : ''}.
      </p>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Event / target</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="pr-4 text-right">Shard</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No audit records match these filters.
                </TableCell>
              </TableRow>
            )}
            {page.rows.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="pl-4 font-mono text-xs whitespace-nowrap text-muted-foreground">{fmtTimeSeconds(r.created_at)}</TableCell>
                <TableCell>
                  <Badge className={cn('font-mono text-[11px]', ACTION_STYLES[r.action] ?? 'bg-muted text-foreground')}>{r.action}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.actor_name ? (
                    <>
                      <div className="font-medium">{r.actor_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{r.actor_role}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">system / anonymous</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[14rem]">
                  {r.event_name && <div className="truncate">{r.event_name}</div>}
                  {r.target_type && (
                    <div className="truncate font-mono text-[11px] text-muted-foreground" title={r.target_id ?? ''}>
                      {r.target_type}:{r.target_id}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  {r.details && (
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                        {summarize(r.details) || 'details'}
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                        {JSON.stringify(r.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Badge variant="outline" className="font-mono">
                    {r.shard}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex justify-between gap-2">
        {filter.cursor ? (
          <Button variant="outline" asChild>
            <Link href={pageHref()}>
              <ChevronLeftIcon /> Newest
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {page.nextCursor && (
          <Button variant="outline" asChild>
            <Link href={pageHref(page.nextCursor)}>
              Older <ChevronRightIcon />
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}
