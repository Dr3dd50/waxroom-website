// Open times for a service: inside business hours and the person's working
// hours, not overlapping anything already booked, past the lead time and
// within how far ahead clients may book.
import type { Store } from '../store/store';
import type { Appointment, Service, Settings, Staff } from '../types';
import { DAY_KEYS, addDays, zoned, zonedToUtc } from '../lib/time';

export async function getSettings(store: Store) {
  return (await store.get<Settings>('settings', 'settings'))!;
}

export async function appointmentsBetween(store: Store, fromIso: string, toIso: string) {
  // ids start with the start time; pad the end so every id on the last instant is included
  return store.range<Appointment>('appointments', fromIso, `${toIso}~`);
}

const live = (a: Appointment) => a.status !== 'cancelled' && a.status !== 'no-show';

export function workingWindow(day: string, staff: Staff, settings: Settings) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const biz = settings.hours[DAY_KEYS[dow]];
  if (!biz?.working) return null;
  const own = staff.schedule ? staff.schedule[dow] : { start: biz.start * 60, end: biz.end * 60 };
  if (!own) return null;
  return { start: Math.max(own.start, biz.start * 60), end: Math.min(own.end, biz.end * 60) };
}

export type Slot = { start: string; staffIds: string[] };

export async function slotsFor(store: Store, service: Service, day: string, staffId: string | null, opts: { staffSide?: boolean } = {}) {
  const settings = await getSettings(store);
  const staff = (await store.list<Staff>('staff')).filter(
    (s) => s.active && service.staffIds.includes(s.id) && (opts.staffSide || s.bookable) && (!staffId || s.id === staffId),
  );
  const today = zoned(new Date()).day;
  if (!opts.staffSide && (day < today || day > addDays(today, settings.policies.bookAheadDays))) return [];
  const dayStart = zonedToUtc(day, 0).toISOString();
  const dayEnd = zonedToUtc(addDays(day, 1), 0).toISOString();
  const booked = (await appointmentsBetween(store, dayStart, dayEnd)).filter(live);
  const earliest = Date.now() + (opts.staffSide ? 0 : settings.policies.leadTimeMinutes * 60000);
  const step = settings.policies.slotStepMinutes;

  const byTime = new Map<string, string[]>();
  for (const s of staff) {
    const win = workingWindow(day, s, settings);
    if (!win) continue;
    const mine = booked.filter((a) => a.staffId === s.id).map((a) => [Date.parse(a.start), Date.parse(a.end)]);
    for (const off of s.timeOff ?? []) mine.push([Date.parse(off.from), Date.parse(off.to)]);
    for (let t = win.start; t + service.duration <= win.end; t += step) {
      const st = zonedToUtc(day, t).getTime();
      const en = st + service.duration * 60000;
      if (st < earliest) continue;
      if (mine.some(([a, b]) => a < en && b > st)) continue;
      const key = new Date(st).toISOString();
      byTime.set(key, [...(byTime.get(key) ?? []), s.id]);
    }
  }
  return [...byTime.entries()].sort().map(([start, staffIds]) => ({ start, staffIds }) as Slot);
}

/** Is this exact time still free for this person? (Checked again at the moment of booking.) */
export async function isFree(store: Store, staffId: string, startIso: string, minutes: number, ignoreId?: string) {
  const st = Date.parse(startIso);
  const en = st + minutes * 60000;
  const near = await appointmentsBetween(store, new Date(st - 6 * 3600000).toISOString(), new Date(en).toISOString());
  return !near.filter(live).some((a) => a.id !== ignoreId && a.staffId === staffId && Date.parse(a.start) < en && Date.parse(a.end) > st);
}
