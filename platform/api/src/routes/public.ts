// What the public website calls: the bookable menu, open times, booking with a
// saved card, managing a booking from the texted link, referral links and
// joining a membership.
import { Hono } from 'hono';
import type { Store } from '../store/store';
import type { Appointment, Client, Membership, Package, Service, Staff } from '../types';
import { addDays, zoned } from '../lib/time';
import { HttpError, bad, money, nice, nowIso, rid } from '../lib/util';
import { getSettings, isFree, slotsFor } from '../services/availability';
import { upsertClient, type ClientInput } from '../services/clients';
import { payments } from '../services/payments';
import { twilioLive } from '../config';
import { apptVars, autoText, cancelAppointment, createAppointment, feeFor, finalizeBooking } from '../services/appointments';
import { readTracking, requestInfo, sendMetaEvent } from '../services/meta';
import { config } from '../config';

/** Where on our site an event happened, for Meta: only our own pages are accepted. */
function pageUrl(raw: unknown, fallback: string) {
  try {
    const u = new URL(String(raw));
    return u.origin === new URL(config.siteUrl).origin ? u.href.slice(0, 500) : fallback;
  } catch {
    return fallback;
  }
}

export function publicRoutes(store: Store) {
  const r = new Hono();

  // Meta: the server copy of a browser event that has no other server step (a tap
  // that leaves for GlossGenius to book). Only these names, so the endpoint can't be
  // used to report purchases. Always 204: tracking never shows the visitor an error.
  const BROWSER_EVENTS = new Set(['InitiateCheckout']);
  r.post('/track', async (c) => {
    const b = await c.req.json<{ event?: string; tracking?: unknown; url?: string; service?: string }>().catch(() => ({}) as Record<string, never>);
    const tracking = readTracking(b.tracking);
    if (b.event && BROWSER_EVENTS.has(b.event) && tracking.eventId) {
      await sendMetaEvent(store, {
        name: b.event,
        tracking,
        url: pageUrl(b.url, `${config.siteUrl}/book/`),
        request: requestInfo((h) => c.req.header(h)),
        custom: typeof b.service === 'string' && b.service ? { content_name: b.service.slice(0, 120), content_category: 'booking' } : undefined,
      });
    }
    return c.body(null, 204);
  });

  r.get('/config', async (c) => {
    const s = await getSettings(store);
    return c.json({
      payments: payments.live() ? 'stripe' : 'simulated',
      texts: twilioLive() ? 'twilio' : 'simulated',
      stripePublishableKey: payments.publishableKey(),
      referrals: s.referrals,
      policies: {
        cancellationPolicy: s.policies.cancellationPolicy,
        cancellationWindowHours: s.policies.cancellationWindowHours,
        cancellationFeePercent: s.policies.cancellationFeePercent,
        cardRequired: s.policies.cardRequired,
      },
    });
  });

  r.get('/catalog', async (c) => {
    const staff = (await store.list<Staff>('staff')).filter((s) => s.active && s.bookable).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1));
    const services = (await store.list<Service>('services')).filter((s) => s.active && s.bookableOnline);
    return c.json({
      staff: staff.map((s) => ({ id: s.id, short: s.short, color: s.color })),
      services: services
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          id: s.id,
          name: nice(s.name),
          category: s.category,
          price: s.price,
          priceVaries: s.priceVaries,
          duration: s.duration,
          deposit: s.deposit,
          depositNewClientsOnly: s.depositNewClientsOnly,
          description: s.description,
          staffIds: s.staffIds.filter((id) => staff.some((x) => x.id === id)),
        })),
      memberships: (await store.list<Membership>('memberships')).filter((m) => m.active && m.public),
      packages: (await store.list<Package>('packages')).filter((p) => p.active),
    });
  });

  r.get('/days', async (c) => {
    const service = await store.get<Service>('services', c.req.query('service') ?? '');
    if (!service) throw bad('Pick a service.');
    const staffId = c.req.query('staff') || null;
    const from = c.req.query('from') ?? zoned(new Date()).day;
    const out: { day: string; open: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const day = addDays(from, i);
      out.push({ day, open: (await slotsFor(store, service, day, staffId)).length });
    }
    return c.json(out);
  });

  r.get('/availability', async (c) => {
    const service = await store.get<Service>('services', c.req.query('service') ?? '');
    if (!service) throw bad('Pick a service.');
    return c.json(await slotsFor(store, service, c.req.query('day') ?? zoned(new Date()).day, c.req.query('staff') || null));
  });

  // Step 1: who's booking, and a card form to fill in.
  r.post('/bookings/start', async (c) => {
    const body = await c.req.json<{ client: ClientInput }>();
    const { client } = await upsertClient(store, body.client);
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    const setup = await payments.startCardSetup(client.customerId);
    return c.json({ clientId: client.id, ...setup });
  });

  // Step 2: card saved → book the time (checked again), take any deposit, text the confirmation.
  r.post('/bookings/confirm', async (c) => {
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; serviceId: string; staffId?: string | null; start: string; referralCode?: string; notes?: string; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    const service = await store.get<Service>('services', b.serviceId);
    if (!client || !service || !service.bookableOnline) throw bad('Something went wrong. Please start again.');
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    await store.put('clients', client);
    // only times the booking page could have offered: hours, availability, lead time, time off
    const offered = (await slotsFor(store, service, zoned(b.start).day, b.staffId ?? null)).find((s) => s.start === b.start);
    const staffIds = offered ? (b.staffId ? offered.staffIds.filter((id) => id === b.staffId) : offered.staffIds) : [];
    let staffId: string | undefined;
    for (const id of staffIds) if (await isFree(store, id, b.start, service.duration)) staffId = id;
    if (!staffId) throw new HttpError(409, 'That time was just taken. Please pick another.');
    const appt = await createAppointment(store, { client, isNewClient: false, service, staffId, start: b.start, source: 'online', referralCode: b.referralCode, notes: b.notes });
    await finalizeBooking(store, appt, client);
    // Meta: the booking, with the browser's event id so the two copies count once
    await sendMetaEvent(store, {
      name: 'Schedule',
      tracking: readTracking(b.tracking),
      url: pageUrl(b.url, `${config.siteUrl}/book/`),
      request: requestInfo((h) => c.req.header(h)),
      person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
      custom: { content_name: service.name, content_category: service.category, value: appt.price / 100, currency: 'USD' },
    });
    return c.json(await describe(appt));
  });

  async function byToken(token: string) {
    const t = await store.get<{ id: string; appointmentId: string }>('tokens', token);
    const appt = t && (await store.get<Appointment>('appointments', t.appointmentId));
    if (!appt) throw new HttpError(404, 'We couldn’t find that booking. Check the link in your text.');
    return appt;
  }

  async function describe(appt: Appointment) {
    const settings = await getSettings(store);
    const v = await apptVars(store, appt, settings);
    const client = (await store.get<Client>('clients', appt.clientId))!;
    return {
      token: appt.manageToken,
      status: appt.status,
      start: appt.start,
      end: appt.end,
      service: v.service,
      serviceId: appt.serviceId,
      staff: v.staff,
      staffId: appt.staffId,
      price: appt.price,
      deposit: appt.deposit?.status === 'paid' ? appt.deposit.amount : 0,
      referralDiscount: appt.referral?.friendDiscount ?? 0,
      first: client.first,
      card: client.card ? `${client.card.brand} •• ${client.card.last4}` : null,
      cancelFee: ['booked', 'confirmed'].includes(appt.status) ? feeFor(appt, settings, false) : 0,
      canCancelOnline: settings.policies.allowOnlineCancellations,
      windowHours: settings.policies.cancellationWindowHours,
    };
  }

  r.get('/booking/:token', async (c) => c.json(await describe(await byToken(c.req.param('token')))));

  r.post('/booking/:token/cancel', async (c) => {
    const settings = await getSettings(store);
    if (!settings.policies.allowOnlineCancellations) throw bad('Please call or text us to cancel.');
    const appt = await cancelAppointment(store, await byToken(c.req.param('token')), { by: 'client' });
    return c.json(await describe(appt));
  });

  r.post('/booking/:token/reschedule', async (c) => {
    const appt = await byToken(c.req.param('token'));
    const settings = await getSettings(store);
    const b = await c.req.json<{ start: string }>();
    if (!['booked', 'confirmed'].includes(appt.status)) throw bad('This booking can’t be changed.');
    if ((Date.parse(appt.start) - Date.now()) / 3600000 < settings.policies.cancellationWindowHours)
      throw bad(`Changes within ${settings.policies.cancellationWindowHours} hours need a call or text to the studio.`);
    const service = (await store.get<Service>('services', appt.serviceId))!;
    const offered = (await slotsFor(store, service, zoned(b.start).day, appt.staffId)).some((s) => s.start === b.start);
    if (!offered || !(await isFree(store, appt.staffId, b.start, service.duration, appt.id))) throw new HttpError(409, 'That time isn’t available. Please pick another.');
    // the id carries the start time, so a new time is a new record
    await store.delete('appointments', appt.id);
    const moved: Appointment = { ...appt, id: `${b.start}_${rid(4)}`, start: b.start, end: new Date(Date.parse(b.start) + service.duration * 60000).toISOString(), status: 'booked', texts: {} };
    await store.put('appointments', moved);
    await store.put('tokens', { id: moved.manageToken, appointmentId: moved.id });
    const client = (await store.get<Client>('clients', moved.clientId))!;
    await finalizeRescheduleText(moved, client);
    return c.json(await describe(moved));
  });

  async function finalizeRescheduleText(appt: Appointment, client: Client) {
    const m = await autoText(store, 'booking', client, await apptVars(store, appt), 'booking' as never);
    if (m) {
      appt.texts.bookedAt = m.at;
      await store.put('appointments', appt);
    }
  }

  r.get('/referral/:code', async (c) => {
    const settings = await getSettings(store);
    const code = c.req.param('code').toUpperCase();
    const referrer = (await store.list<Client>('clients')).find((x) => x.referralCode.toUpperCase() === code);
    if (!referrer || !settings.referrals.enabled) throw new HttpError(404, 'This referral link isn’t active.');
    return c.json({ code: referrer.referralCode, from: referrer.first, friendGets: settings.referrals.friendGets });
  });

  // Memberships: same two steps as booking, then a monthly subscription.
  r.post('/memberships/:id/start', async (c) => {
    const m = await store.get<Membership>('memberships', c.req.param('id'));
    if (!m?.active) throw new HttpError(404, 'That membership isn’t available.');
    const { client } = await upsertClient(store, (await c.req.json<{ client: ClientInput }>()).client);
    if (client.membership?.status === 'active') throw bad('You already have a membership. Text us to switch.');
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    return c.json({ clientId: client.id, ...(await payments.startCardSetup(client.customerId)) });
  });

  r.post('/memberships/:id/confirm', async (c) => {
    const m = await store.get<Membership>('memberships', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!m || !client) throw bad('Something went wrong. Please start again.');
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    const sub = await payments.subscribe(client.customerId!, client.card, m);
    if (sub.priceId && !m.stripePriceId) await store.put('memberships', { ...m, stripePriceId: sub.priceId });
    client.membership = { membershipId: m.id, since: nowIso(), status: 'active', subscriptionId: sub.id, periodStart: nowIso() };
    await store.put('clients', client);
    await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: client.id, kind: 'membership', amount: m.price, tip: 0, method: 'card', status: 'paid', providerId: sub.id, simulated: !payments.live() });
    await sendMetaEvent(store, {
      name: 'Subscribe',
      tracking: readTracking(b.tracking),
      url: pageUrl(b.url, `${config.siteUrl}/join/`),
      request: requestInfo((h) => c.req.header(h)),
      person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
      custom: { content_name: m.name, value: m.price / 100, currency: 'USD', predicted_ltv: (m.price * 12) / 100 },
    });
    return c.json({ ok: true, membership: m.name, price: money(m.price), card: `${client.card.brand} •• ${client.card.last4}` });
  });

  // Packages: pay once, visits are used at checkout until they run out or expire.
  r.post('/packages/:id/start', async (c) => {
    const p = await store.get<Package>('packages', c.req.param('id'));
    if (!p?.active) throw new HttpError(404, 'That package isn’t available.');
    const { client } = await upsertClient(store, (await c.req.json<{ client: ClientInput }>()).client);
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    return c.json({ clientId: client.id, ...(await payments.startCardSetup(client.customerId)) });
  });

  r.post('/packages/:id/confirm', async (c) => {
    const p = await store.get<Package>('packages', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!p || !client) throw bad('Something went wrong. Please start again.');
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    const charge = await payments.charge(client.customerId!, client.card, p.price, p.name, { packageId: p.id });
    if (!charge.ok) throw new HttpError(402, `The card was declined (${charge.error ?? 'unknown reason'}).`);
    const expiresAt = p.expiresMonths ? new Date(Date.now() + p.expiresMonths * 30.44 * 86400000).toISOString() : null;
    client.packages = [...(client.packages ?? []), { packageId: p.id, boughtAt: nowIso(), expiresAt, remaining: Object.fromEntries(p.items.map((i) => [i.serviceId, i.quantity])) }];
    await store.put('clients', client);
    await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: client.id, kind: 'package', amount: p.price, tip: 0, method: 'card', status: 'paid', providerId: charge.id, simulated: charge.simulated });
    await sendMetaEvent(store, {
      name: 'Purchase',
      tracking: readTracking(b.tracking),
      url: pageUrl(b.url, `${config.siteUrl}/join/`),
      request: requestInfo((h) => c.req.header(h)),
      person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
      custom: { content_name: p.name, content_type: 'product', value: p.price / 100, currency: 'USD' },
    });
    return c.json({ ok: true, package: p.name, price: money(p.price), card: `${client.card.brand} •• ${client.card.last4}`, expiresAt });
  });

  return r;
}
