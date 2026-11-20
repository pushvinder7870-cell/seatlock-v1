/** "5m ago", "3h ago", "2d ago". */
export function timeAgo(date: Date | string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Ada Admin" -> "AA". Plain module so both server and client components can call it. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
