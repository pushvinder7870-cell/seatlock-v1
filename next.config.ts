import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Post images are served from our Supabase Storage bucket (if configured).
const supabaseOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

// Content-Security-Policy: only our own origin may load scripts/styles/fonts or
// receive form posts; nobody may frame us (clickjacking). Next.js injects small
// inline bootstrap scripts, hence 'unsafe-inline' for scripts; dev additionally
// needs eval + websockets for hot reload, so the CSP is production-only.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Every SeatLock page is per-request, per-user data (seat state, role-aware
  // controls), so Cache Components / partial prefetching are intentionally
  // off: pages render fully on the server per request, which also lets a
  // forbidden() / notFound() set the real HTTP status (403/404) instead of
  // streaming a 200 shell first.
  experimental: {
    authInterrupts: true, // enables forbidden() -> HTTP 403 + app/forbidden.tsx
  },
  poweredByHeader: false,
  // Dev only: let phones/tablets on the same Wi-Fi open the dev server via its
  // LAN IP (e.g. http://10.96.x.x:3000). Without this Next.js blocks its dev JS
  // for those origins, so client components (charts, toasts, live refresh)
  // never load on the device. Has no effect on production builds.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
