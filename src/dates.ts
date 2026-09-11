const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return toISODate(new Date(y, m - 1, d + days));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function formatDate(iso: string): string {
  if (!isISODate(iso)) return '';
  const [y, m, d] = parts(iso);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Accepts yyyy-mm-dd, ISO timestamps, m/d/yyyy, or anything Date can parse. */
export function parseLooseDate(value: string): string {
  const s = value.trim();
  if (!s) return '';
  if (ISO_DATE.test(s)) return s;
  const stamp = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (stamp) return stamp[1];
  const slashed = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashed) {
    const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    return toISODate(new Date(year, Number(slashed[1]) - 1, Number(slashed[2])));
  }
  const time = Date.parse(s);
  return Number.isNaN(time) ? '' : toISODate(new Date(time));
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
