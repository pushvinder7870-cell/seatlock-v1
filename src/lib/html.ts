// Tiny HTML responses for errors returned by the proxy and by API routes
// when the caller is a plain browser form post (no JS required).

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const TITLES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Please sign in',
  403: 'Access denied',
  404: 'Not found',
  409: 'That didn’t go through',
  422: 'Not allowed',
  429: 'Slow down',
  503: 'Busy, please retry',
  500: 'Server error',
};

export function htmlErrorPage(status: number, code: string, message: string, backHref = '/'): Response {
  const title = TITLES[status] ?? 'Error';
  const tone = status === 403 ? '#e11d48' : status === 503 ? '#d97706' : '#4f46e5';
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${status} ${escapeHtml(title)} · SeatLock</title>
<style>
  :root{--bg:#f8f8fc;--card:#fff;--fg:#1a1a2e;--muted:#6b6b85;--line:#e6e6f0}
  @media (prefers-color-scheme:dark){:root{--bg:#14141f;--card:#1d1d2b;--fg:#f2f2f8;--muted:#a3a3bd;--line:#ffffff17}}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(50rem 20rem at 50% -6rem,${tone}22,transparent 70%),var(--bg);color:var(--fg);margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
  main{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:36px;max-width:480px;width:100%;box-shadow:0 20px 50px -20px #0003;text-align:center}
  .icon{width:56px;height:56px;border-radius:16px;margin:0 auto 18px;display:grid;place-items:center;background:${tone}1a;color:${tone};font:700 22px ui-monospace,monospace}
  .code{display:inline-block;font:600 11px ui-monospace,monospace;letter-spacing:.06em;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px}
  h1{margin:12px 0 8px;font-size:22px;letter-spacing:-.01em} p{line-height:1.55;color:var(--muted);margin:0}
  a{display:inline-flex;margin-top:24px;color:#fff;background:linear-gradient(135deg,#4f46e5,#9333ea);padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:500;font-size:14px}
</style></head>
<body><main>
  <div class="icon">${status}</div>
  <span class="code">HTTP ${status} · ${escapeHtml(code)}</span>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <a href="${escapeHtml(backHref)}">← Go back</a>
</main></body></html>`;
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
