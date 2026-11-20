'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { NAV, isActive, type Role } from './site-nav';

/**
 * Phones: a floating "bubble" tab bar at the bottom (thumb reach), with the
 * role's 4 main destinations + "More" (opens the full sidebar drawer).
 * Hidden from md upwards, where the sidebar is always visible.
 */
export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = NAV[role].flatMap((g) => g.items).slice(0, 4);

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 rounded-full border bg-background/80 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl md:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      <ul className="flex items-center justify-between">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] text-muted-foreground transition-all',
                  active && 'brand-gradient text-white shadow-md shadow-primary/30'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-5" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button onClick={() => setOpenMobile(true)} className="flex w-full flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] text-muted-foreground">
            <MenuIcon className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
