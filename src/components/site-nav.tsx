'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  LogOutIcon,
  MessagesSquareIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  ScrollTextIcon,
  StarIcon,
  SunIcon,
  TicketIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type Role = 'admin' | 'organizer' | 'student';
export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

export const NAV: Record<Role, { title: string; items: NavItem[] }[]> = {
  student: [
    { title: 'Bookings', items: [
      { href: '/events', label: 'Events', icon: CalendarDaysIcon },
      { href: '/my/bookings', label: 'My tickets', icon: TicketIcon },
    ] },
    { title: 'Social', items: [
      { href: '/community', label: 'Community', icon: MessagesSquareIcon },
      { href: '/reviews', label: 'Reviews', icon: StarIcon },
    ] },
  ],
  organizer: [
    { title: 'Organize', items: [
      { href: '/events', label: 'My events', icon: CalendarDaysIcon },
      { href: '/events/new', label: 'New event', icon: PlusIcon },
    ] },
    { title: 'Social', items: [
      { href: '/community', label: 'Community', icon: MessagesSquareIcon },
      { href: '/reviews', label: 'Reviews', icon: StarIcon },
    ] },
  ],
  admin: [
    { title: 'Overview', items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },
      { href: '/events', label: 'Events', icon: CalendarDaysIcon },
    ] },
    { title: 'Manage', items: [
      { href: '/admin/audit', label: 'Audit log', icon: ScrollTextIcon },
      { href: '/admin/users', label: 'Users', icon: UsersIcon },
      { href: '/community', label: 'Community', icon: MessagesSquareIcon },
      { href: '/reviews', label: 'Reviews', icon: StarIcon },
    ] },
  ],
};

export function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/events') return pathname === '/events' || (/^\/events\/[0-9a-f-]{36}/.test(pathname));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme" className={className}>
          <SunIcon className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <SunIcon /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <MoonIcon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <MonitorIcon /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  organizer: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  student: 'bg-primary/10 text-primary',
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <Badge className={cn('capitalize', ROLE_STYLE[role], className)}>{role}</Badge>;
}

/**
 * Logs out, then does a HARD navigation (location.replace) instead of a client
 * transition: this throws away the client router cache and replaces the history
 * entry, so Back can't show the previous user's pages.
 */
export async function logout(csrfToken: string) {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      body: '{}',
    });
  } catch {
    toast.error('Network error while logging out.');
  }
  window.location.replace('/login?notice=logged_out');
}

export function LogoutMenuItem({ csrfToken }: { csrfToken: string }) {
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={(e) => {
        e.preventDefault();
        setPending(true);
        logout(csrfToken);
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />} Log out
    </DropdownMenuItem>
  );
}
