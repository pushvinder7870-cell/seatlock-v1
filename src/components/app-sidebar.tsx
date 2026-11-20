'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ChevronsUpDownIcon, MonitorIcon, MoonIcon, ShieldCheckIcon, SunIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { initials } from '@/lib/format';
import { LogoMark } from './logo';
import { LogoutMenuItem, NAV, RoleBadge, isActive, type Role } from './site-nav';

type SidebarUser = { name: string; email: string; role: Role; csrfToken: string };

export function AppSidebar({ user, home }: { user: SidebarUser; home: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { setTheme } = useTheme();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="SeatLock">
              <Link href={home} onClick={() => setOpenMobile(false)}>
                <LogoMark className="size-8" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">SeatLock</span>
                  <span className="truncate text-xs text-muted-foreground">College Fest 2026</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV[user.role].map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, href)} tooltip={label}>
                      <Link href={href} onClick={() => setOpenMobile(false)}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
          <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-fuchsia-500/10 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldCheckIcon className="size-3.5 text-primary" /> Secured session
            </div>
            <p className="mt-1 text-muted-foreground">Row-locked bookings · 2-layer RBAC · every action audited.</p>
          </div>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="brand-gradient rounded-lg text-xs font-semibold text-white">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
                  <span className="text-sm font-medium text-foreground">{user.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                  <RoleBadge role={user.role} />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <SunIcon /> Light theme
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <MoonIcon /> Dark theme
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')}>
                    <MonitorIcon /> System theme
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <LogoutMenuItem csrfToken={user.csrfToken} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Page title in the top bar, derived from the current route. */
export function TopbarTitle({ role }: { role: Role }) {
  const pathname = usePathname();
  const item = NAV[role].flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
  let label = item?.label ?? 'SeatLock';
  if (/^\/events\/[0-9a-f-]{36}\/attendees/.test(pathname)) label = 'Attendees';
  else if (/^\/events\/[0-9a-f-]{36}\/edit/.test(pathname)) label = 'Edit event';
  else if (/^\/events\/[0-9a-f-]{36}/.test(pathname)) label = 'Seat map';
  else if (/^\/community\/[0-9a-f-]{36}/.test(pathname)) label = 'Discussion';
  return <span className="truncate text-sm font-medium">{label}</span>;
}
