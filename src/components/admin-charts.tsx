'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { AdminDashboard } from '@/lib/services/dashboard';

const activityConfig = {
  holds: { label: 'Seat holds', color: 'var(--chart-1)' },
  bookings: { label: 'Bookings', color: 'var(--chart-2)' },
  rejected: { label: 'Rejected holds', color: 'var(--chart-3)' },
  denied: { label: 'Denied / failed login', color: 'var(--chart-4)' },
} satisfies ChartConfig;

export function ActivityChart({ data }: { data: AdminDashboard['hourly'] }) {
  return (
    <ChartContainer config={activityConfig} className="aspect-auto h-[280px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          {Object.keys(activityConfig).map((k) => (
            <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.45} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        {(['rejected', 'holds', 'bookings', 'denied'] as const).map((k) => (
          <Area key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} fill={`url(#fill-${k})`} />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

const occupancyConfig = {
  booked: { label: 'Booked', color: 'var(--chart-1)' },
  held: { label: 'On hold', color: 'var(--chart-3)' },
  available: { label: 'Available', color: 'var(--chart-2)' },
  blocked: { label: 'Blocked', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

export function OccupancyChart({ data }: { data: AdminDashboard['occupancy'] }) {
  return (
    <ChartContainer config={occupancyConfig} className="aspect-auto w-full" style={{ height: Math.max(180, data.length * 46 + 60) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }} barSize={18}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="event"
          tickLine={false}
          axisLine={false}
          width={108}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="booked" stackId="s" fill="var(--color-booked)" radius={[4, 0, 0, 4]} />
        <Bar dataKey="held" stackId="s" fill="var(--color-held)" />
        <Bar dataKey="blocked" stackId="s" fill="var(--color-blocked)" fillOpacity={0.4} />
        <Bar dataKey="available" stackId="s" fill="var(--color-available)" fillOpacity={0.35} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const SHARD_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)'];
const shardConfig = {
  total: { label: 'Records' },
  audit_logs_0: { label: 'audit_logs_0', color: SHARD_COLORS[0] },
  audit_logs_1: { label: 'audit_logs_1', color: SHARD_COLORS[1] },
  audit_logs_2: { label: 'audit_logs_2', color: SHARD_COLORS[2] },
  audit_logs_3: { label: 'audit_logs_3', color: SHARD_COLORS[3] },
} satisfies ChartConfig;

export function ShardChart({ data }: { data: AdminDashboard['shards'] }) {
  const total = data.reduce((n, d) => n + d.total, 0);
  return (
    <ChartContainer config={shardConfig} className="mx-auto aspect-square h-[220px]">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="shard" />} />
        <Pie data={data} dataKey="total" nameKey="shard" innerRadius={62} outerRadius={92} strokeWidth={3} stroke="var(--card)" paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={d.shard} fill={SHARD_COLORS[i]} />
          ))}
          <Label
            content={({ viewBox }) =>
              viewBox && 'cx' in viewBox ? (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                    {total.toLocaleString()}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                    audit rows
                  </tspan>
                </text>
              ) : null
            }
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

const actionsConfig = { count: { label: 'Events', color: 'var(--chart-1)' } } satisfies ChartConfig;
const ACTION_COLOR: Record<string, string> = {
  ACCESS_DENIED: 'var(--chart-4)',
  LOGIN_FAILED: 'var(--chart-4)',
  SEAT_HOLD_REJECTED: 'var(--chart-3)',
  BOOKING_CONFIRMED: 'var(--chart-2)',
  CHECKIN: 'var(--chart-2)',
};

export function ActionsChart({ data }: { data: AdminDashboard['actions'] }) {
  const rows = data.slice(0, 10);
  return (
    <ChartContainer config={actionsConfig} className="aspect-auto w-full" style={{ height: Math.max(160, rows.length * 30 + 20) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 24 }} barSize={14}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="action"
          tickLine={false}
          axisLine={false}
          width={118}
          tick={{ fontSize: 10, fontFamily: 'var(--font-geist-mono)' }}
          tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
        />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" radius={4} label={{ position: 'right', fontSize: 11, className: 'fill-muted-foreground' }}>
          {rows.map((r) => (
            <Cell key={r.action} fill={ACTION_COLOR[r.action] ?? 'var(--color-count)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
