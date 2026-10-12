// All "day" logic is Europe/Tallinn, regardless of the device's own time zone.
export const TZ = 'Europe/Tallinn';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in Tallinn as YYYY-MM-DD. */
export function tallinnToday(now: Date = new Date()): string {
  return ymd.format(now);
}

/** Calendar date (YYYY-MM-DD) in Tallinn for a timestamp. */
export function tallinnDate(ts: string | Date): string {
  return ymd.format(typeof ts === 'string' ? new Date(ts) : ts);
}

/** ISO weekday for a YYYY-MM-DD date: 1 = Monday … 7 = Sunday. */
export function isoDow(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hour (0–23) right now in Tallinn. */
export function tallinnHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

const longDay = new Intl.DateTimeFormat('et-EE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('et-EE', { timeZone: TZ, day: 'numeric', month: 'short' });
const weekdayTime = new Intl.DateTimeFormat('et-EE', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const timeOnly = new Intl.DateTimeFormat('et-EE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** "esmaspäev, 12. oktoober" */
export function formatLongDay(ts: Date = new Date()): string {
  return longDay.format(ts);
}

/** "12. okt" */
export function formatShortDate(ts: string | Date): string {
  return shortDate.format(typeof ts === 'string' ? new Date(ts) : ts);
}

/** "reede, 9. okt 19:30" */
export function formatWeekdayTime(ts: string): string {
  return weekdayTime.format(new Date(ts)).replace(' kell', '');
}

export function formatTime(ts: string): string {
  return timeOnly.format(new Date(ts));
}

/** "9.–16. okt" or "28. sept – 3. okt" */
export function formatRange(start: string, end: string): string {
  const a = formatShortDate(start);
  const b = formatShortDate(end);
  if (a === b) return a;
  const [aDay, ...aMonth] = a.split(' ');
  const bMonth = b.split(' ').slice(1);
  return aMonth.join(' ') === bMonth.join(' ') ? `${aDay}–${b}` : `${a} – ${b}`;
}

/** Estonian plural: 1 punkt, 2 punkti. */
export function pts(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'punkt' : 'punkti'}`;
}

export const WEEKDAY_SHORT = ['E', 'T', 'K', 'N', 'R', 'L', 'P'];
