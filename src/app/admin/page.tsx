import Link from 'next/link';
import {
  ActivityIcon,
  ArmchairIcon,
  ArrowRightIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ShieldAlertIcon,
  TicketIcon,
  TimerIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { requireUser, guard } from '@/lib/page';
import { getAdminDashboard } from '@/lib/services/dashboard';
import { formatINR } from '@/lib/services/payments';
import { fmtTimeSeconds } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeader, StatCard } from '@/components/common';
import { ActionsChart, ActivityChart, OccupancyChart, ShardChart } from '@/components/admin-charts';

export const metadata = { title: 'Admin dashboard' };

export default async function AdminDashboardPage() {
  const user = await requireUser();
  const d = await guard(getAdminDashboard(user));
  const fill = Math.round((100 * d.kpi.seatsSold) / Math.max(1, d.kpi.capacity));
  const shardTotal = d.shards.reduce((n, s) => n + s.total, 0) || 1;

  return (
    <>
      <PageHeader
        icon={LayoutDashboardIcon}
        eyebrow="Admin"
        title="Dashboard"
        description="Live overview of bookings, seat holds and security events across all events."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/users">
                <UsersIcon /> Users
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/audit">
                <DatabaseIcon /> Audit log
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Seats sold" value={d.kpi.seatsSold} icon={ArmchairIcon} hint={`${fill}% of ${d.kpi.capacity} capacity`}>
          <Progress value={fill} className="mt-1" />
        </StatCard>
        <StatCard
          label="Revenue (demo)"
          value={formatINR(d.kpi.revenueCents)}
          icon={TicketIcon}
          tone="success"
          hint={`${d.kpi.bookings} bookings · ${d.kpi.bookingsToday} today · ${d.kpi.checkedIn} checked in`}
        />
        <StatCard label="Active holds" value={d.kpi.activeHolds} icon={TimerIcon} tone="warning" hint="expire after 5 minutes" />
        <StatCard
          label="Security events (24h)"
          value={d.kpi.denied24h + d.kpi.failedLogins24h}
          icon={ShieldAlertIcon}
          tone="danger"
          hint={`${d.kpi.denied24h} denied · ${d.kpi.failedLogins24h} failed logins`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ActivityIcon className="size-4 text-primary" /> Activity, last 6 hours
            </CardTitle>
            <CardDescription>Per 15 minutes, gathered from all 4 audit shards</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={d.hourly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseIcon className="size-4 text-primary" /> Audit shards
            </CardTitle>
            <CardDescription>Rows per shard · routed by hash(event_id) mod 4</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ShardChart data={d.shards} />
            <div className="grid grid-cols-2 gap-2">
              {d.shards.map((s, i) => (
                <div key={s.shard} className="rounded-lg border p-2.5">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)'][i] }} />
                    {s.shard}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-semibold tabular-nums">{s.total}</span>
                    <span className="text-[11px] text-muted-foreground">{Math.round((100 * s.total) / shardTotal)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArmchairIcon className="size-4 text-primary" /> Seat occupancy by event
            </CardTitle>
            <CardDescription>Booked, on hold, blocked and available seats</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/events">
                  All events <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <OccupancyChart data={d.occupancy} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4 text-primary" /> Actions, last 24 hours
            </CardTitle>
            <CardDescription>Top audit actions</CardDescription>
          </CardHeader>
          <CardContent>
            {d.actions.length ? <ActionsChart data={d.actions} /> : <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4 text-rose-500" /> Recent security events
          </CardTitle>
          <CardDescription>Latest ACCESS_DENIED and LOGIN_FAILED records (every 403 is audited)</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/audit?action=ACCESS_DENIED">
                View all <ArrowRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {d.security.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <UserCheckIcon className="mx-auto mb-2 size-5" />
              No denied requests yet.
            </p>
          ) : (
            <ul className="divide-y">
              {d.security.map((s) => {
                const det = (s.details ?? {}) as Record<string, unknown>;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className="w-36 font-mono text-xs text-muted-foreground">{fmtTimeSeconds(s.created_at)}</span>
                    <Badge className="bg-rose-500/10 font-mono text-rose-600 dark:text-rose-400">{s.action}</Badge>
                    <span className="font-medium">{s.actor_name ?? (det.email as string) ?? 'anonymous'}</span>
                    {s.actor_role && <span className="text-xs text-muted-foreground">{s.actor_role}</span>}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {[det.reason, det.operation, det.path].filter(Boolean).join(' · ')}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      shard {s.shard}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
