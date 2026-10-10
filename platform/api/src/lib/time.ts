// Business-time helpers. The studio runs on New York time; servers run on UTC.

export const TZ = 'America/New_York';

/** Offset (minutes) of a timezone from UTC at a given instant. */
function offsetAt(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

/** The instant for a wall-clock time (`YYYY-MM-DD` + minutes from midnight) in the studio's timezone. */
export function zonedToUtc(day: string, minutes: number, tz = TZ) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  const first = new Date(guess.getTime() - offsetAt(guess, tz) * 60000);
  // second pass settles DST edges
  return new Date(guess.getTime() - offsetAt(first, tz) * 60000);
}

/** Wall-clock parts of an instant in the studio's timezone. */
export function zoned(date: Date | string, tz = TZ) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day: `${p.year}-${p.month}-${p.day}`, dow, minutes: +p.hour * 60 + +p.minute, hour: +p.hour };
}

export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export const fmtTime = (iso: string, tz = TZ) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
export const fmtDate = (iso: string, tz = TZ) => new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
export const fmtDay = (iso: string, tz = TZ) => new Date(iso).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
