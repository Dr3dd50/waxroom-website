// Timed texts, run every 15 minutes: the confirmation request (72 h before),
// the reminder (24 h before), the rebooking nudge (when the service's follow-up
// time has passed with nothing booked) and birthdays. Nothing goes out to clients
// during quiet hours; staff texts that waited them out go at the end.
//
// Appointments imported from GlossGenius get no texts from us: GlossGenius still
// sends its own for them. Rebooking nudges and birthdays start once online
// booking here is open, so clients aren't texted by both systems before then.
import type { Store } from '../store/store';
import type { Appointment, Client, Service } from '../types';
import { zoned } from '../lib/time';
import { nice } from '../lib/util';
import { apptVars, autoText, bookingLink, manageLink, releaseUnpaidHolds } from './appointments';
import { getSettings } from './availability';
import { flushOutbox, isQuiet } from './alerts';
import { sendText } from './sms';

export async function runDueTexts(store: Store, now = new Date()) {
  const settings = await getSettings(store);
  const local = zoned(now, settings.timezone);
  const n = settings.notifications;
  const released = await releaseUnpaidHolds(store, now);
  if (isQuiet(local.hour, n)) return { sent: 0, quiet: true, released };
  let sent = await flushOutbox(store, now);

  const horizon = new Date(now.getTime() + (n.confirmHoursBefore + 1) * 3600000).toISOString();
  const upcoming = (await store.range<Appointment>('appointments', now.toISOString(), horizon)).filter(
    (a) => (a.status === 'booked' || a.status === 'confirmed') && a.source !== 'import' && a.deposit?.status !== 'pending',
  );
  for (const a of upcoming) {
    const hours = (Date.parse(a.start) - now.getTime()) / 3600000;
    const client = await store.get<Client>('clients', a.clientId);
    if (!client) continue;
    // booked well ahead: ask them to confirm; booked inside the window already got the booking text
    const bookedAhead = (Date.parse(a.start) - Date.parse(a.createdAt)) / 3600000 > n.confirmHoursBefore;
    if (hours <= n.confirmHoursBefore && hours > n.reminderHoursBefore && !a.texts.confirmRequestAt && bookedAhead && a.status === 'booked') {
      const m = await autoText(store, 'confirm-request', client, await apptVars(store, a, settings), 'confirm-request' as never);
      a.texts.confirmRequestAt = m?.at ?? now.toISOString();
      await store.put('appointments', a);
      if (m) sent++;
    }
    // booked inside the reminder window: the booking text was the reminder
    const remindable = (Date.parse(a.start) - Date.parse(a.createdAt)) / 3600000 > n.reminderHoursBefore;
    if (hours <= n.reminderHoursBefore && !a.texts.reminderAt && remindable) {
      const m = await autoText(store, 'reminder', client, await apptVars(store, a, settings), 'reminder' as never);
      a.texts.reminderAt = m?.at ?? now.toISOString();
      await store.put('appointments', a);
      if (m) sent++;
    }
  }

  // Rebooking nudge and birthdays: once a day is plenty, around 10am.
  if (settings.onlineBooking?.open && local.hour === 10 && now.getMinutes() < 15) {
    const clients = await store.list<Client>('clients');
    const future = new Set((await store.range<Appointment>('appointments', now.toISOString(), '9999')).filter((a) => a.status !== 'cancelled' && a.status !== 'no-show').map((a) => a.clientId));
    const services = new Map((await store.list<Service>('services')).map((s) => [s.id, s]));
    for (const c of clients) {
      if (c.lastVisitAt && !future.has(c.id) && c.rebookNudgedFor !== c.lastVisitAt) {
        const due = await rebookDue(store, c, services, n.rebookAfterDays);
        if (due && now.getTime() - Date.parse(c.lastVisitAt) >= due.days * 86400000) {
          const m = await autoText(store, 'rebook', c, { service: nice(due.service.name), weeks: String(Math.round(due.days / 7)), booking_link: bookingLink(due.service) }, 'rebook' as never);
          c.rebookNudgedFor = c.lastVisitAt;
          await store.put('clients', c);
          if (m) sent++;
        }
      }
      if (c.birthday && c.birthday === local.day.slice(5) && c.birthdayTextYear !== now.getFullYear()) {
        const m = await autoText(store, 'birthday', c, {}, 'birthday' as never);
        c.birthdayTextYear = now.getFullYear();
        await store.put('clients', c);
        if (m) sent++;
      }
    }
  }
  return { sent, quiet: false, released };
}

/**
 * Which service sets the follow-up after a client's last visit, and after how many
 * days: of everything done that day, the one due soonest. null when none of them
 * asks for a nudge.
 */
export async function rebookDue(store: Store, c: Client, services: Map<string, Service>, fallbackDays: number) {
  // the visit: everything that ended in the 14 hours up to the last checkout
  const from = new Date(Date.parse(c.lastVisitAt!) - 14 * 3600000).toISOString();
  const visit = (await store.range<Appointment>('appointments', from, `${c.lastVisitAt}~`)).filter((a) => a.clientId === c.id && a.status === 'completed' && a.end <= c.lastVisitAt!);
  let best: { service: Service; days: number } | null = null;
  for (const a of visit) {
    const service = services.get(a.serviceId);
    if (!service) continue;
    const days = service.rebookAfterDays === undefined ? fallbackDays : service.rebookAfterDays;
    if (days !== null && (!best || days < best.days)) best = { service, days };
  }
  return best;
}

/** A client texted us back. C confirms, R gets the reschedule link, STOP/START opt out and in. */
export async function handleInbound(store: Store, from: string, body: string) {
  const at = new Date().toISOString();
  const client = (await store.list<Client>('clients')).find((c) => c.phone === from);
  await store.put('messages', { id: `${at}_in`, at, direction: 'in', to: 'studio', from, clientId: client?.id, kind: 'inbound', body, status: 'received' });
  if (!client) return null;
  const word = body.trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(word)) {
    // the carrier also blocks further texts until they reply START
    client.smsReminders = false;
    client.smsMarketing = false;
    await store.put('clients', client);
    return null;
  }
  if (['START', 'UNSTOP', 'YES'].includes(word) && !client.smsReminders) {
    client.smsReminders = true;
    await store.put('clients', client);
    return sendText(store, client.phone, 'You’re back on appointment texts from The Wax Room.', 'reply', client);
  }
  const next = (await store.range<Appointment>('appointments', at, '9999')).find((a) => a.clientId === client.id && (a.status === 'booked' || a.status === 'confirmed'));
  if (word === 'C' || word === 'CONFIRM') {
    if (!next) return sendText(store, client.phone, 'We don’t see an upcoming appointment. Book anytime: ' + bookingLink(), 'reply', client);
    next.status = 'confirmed';
    next.texts.confirmedAt = at;
    await store.put('appointments', next);
    const v = await apptVars(store, next);
    return sendText(store, client.phone, `Confirmed: ${v.service} ${v.day} at ${v.time}. See you then!`, 'reply', client);
  }
  if (word === 'R' && next) return sendText(store, client.phone, `Pick a new time here: ${manageLink(next)}`, 'reply', client);
  return null; // anything else shows in the dashboard inbox for staff to answer
}
