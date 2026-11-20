'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NOTICES } from '@/lib/notices';

/** Shows ?notice=… (set by no-JS form redirects) as a toast, then cleans the URL. */
function FlashToaster() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const notice = params.get('notice');
  useEffect(() => {
    if (!notice) return;
    const text = NOTICES[notice];
    if (text) toast.success(text, { id: notice });
    const rest = new URLSearchParams(params);
    rest.delete('notice');
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [notice, params, pathname, router]);
  return null;
}

/**
 * If the browser restores a page from the back/forward cache (e.g. Back after
 * logout), reload it so the server re-checks the session instead of showing a
 * stale copy.
 */
function BfcacheGuard() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster richColors position="top-center" closeButton />
        <BfcacheGuard />
        <Suspense fallback={null}>
          <FlashToaster />
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
