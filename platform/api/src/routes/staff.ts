// What the staff dashboard calls. Everything needs a signed-in staff member;
// employees only see their own calendar and the clients they've seen.
import { Hono } from 'hono';
import { checkPassword, endSession, requireOwner, requireStaff, startSession, type Env } from '../auth';
import type { Store } from '../store/store';
import type { Appointment, Client, Membership, Message, Package, Payment, Referral, Service, Settings, Staff } from '../types';
import { addDays, zoned, zonedToUtc } from '../lib/time';
import { HttpError, bad, nowIso, rid, toE164 } from '../lib/util';
import { appointmentsBetween, getSettings, isFree, slotsFor } from '../services/availability';
import { cancelAppointment, cancelOutcome, checkoutAppointment, feeFor, refundHours, createAppointment, finalizeStaffBooking, membershipVisitsLeft, moveAppointment, quote } from '../services/appointments';
import { importGlossGenius } from '../services/importer';
import { requireSwitched, switched } from '../services/switchover';
import { defaultRebookDays } from '../seed';
import { findClientByPhone, upsertClient, uniqueReferralCode } from '../services/clients';
import { payments } from '../services/payments';
import { sendText } from '../services/sms';
import { sendOrQueue } from '../services/alerts';
import { runDueTexts } from '../services/notify';
import { hashPassword } from '../seed';
import { config, stripeLive, twilioLive } from '../config';

/** How long a texted card link works. */
const CARD_LINK_DAYS = 7;

const publicStaff = (s: Staff) => ({ id: s.id, name: s.name, short: s.short, email: s.email, phone: s.phone, role: s.role, color: s.color, active: s.active, bookable: s.bookable, schedule: s.schedule, timeOff: s.timeOff ?? [], alerts: s.alerts !== false });

export function staffRoutes(store: Store) {
  const r = new Hono<Env>();

  r.post('/login', async (c) => {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    const staff = (await store.list<Staff>('staff')).find((s) => s.active && s.email && s.email.toLowerCase() === (email ?? '').trim().toLowerCase());
    if (!staff || !checkPassword(staff.passwordHash, password ?? '')) throw new HttpError(401, 'That email and password don’t match.');
    startSession(c, staff);
    return c.json(publicStaff(staff));
  });
  r.post('/logout', (c) => {
    endSession(c);
    return c.json({ ok: true });
  });

  r.use('*', requireStaff(store));

  const isOwner = (c: { get: (k: 'staff') => Staff }) => c.get('staff').role === 'owner';
  const ownClientIds = async (staffId: string) => new Set((await store.list<Appointment>('appointments')).filter((a) => a.staffId === staffId).map((a) => a.clientId));
  const canSeeAppt = (c: { get: (k: 'staff') => Staff }, a: Appointment) => isOwner(c) || a.staffId === c.get('staff').id;
  async function apptOr404(c: { get: (k: 'staff') => Staff }, id: string) {
    const a = await store.get<Appointment>('appointments', id);
    if (!a || !canSeeAppt(c, a)) throw new HttpError(404, 'Appointment not found.');
    return a;
  }
  /** A client this staff member may see: anyone for the owner, clients they've seen for an employee. */
  async function clientOr404(c: { get: (k: 'staff') => Staff }, id: string) {
    const x = await store.get<Client>('clients', id);
    if (!x || (!isOwner(c) && !(await ownClientIds(c.get('staff').id)).has(x.id))) throw new HttpError(404, 'Client not found.');
    return x;
  }
  /** Phone numbers and emails: the owner always, employees only when the owner allows it. */
  const seesContact = async (c: { get: (k: 'staff') => Staff }) => isOwner(c) || !!(await getSettings(store)).privacy?.employeesSeeContact;

  r.get('/me', (c) => c.json(publicStaff(c.get('staff'))));

  r.get('/bootstrap', async (c) => {
    const settings = await getSettings(store);
    return c.json({
      me: publicStaff(c.get('staff')),
      // owner first, then by name: the order columns appear on the calendar
      staff: (await store.list<Staff>('staff')).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1)).map(publicStaff),
      services: await store.list<Service>('services'),
      memberships: await store.list<Membership>('memberships'),
      packages: await store.list<Package>('packages'),
      // employees: no text templates, and no import notes (they can carry phone numbers)
      settings: isOwner(c) ? settings : { ...settings, automations: {}, glossGeniusImport: undefined },
      live: { payments: payments.live(), texts: twilioLive() },
      today: zoned(new Date(), settings.timezone).day,
    });
  });

  // ── calendar ──
  r.get('/appointments', async (c) => {
    const settings = await getSettings(store);
    const from = c.req.query('from') ?? zoned(new Date()).day;
    const to = c.req.query('to') ?? from;
    const list = await appointmentsBetween(store, zonedToUtc(from, 0, settings.timezone).toISOString(), zonedToUtc(addDays(to, 1), 0, settings.timezone).toISOString());
    const visible = list.filter((a) => canSeeAppt(c, a));
    const ids = new Set(visible.map((a) => a.clientId));
    const contact = await seesContact(c);
    const clients = (await store.list<Client>('clients')).filter((x) => ids.has(x.id)).map((x) => clientSummary(x, contact));
    return c.json({ appointments: visible, clients });
  });

  r.get('/availability', async (c) => {
    const service = await store.get<Service>('services', c.req.query('service') ?? '');
    if (!service) throw bad('Pick a service.');
    return c.json(await slotsFor(store, service, c.req.query('day')!, c.req.query('staff') || null, { staffSide: true }));
  });

  r.post('/appointments', async (c) => {
    const b = await c.req.json<{ clientId?: string; client?: { first: string; last: string; phone: string; email?: string; smsMarketing?: boolean }; serviceId: string; staffId: string; start: string; notes?: string; price?: number }>();
    if (!isOwner(c) && b.staffId !== c.get('staff').id) throw new HttpError(403, 'You can only book on your own calendar.');
    await requireSwitched(store, 'Booking here');
    const service = await store.get<Service>('services', b.serviceId);
    if (!service) throw bad('Pick a service.');
    let client: Client | undefined;
    let isNew = false;
    if (b.clientId) client = await store.get<Client>('clients', b.clientId);
    // a new client starts on appointment texts; an existing one keeps their choice (a STOP stays a STOP)
    else if (b.client) ({ client, isNew } = await upsertClient(store, b.client, { trusted: true }));
    if (!client) throw bad('Pick or add a client.');
    if (b.clientId && !isOwner(c)) await clientOr404(c, client.id);
    const appt = await createAppointment(store, { client, isNewClient: isNew, service, staffId: b.staffId, start: b.start, source: 'staff', notes: b.notes, price: b.price });
    // booked at the desk: a deposit only if there's a card to take it from
    return c.json(await finalizeStaffBooking(store, appt, client, c.get('staff')));
  });

  r.patch('/appointments/:id', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ status?: 'confirmed' | 'checked-in' | 'booked'; notes?: string }>();
    if (b.status) {
      await requireSwitched(store, 'Checking in and confirming here');
      if (['completed', 'cancelled', 'no-show'].includes(a.status)) throw bad('This appointment is closed.');
      a.status = b.status;
    }
    if (b.notes !== undefined) a.notes = b.notes;
    await store.put('appointments', a);
    return c.json(a);
  });

  r.post('/appointments/:id/move', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ start: string; staffId?: string }>();
    const staffId = b.staffId ?? a.staffId;
    if (!isOwner(c) && staffId !== c.get('staff').id) throw new HttpError(403, 'You can only book on your own calendar.');
    await requireSwitched(store, 'Moving appointments here');
    const service = (await store.get<Service>('services', a.serviceId))!;
    if (!(await isFree(store, staffId, b.start, service.duration, a.id))) throw new HttpError(409, 'That time overlaps another appointment.');
    return c.json(await moveAppointment(store, a, { start: b.start, staffId }, { staff: c.get('staff') }));
  });

  r.post('/appointments/:id/cancel', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ noShow?: boolean; waive?: boolean }>();
    await requireSwitched(store, 'Cancelling appointments here');
    return c.json(await cancelAppointment(store, a, { by: 'staff', noShow: b.noShow, waive: b.waive, staff: c.get('staff') }));
  });

  // What each way of cancelling would charge and refund right now (the same sums the cancel uses).
  r.get('/appointments/:id/cancel-preview', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const settings = await getSettings(store);
    const late = feeFor(a, settings, false) > 0;
    return c.json({
      late,
      windowHours: settings.policies.cancellationWindowHours,
      refundHours: refundHours(settings),
      cancel: cancelOutcome(a, settings),
      waive: cancelOutcome(a, settings, { waive: true }),
      noShow: cancelOutcome(a, settings, { noShow: true }),
    });
  });

  r.get('/appointments/:id/quote', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const q = await quote(store, a, {
      useCredit: c.req.query('credit') !== 'false',
      useMembership: c.req.query('membership') !== 'false',
      price: c.req.query('price') ? Number(c.req.query('price')) : undefined,
    });
    const settings = await getSettings(store);
    return c.json({
      lines: q.lines,
      due: q.due,
      membershipLeft: q.membershipLeft,
      credit: q.client.credit,
      card: q.client.card ? `${q.client.card.brand} •• ${q.client.card.last4}` : null,
      tipBase: a.price,
      defaultTipPercent: settings.policies.defaultTipPercent,
    });
  });

  r.post('/appointments/:id/checkout', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ tip: number; method: 'card' | 'cash' | 'other'; useCredit: boolean; useMembership: boolean; price?: number }>();
    await requireSwitched(store, 'Checkout here');
    return c.json(await checkoutAppointment(store, a, { ...b, staffId: c.get('staff').id }));
  });

  // ── clients ──
  const clientSummary = (x: Client, contact: boolean) => ({
    id: x.id,
    first: x.first,
    last: x.last,
    phone: contact ? x.phone : '',
    email: contact ? x.email : '',
    contactHidden: !contact,
    notes: x.notes,
    credit: x.credit,
    card: x.card ? `${x.card.brand} •• ${x.card.last4}` : null,
    membership: x.membership,
    smsReminders: x.smsReminders,
    smsMarketing: x.smsMarketing,
    referralCode: x.referralCode,
    referredBy: x.referredBy,
    createdAt: x.createdAt,
    lastVisitAt: x.lastVisitAt,
    birthday: x.birthday,
    // thank-you visits still to use
    perks: (x.perks ?? []).filter((p) => !p.usedAt && (!p.expiresAt || p.expiresAt > nowIso())).map((p) => ({ id: p.id, serviceId: p.serviceId, label: p.label, expiresAt: p.expiresAt })),
  });

  r.get('/clients', async (c) => {
    let list = await store.list<Client>('clients');
    if (!isOwner(c)) {
      const mine = await ownClientIds(c.get('staff').id);
      list = list.filter((x) => mine.has(x.id));
    }
    const contact = await seesContact(c);
    return c.json(list.map((x) => clientSummary(x, contact)).sort((a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`)));
  });

  r.get('/clients/:id', async (c) => {
    const x = await clientOr404(c, c.req.param('id')!);
    const appts = (await store.list<Appointment>('appointments')).filter((a) => a.clientId === x.id);
    const referrals = (await store.list<Referral>('referrals')).filter((rf) => rf.referrerId === x.id || rf.friendId === x.id);
    const names = new Map((await store.list<Client>('clients')).map((k) => [k.id, `${k.first} ${k.last}`]));
    const membershipLeft: Record<string, number> = {};
    if (x.membership?.status === 'active') {
      const m = await store.get<Membership>('memberships', x.membership.membershipId);
      for (const inc of m?.includes ?? []) membershipLeft[inc.serviceId] = await membershipVisitsLeft(store, x, inc.serviceId);
    }
    const spent = (await store.list<Payment>('payments')).filter((p) => p.clientId === x.id && p.status === 'paid').reduce((n, p) => n + p.amount + p.tip, 0);
    return c.json({
      client: clientSummary(x, await seesContact(c)),
      appointments: appts,
      referrals: referrals.map((rf) => ({ ...rf, referrerName: names.get(rf.referrerId), friendName: names.get(rf.friendId) })),
      membershipLeft,
      spent: isOwner(c) ? spent : null,
    });
  });

  r.post('/clients', async (c) => {
    const b = await c.req.json<{ first: string; last: string; phone: string; email?: string; smsMarketing?: boolean; birthday?: string }>();
    const phone = toE164(b.phone ?? '');
    if (phone && (await findClientByPhone(store, phone))) throw bad('A client with that phone number is already on file. Search for them instead.');
    const { client } = await upsertClient(store, b, { trusted: true });
    return c.json(clientSummary(client, await seesContact(c)));
  });

  r.patch('/clients/:id', async (c) => {
    const x = await clientOr404(c, c.req.param('id')!);
    const b = await c.req.json<Partial<{ first: string; last: string; phone: string; email: string; notes: string; birthday: string; smsReminders: boolean; smsMarketing: boolean }>>();
    const contact = await seesContact(c);
    if (!contact) {
      // an empty field here is the hidden value coming back, not a change
      delete b.phone;
      delete b.email;
    }
    if (b.phone !== undefined) {
      const p = toE164(b.phone);
      if (!p) throw bad('Enter a 10-digit US mobile number.');
      x.phone = p;
    }
    for (const k of ['first', 'last', 'email', 'notes', 'birthday', 'smsReminders'] as const) if (b[k] !== undefined) (x as Record<string, unknown>)[k] = b[k];
    if (b.smsMarketing !== undefined) {
      x.smsMarketing = b.smsMarketing;
      if (b.smsMarketing) x.smsMarketingAt = nowIso();
    }
    if (!x.referralCode) x.referralCode = await uniqueReferralCode(store, x.first);
    await store.put('clients', x);
    return c.json(clientSummary(x, contact));
  });

  // A card for a client booked by phone or at the desk: text them a link to Stripe's
  // card form on our site. Nobody at the studio types or sees a card number.
  r.post('/clients/:id/card-link', async (c) => {
    await requireSwitched(store, 'Saving cards');
    const x = await clientOr404(c, c.req.param('id')!);
    const token = rid(16);
    await store.put('tokens', { id: token, kind: 'card', clientId: x.id, expiresAt: new Date(Date.now() + CARD_LINK_DAYS * 86400000).toISOString() });
    const link = `${config.siteUrl}/card/?t=${token}`;
    if (!x.smsReminders) return c.json({ link, texted: false, reason: `${x.first} has opted out of texts, so share the link another way.` });
    const settings = await getSettings(store);
    const m = await sendOrQueue(store, settings, x.phone, `Hi ${x.first}, add a card for your Wax Room appointments here: ${link} It's saved securely with Stripe. The link works for ${CARD_LINK_DAYS} days.`, 'card-link', x);
    return c.json({ link, texted: m.status !== 'failed', queued: m.status === 'queued', error: m.error });
  });

  r.post('/clients/:id/membership', requireOwner, async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    const { membershipId } = await c.req.json<{ membershipId: string | null }>();
    if (!x) throw new HttpError(404, 'Client not found.');
    await requireSwitched(store, 'Memberships here');
    if (!membershipId) {
      if (x.membership?.subscriptionId) await payments.cancelSubscription(x.membership.subscriptionId);
      if (x.membership) x.membership.status = 'cancelled';
      await store.put('clients', x);
      return c.json(clientSummary(x, true));
    }
    const m = await store.get<Membership>('memberships', membershipId);
    if (!m) throw bad('Pick a membership.');
    const current = x.membership && x.membership.status !== 'cancelled' ? x.membership : null;
    if (current?.membershipId === m.id && current.status === 'active') throw bad(`${x.first} is already on ${m.name}.`);
    if (!x.card) throw bad('Text the client a card link first (Add a card).');
    x.customerId ??= await payments.ensureCustomer(x);
    // the client isn't here to approve a payment their bank flags; then they join online instead
    const sub = await payments.subscribe(x.customerId, x.card, m);
    if (sub.priceId && !m.stripePriceId) await store.put('memberships', { ...m, stripePriceId: sub.priceId });
    if (!sub.active) throw new HttpError(402, `The first month didn’t go through: ${sub.error ?? 'card declined'}. The client can join online, where they can approve it with their bank.`);
    // a switch: the old membership stops billing once the new one is running
    if (current?.subscriptionId && current.subscriptionId !== sub.id) await payments.cancelSubscription(current.subscriptionId);
    x.membership = { membershipId: m.id, since: nowIso(), status: 'active', subscriptionId: sub.id, periodStart: nowIso() };
    await store.put('clients', x);
    await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: x.id, kind: 'membership', amount: m.price, tip: 0, method: 'card', status: 'paid', providerId: sub.invoiceId ?? sub.id, simulated: !payments.live() });
    return c.json(clientSummary(x, true));
  });

  r.post('/clients/:id/text', async (c) => {
    await requireSwitched(store, 'Texting clients from here');
    const x = await clientOr404(c, c.req.param('id')!);
    const { body } = await c.req.json<{ body: string }>();
    if (!body?.trim()) throw bad('Write a message.');
    if (!x.smsReminders) throw bad(`${x.first} has opted out of texts.`);
    const m = await sendText(store, x.phone, body.trim(), 'staff', x);
    // the reply leaves out the number it went to: employees may not be allowed to see it
    return c.json({ id: m.id, at: m.at, status: m.status, error: m.error });
  });

  // ── texts ──
  r.get('/messages', requireOwner, async (c) => {
    const all = await store.list<Message>('messages');
    const names = new Map((await store.list<Client>('clients')).map((k) => [k.id, `${k.first} ${k.last}`]));
    return c.json(all.slice(-300).reverse().map((m) => ({ ...m, clientName: m.clientId ? names.get(m.clientId) : undefined })));
  });

  async function audience(key: string) {
    const clients = (await store.list<Client>('clients')).filter((x) => x.smsMarketing && x.smsReminders);
    if (key === 'members') return clients.filter((x) => x.membership?.status === 'active');
    if (key === 'lapsed') return clients.filter((x) => x.lastVisitAt && Date.now() - Date.parse(x.lastVisitAt) > 56 * 86400000);
    if (key.startsWith('category:')) {
      const cat = key.slice(9);
      const services = new Set((await store.list<Service>('services')).filter((s) => s.category === cat).map((s) => s.id));
      const ids = new Set((await store.list<Appointment>('appointments')).filter((a) => services.has(a.serviceId)).map((a) => a.clientId));
      return clients.filter((x) => ids.has(x.id));
    }
    return clients;
  }

  r.get('/campaigns/audience', requireOwner, async (c) => c.json({ count: (await audience(c.req.query('key') ?? 'all')).length }));

  r.post('/campaigns', requireOwner, async (c) => {
    const b = await c.req.json<{ audience: string; body: string }>();
    await requireSwitched(store, 'Text campaigns');
    if (!b.body?.trim()) throw bad('Write a message.');
    const list = await audience(b.audience);
    // marketing texts always carry the opt-out line
    const text = `${b.body.trim()}\nReply STOP to opt out`;
    const settings = await getSettings(store);
    let sent = 0;
    let queued = 0;
    for (const x of list) {
      // during quiet hours each one waits in the outbox until morning
      const m = await sendOrQueue(store, settings, x.phone, text.replace('{first}', x.first), 'campaign', x);
      if (m.status === 'queued') queued++;
      else if (m.status !== 'failed') sent++;
    }
    return c.json({ sent, queued, of: list.length, simulated: !twilioLive() });
  });

  r.post('/run-texts', requireOwner, async (c) => {
    await requireSwitched(store, 'Timed texts');
    return c.json(await runDueTexts(store));
  });

  // ── money ──
  r.get('/payments', requireOwner, async (c) => {
    const from = c.req.query('from') ?? addDays(zoned(new Date()).day, -7);
    const list = await store.range<Payment>('payments', zonedToUtc(from, 0).toISOString(), '9999');
    const names = new Map((await store.list<Client>('clients')).map((k) => [k.id, `${k.first} ${k.last}`]));
    return c.json(list.reverse().map((p) => ({ ...p, clientName: names.get(p.clientId) })));
  });

  r.get('/referrals', requireOwner, async (c) => {
    const names = new Map((await store.list<Client>('clients')).map((k) => [k.id, `${k.first} ${k.last}`]));
    const credit = new Map((await store.list<Client>('clients')).map((k) => [k.id, k.credit]));
    const list = (await store.list<Referral>('referrals')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return c.json(list.map((rf) => ({ ...rf, referrerName: names.get(rf.referrerId), friendName: names.get(rf.friendId), referrerCredit: credit.get(rf.referrerId) })));
  });

  // ── owner settings ──
  // The text inviting a client to book again, per service: on or off, and after how many days.
  r.put('/rebook-texts', requireOwner, async (c) => {
    const b = await c.req.json<{ services: { id: string; on: boolean; days: number }[] }>();
    for (const row of b.services ?? []) {
      const s = await store.get<Service>('services', row.id);
      if (!s) continue;
      const days = Math.round(Number(row.days));
      if (row.on && !(days >= 1 && days <= 365)) throw bad(`Set the timing for ${s.name} (1 to 52 weeks).`);
      await store.put('services', { ...s, rebookText: !!row.on, rebookAfterDays: days >= 1 ? Math.min(365, days) : s.rebookAfterDays });
    }
    return c.json(await store.list<Service>('services'));
  });

  r.put('/services/:id', requireOwner, async (c) => {
    const s = await store.get<Service>('services', c.req.param('id')!);
    if (!s) throw new HttpError(404, 'Service not found.');
    const b = await c.req.json<Partial<Service>>();
    const next: Service = { ...s, ...pick(b, ['name', 'category', 'price', 'priceVaries', 'duration', 'deposit', 'depositNewClientsOnly', 'description', 'staffIds', 'active', 'prepTip', 'order']) };
    if (b.rebookAfterDays !== undefined) next.rebookAfterDays = b.rebookAfterDays === null ? null : Math.max(1, Math.round(b.rebookAfterDays));
    const staff = await store.list<Staff>('staff');
    next.bookableOnline = next.active && next.staffIds.some((id) => staff.find((x) => x.id === id)?.bookable);
    return c.json(await store.put('services', next));
  });
  r.post('/services', requireOwner, async (c) => {
    const b = await c.req.json<Partial<Service>>();
    if (!b.name || !b.category || b.price == null || !b.duration) throw bad('A service needs a name, category, price and length.');
    const s: Service = { id: rid(), name: b.name, category: b.category, order: b.order ?? 99, price: b.price, priceVaries: !!b.priceVaries, duration: b.duration, deposit: b.deposit ?? null, depositNewClientsOnly: !!b.depositNewClientsOnly, description: b.description ?? null, staffIds: b.staffIds ?? [], active: true, bookableOnline: false };
    s.rebookAfterDays = b.rebookAfterDays !== undefined ? b.rebookAfterDays : defaultRebookDays(s);
    const staff = await store.list<Staff>('staff');
    s.bookableOnline = s.staffIds.some((id) => staff.find((x) => x.id === id)?.bookable);
    return c.json(await store.put('services', s));
  });
  r.put('/memberships/:id', requireOwner, async (c) => {
    const m = await store.get<Membership>('memberships', c.req.param('id')!);
    if (!m) throw new HttpError(404, 'Membership not found.');
    const b = await c.req.json<Partial<Membership>>();
    // a new price needs a new Stripe price; existing members keep theirs until moved
    const next = { ...m, ...pick(b, ['name', 'description', 'price', 'includes', 'active', 'public']) };
    if (b.price !== undefined && b.price !== m.price) delete next.stripePriceId;
    return c.json(await store.put('memberships', next));
  });
  r.put('/packages/:id', requireOwner, async (c) => {
    const p = await store.get<Package>('packages', c.req.param('id')!);
    if (!p) throw new HttpError(404, 'Package not found.');
    return c.json(await store.put('packages', { ...p, ...pick(await c.req.json<Partial<Package>>(), ['name', 'price', 'items', 'expiresMonths', 'active']) }));
  });

  r.put('/settings', requireOwner, async (c) => {
    const s = await getSettings(store);
    const b = await c.req.json<Partial<Settings>>();
    const n = { ...s.notifications, ...b.notifications };
    const whole = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    if (b.notifications) {
      if (!whole(n.reminderHoursBefore, 1, 72)) throw bad('Send the reminder 1 to 72 hours before.');
      if (!whole(n.confirmHoursBefore, 2, 168) || n.confirmHoursBefore <= n.reminderHoursBefore) throw bad('Ask for confirmation earlier than the reminder (up to 7 days before).');
      // the same start and end means no quiet hours
      if (!whole(n.quietStart, 0, 23) || !whole(n.quietEnd, 0, 23)) throw bad('Pick when quiet hours start and end.');
    }
    const rv = b.reviews ? { ...s.reviews!, ...b.reviews } : undefined;
    if (rv) {
      if (!whole(rv.delayHours, 1, 48)) throw bad('Send the rating text 1 to 48 hours after checkout.');
      if (!whole(rv.everyDays, 7, 365)) throw bad('Ask the same client at most once every 7 to 365 days.');
      if (!/^https:\/\/\S+$/.test(rv.reviewUrl ?? '')) throw bad('Paste the review link from your Google Business Profile (it starts with https://).');
      if (rv.rewardServiceId && !(await store.get<Service>('services', rv.rewardServiceId))) throw bad('Pick the thank-you service again.');
      if (rv.rewardDays !== null && !whole(rv.rewardDays, 7, 730)) throw bad('Set how long the thank-you lasts (7 to 730 days), or no limit.');
    }
    const refund = b.policies?.depositRefundHours;
    if (refund !== undefined && !whole(refund, 0, 720)) throw bad('Set the deposit refund window in hours (0 to 720).');
    const next: Settings = {
      ...s,
      hours: b.hours ?? s.hours,
      policies: { ...s.policies, ...b.policies },
      notifications: n,
      automations: { ...s.automations, ...b.automations },
      referrals: { ...s.referrals, ...b.referrals },
      staffAlerts: { ...s.staffAlerts, ...b.staffAlerts },
      privacy: { ...s.privacy, ...b.privacy },
      reviews: rv ?? s.reviews,
    };
    return c.json(await store.put('settings', next));
  });

  // ── switching over from GlossGenius ──
  // Upload the export (check it first with dryRun). Only before the switch: after it,
  // GlossGenius takes no bookings, and an import could put two bookings in one time.
  r.post('/import/glossgenius', requireOwner, async (c) => {
    const b = await c.req.json<{ clients?: string; appointments?: string; dryRun?: boolean }>();
    if (switched(await getSettings(store))) throw new HttpError(409, 'You’ve already switched over from GlossGenius, so there’s nothing more to import.');
    if (!b.clients && !b.appointments) throw bad('Choose the clients file, the appointments file, or both.');
    const report = await importGlossGenius(store, { clients: b.clients, appointments: b.appointments }, { dryRun: b.dryRun });
    if (!b.dryRun) {
      const s = await getSettings(store);
      await store.put('settings', { ...s, glossGeniusImport: { ...s.glossGeniusImport, ...report, by: c.get('staff').short } });
    }
    return c.json({ report, dryRun: !!b.dryRun });
  });

  /**
   * What the switch still needs. Our system takes over everything at once, so
   * GlossGenius must have stopped taking bookings and its last bookings must be in.
   */
  const IMPORT_FRESH_HOURS = 24;
  async function switchBlockers() {
    const s = await getSettings(store);
    const last = s.glossGeniusImport;
    const out: string[] = [];
    if (!last?.clients) out.push('Import the GlossGenius clients.');
    if (!last?.appointments) out.push('Import the GlossGenius appointments.');
    else if (Date.now() - Date.parse(last.at) > IMPORT_FRESH_HOURS * 3600000) out.push(`Import the appointments again: the last import is more than ${IMPORT_FRESH_HOURS} hours old.`);
    // on AWS, real payments and texts; local demos run without them
    if (config.tableName && !stripeLive()) out.push('Add the Stripe keys.');
    if (config.tableName && !twilioLive()) out.push('Add the Twilio keys (texting).');
    return out;
  }
  r.get('/switchover', requireOwner, async (c) => c.json({ blockers: await switchBlockers(), freshHours: IMPORT_FRESH_HOURS }));

  r.post('/switchover', requireOwner, async (c) => {
    const b = await c.req.json<{ done: boolean; glossGeniusOff?: boolean; remindImported?: boolean; confirm?: boolean }>();
    const s = await getSettings(store);
    if (b.done) {
      const blockers = await switchBlockers();
      if (blockers.length) throw bad(blockers.join(' '));
      if (b.glossGeniusOff !== true) throw bad('Turn off online booking in GlossGenius first, import once more, then tick the box.');
    } else if (b.confirm !== true) throw bad('Tick the box to confirm going back to GlossGenius.');
    const next: Settings = { ...s, switchover: { done: !!b.done, at: nowIso(), by: c.get('staff').short, remindImported: !!b.done && !!b.remindImported } };
    return c.json(await store.put('settings', next));
  });

  r.post('/team', requireOwner, async (c) => {
    const b = await c.req.json<{ name: string; short?: string; email: string; phone?: string; alerts?: boolean; role?: 'owner' | 'employee'; color?: string; bookable?: boolean; password: string }>();
    const phone = b.phone ? toE164(b.phone) : undefined;
    if (b.phone && !phone) throw bad('Enter a 10-digit US mobile number.');
    if (!b.name || !b.email || !b.password || b.password.length < 8) throw bad('Name, email and a password of at least 8 characters are needed.');
    if ((await store.list<Staff>('staff')).some((s) => s.email.toLowerCase() === b.email.toLowerCase())) throw bad('Someone already uses that email.');
    const s: Staff = { id: rid(), name: b.name, short: b.short || b.name.split(' ')[0], email: b.email, role: b.role ?? 'employee', color: b.color ?? '#9C8A76', bookable: b.bookable ?? true, active: true, passwordHash: hashPassword(b.password), phone: phone ?? undefined, alerts: b.alerts ?? true };
    await store.put('staff', s);
    await refreshOnline();
    return c.json(publicStaff(s));
  });
  r.patch('/team/:id', async (c) => {
    const me = c.get('staff');
    const id = c.req.param('id');
    if (me.role !== 'owner' && me.id !== id) throw new HttpError(403, 'Only the owner can do that.');
    const s = await store.get<Staff>('staff', id);
    if (!s) throw new HttpError(404, 'Not found.');
    const b = await c.req.json<Partial<Staff> & { password?: string }>();
    // employees can set their own phone and availability; everything else is the owner's
    const allowed = me.role === 'owner' ? (['name', 'short', 'email', 'phone', 'color', 'bookable', 'active', 'schedule', 'role', 'alerts'] as const) : (['phone', 'schedule', 'alerts'] as const);
    const next = { ...s, ...pick(b, [...allowed]) } as Staff;
    if (b.phone !== undefined) {
      const p = b.phone ? toE164(b.phone) : null;
      if (b.phone && !p) throw bad('Enter a 10-digit US mobile number.');
      next.phone = p ?? undefined;
    }
    if (b.password) {
      if (b.password.length < 8) throw bad('Use at least 8 characters.');
      next.passwordHash = hashPassword(b.password);
    }
    await store.put('staff', next);
    if (next.bookable !== s.bookable || next.active !== s.active) await refreshOnline();
    return c.json(publicStaff(next));
  });

  /** A service can be booked online when it's offered and someone bookable performs it. */
  async function refreshOnline() {
    const staff = await store.list<Staff>('staff');
    const ok = new Set(staff.filter((x) => x.active && x.bookable).map((x) => x.id));
    for (const svc of await store.list<Service>('services')) {
      const online = svc.active && svc.staffIds.some((id) => ok.has(id));
      if (online !== svc.bookableOnline) await store.put('services', { ...svc, bookableOnline: online });
    }
  }

  // ── availability: time off (own, or anyone's for the owner) ──
  r.post('/team/:id/time-off', async (c) => {
    const me = c.get('staff');
    const id = c.req.param('id')!;
    if (me.role !== 'owner' && me.id !== id) throw new HttpError(403, 'You can only change your own availability.');
    const s = await store.get<Staff>('staff', id);
    if (!s) throw new HttpError(404, 'Not found.');
    const b = await c.req.json<{ from: string; to: string; note?: string }>();
    if (!b.from || !b.to || Date.parse(b.to) <= Date.parse(b.from)) throw bad('Pick when the time off starts and ends.');
    s.timeOff = [...(s.timeOff ?? []).filter((t) => Date.parse(t.to) > Date.now() - 7 * 86400000), { id: rid(), from: b.from, to: b.to, note: (b.note ?? '').slice(0, 80) }].sort((x, y) => x.from.localeCompare(y.from));
    await store.put('staff', s);
    // anything already booked in that window stays put; say how many so it can be moved
    const clash = (await appointmentsBetween(store, b.from, b.to)).filter((a) => a.staffId === id && ['booked', 'confirmed'].includes(a.status)).length;
    return c.json({ staff: publicStaff(s), clash });
  });
  r.delete('/team/:id/time-off/:offId', async (c) => {
    const me = c.get('staff');
    const id = c.req.param('id')!;
    if (me.role !== 'owner' && me.id !== id) throw new HttpError(403, 'You can only change your own availability.');
    const s = await store.get<Staff>('staff', id);
    if (!s) throw new HttpError(404, 'Not found.');
    s.timeOff = (s.timeOff ?? []).filter((t) => t.id !== c.req.param('offId'));
    await store.put('staff', s);
    return c.json(publicStaff(s));
  });

  return r;
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  const out: Partial<T> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}
