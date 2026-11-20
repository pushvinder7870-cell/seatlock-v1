import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/home";
import { Providers } from "@/components/providers";
import { AppSidebar, TopbarTitle } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/site-nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { MobileNav } from "@/components/mobile-nav";
import { AssistantWidget } from "@/components/assistant-widget";
import { aiEnabled } from "@/lib/ai/claude";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SeatLock", template: "%s · SeatLock" },
  description: "Race-free seat booking for the college fest headline show.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#14141f" },
  ],
};

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Signed out (login page): full-screen, no app chrome.
  if (!user) return <>{children}</>;

  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar user={{ name: user.name, email: user.email, role: user.role, csrfToken: user.csrfToken }} home={homeFor(user.role)} />
      <SidebarInset className="page-glow min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-xl sm:px-4 md:rounded-t-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <TopbarTitle role={user.role} />
          <div className="ml-auto flex items-center gap-0.5">
            <AssistantWidget csrfToken={user.csrfToken} firstName={user.name.split(' ')[0]} role={user.role} enabled={aiEnabled()} />
            <NotificationsBell csrfToken={user.csrfToken} />
            <ThemeToggle />
          </div>
        </header>
        {/* pb-28 on phones keeps content clear of the floating bottom nav */}
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-8">{children}</div>
      </SidebarInset>
      <MobileNav role={user.role} />
    </SidebarProvider>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
