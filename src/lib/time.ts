// All times are stored as TIMESTAMPTZ (UTC instants). The UI shows and
// accepts them in the venue's time zone.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? 'Asia/Kolkata';

function offsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Parses "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD") as wall-clock time in APP_TIME_ZONE. ISO strings with a zone pass through. */
export function parseLocal(value: string, tz = APP_TIME_ZONE): Date {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v)) {
    const naive = new Date(`${v.length === 10 ? `${v}T00:00` : v}Z`);
    return new Date(naive.getTime() - offsetMinutes(naive, tz) * 60000);
  }
  return new Date(v);
}

/** Formats an instant as a datetime-local input value in APP_TIME_ZONE. */
export function toLocalInput(date: Date | string, tz = APP_TIME_ZONE): string {
  const d = new Date(date);
  const shifted = new Date(d.getTime() + offsetMinutes(d, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function fmtDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Pieces for date tiles: { month: "DEC", day: "04", weekday: "Fri", time: "6:00 pm", long: "Friday, 4 December 2026" } */
export function dateParts(date: Date | string) {
  const d = new Date(date);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...o, timeZone: APP_TIME_ZONE }).format(d);
  return {
    month: f({ month: 'short' }).toUpperCase(),
    day: f({ day: '2-digit' }),
    weekday: f({ weekday: 'short' }),
    time: f({ hour: 'numeric', minute: '2-digit' }),
    long: f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export function fmtTimeSeconds(date: Date | string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}
