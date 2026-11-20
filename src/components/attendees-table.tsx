'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2Icon, SearchIcon, UserCheckIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionForm, SubmitButton } from './action-form';
import { StatusPill } from './status-pill';
import { initials } from '@/lib/format';

export type AttendeeRow = {
  id: string;
  name: string;
  email: string;
  status: 'confirmed' | 'cancelled';
  seats: string[];
  bookedAt: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
};

export function AttendeesTable({ rows, csrfToken, eventId }: { rows: AttendeeRow[]; csrfToken: string; eventId: string }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s) || r.seats.some((x) => x.toLowerCase() === s));
  }, [q, rows]);

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or seat (e.g. A4)" className="pl-8" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">Attendee</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead className="hidden md:table-cell">Booked</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Check-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  {rows.length ? 'No attendees match your search.' : 'No bookings yet.'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((a) => (
              <TableRow key={a.id} className={a.status === 'cancelled' ? 'opacity-50' : ''}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(a.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {a.seats.map((s) => (
                      <Badge key={s} variant="outline" className="font-mono">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{a.bookedAt}</TableCell>
                <TableCell>
                  <StatusPill status={a.status} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {a.status !== 'confirmed' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : a.checkedInAt ? (
                    <div className="inline-flex flex-col items-end text-xs">
                      <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2Icon className="size-3.5" /> Checked in
                      </span>
                      <span className="text-muted-foreground">
                        {a.checkedInAt} · {a.checkedInBy}
                      </span>
                    </div>
                  ) : (
                    <ActionForm action={`/api/bookings/${a.id}/checkin`} className="inline-block">
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input type="hidden" name="_redirect" value={`/events/${eventId}/attendees`} />
                      <SubmitButton size="sm">
                        <UserCheckIcon /> Check in
                      </SubmitButton>
                    </ActionForm>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
