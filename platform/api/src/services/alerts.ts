// Texts to the team when an appointment is booked, moved or cancelled: the person
// it's with, and the owner a copy of every one. Whoever made the change isn't told
// about it. Client phone numbers and emails are never in these texts, so they
// don't leak to employees who aren't allowed to see them. During quiet hours the
// text waits in the outbox until the morning.
import type { Store } from '../store/store';
import type { Appointment, Client, Message, Service, Settings, Staff } from '../types';
import { addDays, fmtDate, fmtTime, zoned, zonedToUtc } from '../lib/time';
import { money, nice, nowIso, rid } from '../lib/util';
import { getSettings } from './availability';
import { sendText } from './sms';
import { switched, withLock } from './switchover';

export type AlertEvent =
  | { kind: 'booked' }
  | { kind: 'moved'; from: { start: string; staffId: string } }
  | { kind: 'cancelled'; fee?: number; feeCharged?: boolean };

/** Who made the change: a staff member, the client (online or by text), or an import. */
export type Actor = { staff: Staff } | { client: true };

export async function alertStaff(store: Store, appt: Appointment, event: AlertEvent, actor: Actor) {
  const settings = await getSettings(store);
  if (!switched(settings) || !settings.staffAlerts?.enabled || appt.source === 'import') return [];

  const team = await store.list<Staff>('staff');
  const ids = new Set([appt.staffId, ...(event.kind === 'moved' ? [event.from.staffId] : []), ...team.filter((s) => s.role === 'owner').map((s) => s.id)]);
  if ('staff' in actor) ids.delete(actor.staff.id);
  const to = team.filter((s) => ids.has(s.id) && s.active && s.phone && s.alerts !== false);
  if (!to.length) return [];

  const client = await store.get<Client>('clients', appt.clientId);
  const service = await store.get<Service>('services', appt.serviceId);
  const who = (id: string) => team.find((s) => s.id === id)?.short ?? 'someone';
  const when = (iso: string) => `${fmtDate(iso, settings.timezone)} at ${fmtTime(iso, settings.timezone)}`;
  const name = client ? `${client.first} ${client.last ? `${client.last[0]}.` : ''}`.trim() : 'A client';
  const what = `${name}, ${nice(service?.name ?? 'appointment')}`;
  const by = 'staff' in actor ? actor.staff.short : 'the client';
  let body: string;
  if (event.kind === 'booked') body = `New booking: ${what}, ${when(appt.start)} with ${who(appt.staffId)}. ${appt.source === 'online' ? 'Booked online.' : `Booked by ${by}.`}`;
  else if (event.kind === 'moved') body = `Moved: ${what}, now ${when(appt.start)} with ${who(appt.staffId)} (was ${when(event.from.start)}${event.from.staffId !== appt.staffId ? ` with ${who(event.from.staffId)}` : ''}). Moved by ${by}.`;
  else body = `Cancelled: ${what}, ${when(appt.start)} with ${who(appt.staffId)}. Cancelled by ${by}.${event.fee ? ` ${event.feeCharged ? 'Late fee charged' : 'Late fee not charged'}: ${money(event.fee)}.` : ''}`;

  const sendAfter = quietUntil(settings);
  const out: Message[] = [];
  for (const s of to) {
    if (sendAfter) {
      const at = nowIso();
      const msg: Message = { id: `${at}_${rid(4)}`, at, direction: 'out', to: s.phone!, kind: 'alert', body, status: 'queued', sendAfter };
      out.push(await store.put('outbox', msg));
    } else out.push(await sendText(store, s.phone!, body, 'alert'));
  }
  return out;
}

/** Quiet hours run from quietStart to quietEnd, usually overnight (21 → 9). */
export const isQuiet = (hour: number, n: { quietStart: number; quietEnd: number }) =>
  n.quietStart > n.quietEnd ? hour >= n.quietStart || hour < n.quietEnd : hour >= n.quietStart && hour < n.quietEnd;

/** In quiet hours: when they end. Otherwise null. */
export function quietUntil(settings: Settings, now = new Date()) {
  const n = settings.notifications;
  const local = zoned(now, settings.timezone);
  if (!isQuiet(local.hour, n)) return null;
  // overnight (9pm–9am): after midnight it ends today, before midnight tomorrow
  const day = n.quietStart > n.quietEnd && local.hour >= n.quietStart ? addDays(local.day, 1) : local.day;
  return zonedToUtc(day, n.quietEnd * 60, settings.timezone).toISOString();
}

/** Send what waited out the quiet hours (run by the 15-minute tick). */
export function flushOutbox(store: Store, now = new Date()) {
  // one run at a time (the 15-minute tick and the owner's "run texts" could overlap)
  return withLock(store, 'outbox', () => flushNow(store, now));
}
async function flushNow(store: Store, now: Date) {
  let sent = 0;
  for (const m of await store.list<Message>('outbox')) {
    if (m.sendAfter && m.sendAfter > now.toISOString()) continue;
    await sendText(store, m.to, m.body, m.kind);
    await store.delete('outbox', m.id);
    sent++;
  }
  return sent;
}
