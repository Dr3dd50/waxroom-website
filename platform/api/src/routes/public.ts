// What the public website calls: the bookable menu, open times, booking with a
// saved card, managing a booking from the texted link, referral links and
// joining a membership.
import { Hono } from 'hono';
import type { Store } from '../store/store';
import type { Appointment, Client, Membership, Package, Service, Staff } from '../types';
import { addDays, zoned } from '../lib/time';
import { HttpError, bad, money, nice, nowIso, rid, toE164 } from '../lib/util';
import { getSettings, isFree, slotsFor } from '../services/availability';
import { findClientByPhone, upsertClient, type ClientInput } from '../services/clients';
import { sendText } from '../services/sms';
import { payments } from '../services/payments';
import { twilioLive } from '../config';
import { apptVars, cancelAppointment, cancelOutcome, completeDeposit, createAppointment, finalizeOnlineBooking, manageLink, moveAppointment, onAppointment, refundHours } from '../services/appointments';
import { validEmail } from '../services/email';
import { googleCalendarUrl, icsFor } from '../services/calendar';
import { grantPackage } from '../services/clients';
import { switched, withLock } from '../services/switchover';
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

/** Anything that books, changes a booking or takes payment: only after the switch from GlossGenius. */
async function requireOpen(store: Store) {
  if (!switched(await getSettings(store))) throw new HttpError(403, 'Online booking here isn’t open yet. Please book on GlossGenius for now.');
}

/** The Meta event for a finished booking (sent once the deposit, if any, has gone through). */
async function bookedEvent(store: Store, appt: Appointment, client: Client, b: { tracking?: unknown; url?: string }, header: (h: string) => string | undefined) {
  const service = (await store.get<Service>('services', appt.serviceId))!;
  await sendMetaEvent(store, {
    name: 'Schedule',
    tracking: readTracking(b.tracking),
    url: pageUrl(b.url, `${config.siteUrl}/book/`),
    request: requestInfo(header),
    person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
    custom: { content_name: service.name, content_category: service.category, value: appt.price / 100, currency: 'USD' },
  });
}

/** The client's calendar invite for a booking, at /api/cal/<token> (the link in their texts). */
export function calendarRoutes(store: Store) {
  const r = new Hono();
  r.get('/:token', async (c) => {
    const t = await store.get<{ id: string; appointmentId: string }>('tokens', c.req.param('token').replace(/\.ics$/, ''));
    const appt = t && (await store.get<Appointment>('appointments', t.appointmentId));
    if (!appt) return c.text('We couldn’t find that booking.', 404);
    const service = (await store.get<Service>('services', appt.serviceId))!;
    const staff = await store.get<Staff>('staff', appt.staffId);
    return c.body(icsFor(appt, service, staff?.short ?? 'us', manageLink(appt)), 200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="wax-room-appointment.ics"',
      'Cache-Control': 'no-store',
    });
  });
  return r;
}

/** A ritual is for a client new to its service: anyone who has had it (or the ritual) books the service itself. */
async function ritualAllowed(store: Store, client: Client, service: Service) {
  if (!service.ritualOf) return;
  const base = await store.get<Service>('services', service.ritualOf);
  const had = (await store.list<Appointment>('appointments')).some(
    (a) => a.clientId === client.id && (a.serviceId === service.ritualOf || a.serviceId === service.id) && a.status !== 'cancelled' && a.status !== 'no-show' && a.deposit?.status !== 'pending',
  );
  if (had) throw new HttpError(409, `The ${nice(service.name)} is for your first ${nice(base?.name ?? 'visit')}. You can book the ${nice(base?.name ?? 'service')} itself instead.`);
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

  // The website's text opt-out form. Offers only, or every text (the same as replying STOP).
  // It says the same thing whether or not the number is a client's, so it can't be used to
  // find out who is; a client's number gets one text saying it's done, so the owner of the
  // number knows if someone else sent the form.
  r.post('/texts/opt-out', async (c) => {
    const b = await c.req.json<{ phone?: string; scope?: string }>();
    const phone = toE164(b.phone ?? '');
    if (!phone) throw bad('Enter the 10-digit mobile number our texts come to.');
    if (b.scope !== 'offers' && b.scope !== 'all') throw bad('Choose which texts to stop.');
    const client = await findClientByPhone(store, phone);
    const changes = client && (client.smsMarketing || (b.scope === 'all' && client.smsReminders));
    if (client && changes) {
      client.smsMarketing = false;
      if (b.scope === 'all') client.smsReminders = false;
      client.smsOptOut = { at: nowIso(), source: 'web-form', scope: b.scope };
      await store.put('clients', client);
      await sendText(
        store,
        client.phone,
        b.scope === 'all'
          ? 'You’re unsubscribed from all texts from The Wax Room. Reply START to get appointment texts again.'
          : 'You won’t get offers or news from The Wax Room by text. Appointment texts continue; reply STOP to stop those too.',
        'opt-out',
        client,
      );
    }
    return c.json({ ok: true, scope: b.scope });
  });

  r.get('/config', async (c) => {
    const s = await getSettings(store);
    return c.json({
      booking: switched(s) ? 'open' : 'closed',
      payments: payments.live() ? 'stripe' : 'simulated',
      texts: twilioLive() ? 'twilio' : 'simulated',
      // while appointment emails are on, online booking asks for an address to send them to
      emailRequired: !!s.emails?.enabled,
      stripePublishableKey: payments.publishableKey(),
      referrals: s.referrals,
      policies: {
        cancellationPolicy: s.policies.cancellationPolicy,
        cancellationWindowHours: s.policies.cancellationWindowHours,
        cancellationFeePercent: s.policies.cancellationFeePercent,
        depositRefundHours: refundHours(s),
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
          ritualOf: s.ritualOf,
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
    await requireOpen(store);
    const body = await c.req.json<{ client: ClientInput }>();
    if ((await getSettings(store)).emails?.enabled && !validEmail(body.client?.email)) throw bad('Enter your email so we can send your confirmation.');
    const { client } = await upsertClient(store, body.client);
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    const setup = await payments.startCardSetup(client.customerId);
    return c.json({ clientId: client.id, ...setup });
  });

  // Step 2: card saved → book the time (checked again), take any deposit, text the confirmation.
  r.post('/bookings/confirm', async (c) => {
    await requireOpen(store);
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; serviceId: string; staffId?: string | null; start: string; referralCode?: string; notes?: string; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    const service = await store.get<Service>('services', b.serviceId);
    if (!client || !service || !service.bookableOnline) throw bad('Something went wrong. Please start again.');
    await ritualAllowed(store, client, service);
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    await store.put('clients', client);
    // only times the booking page could have offered: hours, availability, lead time, time off
    const offered = (await slotsFor(store, service, zoned(b.start).day, b.staffId ?? null)).find((s) => s.start === b.start);
    const staffIds = offered ? (b.staffId ? offered.staffIds.filter((id) => id === b.staffId) : offered.staffIds) : [];
    let staffId: string | undefined;
    for (const id of staffIds) if (await isFree(store, id, b.start, service.duration)) staffId = id;
    if (!staffId) throw new HttpError(409, 'That time was just taken. Please pick another.');
    const appt = await createAppointment(store, { client, isNewClient: false, service, staffId, start: b.start, source: 'online', referralCode: b.referralCode, notes: b.notes });
    const done = await finalizeOnlineBooking(store, appt, client);
    // the bank wants the client to approve the deposit: the page shows that, then calls /deposit
    if (done.needsAuth) return c.json({ needsAuthentication: true, token: appt.manageToken, ...done.needsAuth });
    // Meta: the booking, with the browser's event id so the two copies count once
    await bookedEvent(store, appt, client, b, (h) => c.req.header(h));
    return c.json(await describe(appt));
  });

  // Step 3, only when the deposit needed the client's approval: check it went through.
  r.post('/booking/:token/deposit', async (c) => {
    await requireOpen(store);
    const b = await c.req.json<{ tracking?: unknown; url?: string }>().catch(() => ({}));
    const appt = await completeDeposit(store, await byToken(c.req.param('token')));
    const client = (await store.get<Client>('clients', appt.clientId))!;
    await bookedEvent(store, appt, client, b, (h) => c.req.header(h));
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
    const open = ['booked', 'confirmed'].includes(appt.status);
    // what cancelling now would mean, worked out exactly as the cancel itself does
    const ifCancelled = open ? cancelOutcome(appt, settings) : null;
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
      cancelPolicyFee: ifCancelled?.policyFee ?? 0,
      cancelFee: ifCancelled?.fee ?? 0,
      cancelDepositRefund: ifCancelled?.depositRefund ?? 0,
      cancelDepositKept: ifCancelled?.depositKept ?? 0,
      cancelled: appt.cancel ? { fee: appt.cancel.feeStatus === 'charged' ? appt.cancel.fee : 0, depositRefund: appt.cancel.depositRefund ?? 0 } : null,
      canCancelOnline: settings.policies.allowOnlineCancellations,
      windowHours: settings.policies.cancellationWindowHours,
      refundHours: refundHours(settings),
      calendar: { ics: `${config.siteUrl}/api/cal/${appt.manageToken}`, google: googleCalendarUrl(appt, (await store.get<Service>('services', appt.serviceId))!, manageLink(appt)) },
    };
  }

  r.get('/booking/:token', async (c) => c.json(await describe(await byToken(c.req.param('token')))));

  r.post('/booking/:token/cancel', async (c) => {
    await requireOpen(store);
    const settings = await getSettings(store);
    if (!settings.policies.allowOnlineCancellations) throw bad('Please call or text us to cancel.');
    const appt = await cancelAppointment(store, await byToken(c.req.param('token')), { by: 'client' });
    return c.json(await describe(appt));
  });

  // "Confirm you're coming", from the link in the confirmation email (by text it's a reply of C)
  r.post('/booking/:token/attend', async (c) => {
    await requireOpen(store);
    const appt = await onAppointment(store, await byToken(c.req.param('token')), async (a) => {
      if (a.status === 'booked' && Date.parse(a.start) > Date.now()) {
        a.status = 'confirmed';
        a.texts.confirmedAt = nowIso();
        await store.put('appointments', a);
      }
      return a;
    });
    return c.json(await describe(appt));
  });

  r.post('/booking/:token/reschedule', async (c) => {
    await requireOpen(store);
    const appt = await byToken(c.req.param('token'));
    const settings = await getSettings(store);
    const b = await c.req.json<{ start: string }>();
    if (!['booked', 'confirmed'].includes(appt.status) || appt.deposit?.status === 'pending') throw bad('This booking can’t be changed.');
    if ((Date.parse(appt.start) - Date.now()) / 3600000 < settings.policies.cancellationWindowHours)
      throw bad(`Changes within ${settings.policies.cancellationWindowHours} hours need a call or text to the studio.`);
    const service = (await store.get<Service>('services', appt.serviceId))!;
    const offered = (await slotsFor(store, service, zoned(b.start).day, appt.staffId)).some((s) => s.start === b.start);
    if (!offered) throw new HttpError(409, 'That time isn’t available. Please pick another.');
    return c.json(await describe(await moveAppointment(store, appt, { start: b.start, staffId: appt.staffId }, { client: true })));
  });

  // A card for a client booked by phone or at the desk, from the link the studio texted.
  type CardToken = { id: string; kind: 'card'; clientId: string; expiresAt: string };
  async function cardToken(token: string) {
    const t = await store.get<CardToken>('tokens', token);
    const client = t?.kind === 'card' && t.expiresAt > nowIso() ? await store.get<Client>('clients', t.clientId) : null;
    if (!t || !client) throw new HttpError(404, 'This card link has expired. Text us for a new one.');
    return { t, client };
  }
  r.get('/card/:token', async (c) => {
    const { client } = await cardToken(c.req.param('token'));
    return c.json({ first: client.first, card: client.card ? `${client.card.brand} •• ${client.card.last4}` : null });
  });
  r.post('/card/:token/start', async (c) => {
    await requireOpen(store);
    const { client } = await cardToken(c.req.param('token'));
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    return c.json(await payments.startCardSetup(client.customerId));
  });
  r.post('/card/:token/confirm', async (c) => {
    await requireOpen(store);
    const { t, client } = await cardToken(c.req.param('token'));
    const b = await c.req.json<{ setupId: string; simulatedCard?: { number: string } }>();
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    await store.put('clients', client);
    await store.delete('tokens', t.id); // one card per link
    return c.json({ first: client.first, card: `${client.card.brand} •• ${client.card.last4}` });
  });

  r.get('/referral/:code', async (c) => {
    const settings = await getSettings(store);
    const code = c.req.param('code').toUpperCase();
    const referrer = (await store.list<Client>('clients')).find((x) => x.referralCode.toUpperCase() === code);
    if (!referrer || !settings.referrals.enabled) throw new HttpError(404, 'This referral link isn’t active.');
    return c.json({ code: referrer.referralCode, from: referrer.first, friendGets: settings.referrals.friendGets });
  });

  // Memberships: same two steps as booking, then a monthly subscription.
  r.post('/memberships/:id/start', async (c) => {
    await requireOpen(store);
    const m = await store.get<Membership>('memberships', c.req.param('id'));
    if (!m?.active) throw new HttpError(404, 'That membership isn’t available.');
    const { client } = await upsertClient(store, (await c.req.json<{ client: ClientInput }>()).client);
    if (client.membership?.status === 'active' || client.membership?.status === 'past_due') throw bad('You already have a membership. Text us to switch.');
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    return c.json({ clientId: client.id, ...(await payments.startCardSetup(client.customerId)) });
  });

  r.post('/memberships/:id/confirm', async (c) => {
    await requireOpen(store);
    const m = await store.get<Membership>('memberships', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!m || !client) throw bad('Something went wrong. Please start again.');
    if (client.membership?.status === 'active' || client.membership?.status === 'past_due') throw bad('You already have a membership. Text us to switch.');
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    // a join left waiting on the bank's approval is dropped, so it can never bill alongside this one
    if (client.membership?.status === 'pending' && client.membership.subscriptionId) await payments.cancelSubscription(client.membership.subscriptionId).catch(() => {});
    const sub = await payments.subscribe(client.customerId!, client.card, m, true);
    if (sub.priceId && !m.stripePriceId) await store.put('memberships', { ...m, stripePriceId: sub.priceId });
    if (sub.error) {
      await store.put('clients', client);
      throw new HttpError(402, `The first month didn’t go through: ${sub.error}. Try another card.`);
    }
    client.membership = { membershipId: m.id, since: nowIso(), status: sub.active ? 'active' : 'pending', subscriptionId: sub.id, periodStart: nowIso() };
    await store.put('clients', client);
    if (sub.needsAuth) return c.json({ needsAuthentication: true, ...sub.needsAuth });
    return c.json(await joined(client, m, sub.invoiceId ?? sub.id, b, (h) => c.req.header(h)));
  });

  // The bank wanted the client to approve the first month: is the membership running now?
  r.post('/memberships/:id/approved', async (c) => {
    await requireOpen(store);
    const m = await store.get<Membership>('memberships', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!m || !client?.membership?.subscriptionId || client.membership.membershipId !== m.id) throw bad('Something went wrong. Please start again.');
    if (client.membership.status === 'active') return c.json(await joined(client, m, null, b, (h) => c.req.header(h)));
    const s = await payments.subscriptionActive(client.membership.subscriptionId);
    if (!s.active) throw new HttpError(402, 'The first month wasn’t approved. Please try again or use another card.');
    client.membership.status = 'active';
    await store.put('clients', client);
    return c.json(await joined(client, m, s.invoiceId ?? client.membership.subscriptionId, b, (h) => c.req.header(h)));
  });

  /** A membership that's running: record the first month (once) and tell Meta. */
  async function joined(client: Client, m: Membership, paymentRef: string | null, b: { tracking?: unknown; url?: string }, header: (h: string) => string | undefined) {
    // once, though the page and Stripe's webhook can both report the first month
    if (paymentRef)
      await withLock(store, `pay|${paymentRef}`, async () => {
        if (!(await store.list<{ providerId?: string }>('payments')).some((p) => p.providerId === paymentRef))
          await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: client.id, kind: 'membership', amount: m.price, tip: 0, method: 'card', status: 'paid', providerId: paymentRef, simulated: !payments.live() });
      });
    await sendMetaEvent(store, {
      name: 'Subscribe',
      tracking: readTracking(b.tracking),
      url: pageUrl(b.url, `${config.siteUrl}/join/`),
      request: requestInfo(header),
      person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
      custom: { content_name: m.name, value: m.price / 100, currency: 'USD', predicted_ltv: (m.price * 12) / 100 },
    });
    return { ok: true, membership: m.name, price: money(m.price), card: client.card ? `${client.card.brand} •• ${client.card.last4}` : null };
  }

  // Packages: pay once, visits are used at checkout until they run out or expire.
  r.post('/packages/:id/start', async (c) => {
    await requireOpen(store);
    const p = await store.get<Package>('packages', c.req.param('id'));
    if (!p?.active) throw new HttpError(404, 'That package isn’t available.');
    const { client } = await upsertClient(store, (await c.req.json<{ client: ClientInput }>()).client);
    client.customerId = await payments.ensureCustomer(client);
    await store.put('clients', client);
    return c.json({ clientId: client.id, ...(await payments.startCardSetup(client.customerId)) });
  });

  r.post('/packages/:id/confirm', async (c) => {
    await requireOpen(store);
    const p = await store.get<Package>('packages', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; setupId: string; simulatedCard?: { number: string }; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!p || !client) throw bad('Something went wrong. Please start again.');
    client.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    await store.put('clients', client);
    const charge = await payments.charge(client.customerId!, client.card, p.price, p.name, { packageId: p.id, clientId: client.id, kind: 'package' }, true);
    if (charge.needsAuth) return c.json({ needsAuthentication: true, paymentId: charge.id, ...charge.needsAuth });
    if (!charge.ok) throw new HttpError(402, `The card was declined (${charge.error ?? 'unknown reason'}).`);
    return c.json(await bought(client, p, charge.id, charge.simulated, b, (h) => c.req.header(h)));
  });

  // The bank wanted the client to approve the package payment: check it went through.
  r.post('/packages/:id/approved', async (c) => {
    await requireOpen(store);
    const p = await store.get<Package>('packages', c.req.param('id'));
    const b = await c.req.json<{ clientId: string; paymentId: string; tracking?: unknown; url?: string }>();
    const client = await store.get<Client>('clients', b.clientId);
    if (!p || !client || !b.paymentId) throw bad('Something went wrong. Please start again.');
    const s = await payments.paymentStatus(b.paymentId);
    // the payment must be Stripe's, for this package, by this client's own Stripe customer
    const matches = s.amount === -1 || (s.amount === p.price && s.metadata.packageId === p.id && s.metadata.clientId === client.id && s.customer === client.customerId);
    if (!s.succeeded || !matches) throw new HttpError(402, 'The payment wasn’t approved. Please try again or use another card.');
    return c.json(await bought(client, p, b.paymentId, !payments.live(), b, (h) => c.req.header(h)));
  });

  async function bought(client: Client, p: Package, paymentId: string, simulated: boolean, b: { tracking?: unknown; url?: string }, header: (h: string) => string | undefined) {
    const { expiresAt } = await grantPackage(store, client, p, paymentId, simulated);
    await sendMetaEvent(store, {
      name: 'Purchase',
      tracking: readTracking(b.tracking),
      url: pageUrl(b.url, `${config.siteUrl}/join/`),
      request: requestInfo(header),
      person: { email: client.email, phone: client.phone, first: client.first, last: client.last, id: client.id },
      custom: { content_name: p.name, content_type: 'product', value: p.price / 100, currency: 'USD' },
    });
    return { ok: true, package: p.name, price: money(p.price), card: client.card ? `${client.card.brand} •• ${client.card.last4}` : null, expiresAt };
  }

  return r;
}
