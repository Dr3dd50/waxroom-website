// What the staff dashboard calls. Everything needs a signed-in staff member;
// employees only see their own calendar and the clients they've seen.
import { Hono } from 'hono';
import { checkPassword, endSession, requireOwner, requireStaff, startSession, type Env } from '../auth';
import type { Store } from '../store/store';
import type { Appointment, Client, Membership, Message, Package, Payment, Referral, Service, Settings, Staff } from '../types';
import { addDays, zoned, zonedToUtc } from '../lib/time';
import { HttpError, bad, nowIso, rid, toE164 } from '../lib/util';
import { appointmentsBetween, getSettings, isFree, slotsFor } from '../services/availability';
import { apptVars, autoText, cancelAppointment, checkoutAppointment, createAppointment, finalizeBooking, membershipVisitsLeft, quote } from '../services/appointments';
import { upsertClient, uniqueReferralCode } from '../services/clients';
import { payments } from '../services/payments';
import { sendText } from '../services/sms';
import { runDueTexts } from '../services/notify';
import { hashPassword } from '../seed';
import { twilioLive } from '../config';

const publicStaff = (s: Staff) => ({ id: s.id, name: s.name, short: s.short, email: s.email, phone: s.phone, role: s.role, color: s.color, active: s.active, bookable: s.bookable, schedule: s.schedule });

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

  r.get('/me', (c) => c.json(publicStaff(c.get('staff'))));

  r.get('/bootstrap', async (c) => {
    const settings = await getSettings(store);
    return c.json({
      me: publicStaff(c.get('staff')),
      staff: (await store.list<Staff>('staff')).map(publicStaff),
      services: await store.list<Service>('services'),
      memberships: await store.list<Membership>('memberships'),
      packages: await store.list<Package>('packages'),
      settings: isOwner(c) ? settings : { ...settings, automations: {} },
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
    const clients = (await store.list<Client>('clients')).filter((x) => ids.has(x.id)).map(clientSummary);
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
    const service = await store.get<Service>('services', b.serviceId);
    if (!service) throw bad('Pick a service.');
    let client: Client | undefined;
    let isNew = false;
    if (b.clientId) client = await store.get<Client>('clients', b.clientId);
    else if (b.client) ({ client, isNew } = await upsertClient(store, { ...b.client, smsReminders: true }));
    if (!client) throw bad('Pick or add a client.');
    const appt = await createAppointment(store, { client, isNewClient: isNew, service, staffId: b.staffId, start: b.start, source: 'staff', notes: b.notes, price: b.price });
    // booked at the desk: deposit only if there's a card to take it from
    if (!client.card) {
      const m = await autoText(store, 'booking', client, await apptVars(store, appt), 'booking' as never);
      if (m) appt.texts.bookedAt = m.at;
      await store.put('appointments', appt);
      return c.json(appt);
    }
    return c.json(await finalizeBooking(store, appt, client));
  });

  r.patch('/appointments/:id', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ status?: 'confirmed' | 'checked-in' | 'booked'; notes?: string }>();
    if (b.status) {
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
    const service = (await store.get<Service>('services', a.serviceId))!;
    if (!(await isFree(store, staffId, b.start, service.duration, a.id))) throw new HttpError(409, 'That time overlaps another appointment.');
    await store.delete('appointments', a.id);
    const moved: Appointment = { ...a, id: `${b.start}_${rid(4)}`, staffId, start: b.start, end: new Date(Date.parse(b.start) + service.duration * 60000).toISOString(), texts: { bookedAt: a.texts.bookedAt } };
    await store.put('appointments', moved);
    await store.put('tokens', { id: moved.manageToken, appointmentId: moved.id });
    return c.json(moved);
  });

  r.post('/appointments/:id/cancel', async (c) => {
    const a = await apptOr404(c, c.req.param('id')!);
    const b = await c.req.json<{ noShow?: boolean; waive?: boolean }>();
    return c.json(await cancelAppointment(store, a, { by: 'staff', noShow: b.noShow, waive: b.waive }));
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
    return c.json(await checkoutAppointment(store, a, { ...b, staffId: c.get('staff').id }));
  });

  // ── clients ──
  const clientSummary = (x: Client) => ({
    id: x.id,
    first: x.first,
    last: x.last,
    phone: x.phone,
    email: x.email,
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
  });

  r.get('/clients', async (c) => {
    let list = await store.list<Client>('clients');
    if (!isOwner(c)) {
      const mine = await ownClientIds(c.get('staff').id);
      list = list.filter((x) => mine.has(x.id));
    }
    return c.json(list.map(clientSummary).sort((a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`)));
  });

  r.get('/clients/:id', async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    if (!x) throw new HttpError(404, 'Client not found.');
    if (!isOwner(c) && !(await ownClientIds(c.get('staff').id)).has(x.id)) throw new HttpError(404, 'Client not found.');
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
      client: clientSummary(x),
      appointments: appts,
      referrals: referrals.map((rf) => ({ ...rf, referrerName: names.get(rf.referrerId), friendName: names.get(rf.friendId) })),
      membershipLeft,
      spent: isOwner(c) ? spent : null,
    });
  });

  r.post('/clients', async (c) => {
    const b = await c.req.json<{ first: string; last: string; phone: string; email?: string; smsMarketing?: boolean; birthday?: string }>();
    const { client, isNew } = await upsertClient(store, { ...b, smsReminders: true });
    if (!isNew) throw bad(`${client.first} ${client.last} already has that phone number.`);
    return c.json(clientSummary(client));
  });

  r.patch('/clients/:id', async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    if (!x) throw new HttpError(404, 'Client not found.');
    const b = await c.req.json<Partial<{ first: string; last: string; phone: string; email: string; notes: string; birthday: string; smsReminders: boolean; smsMarketing: boolean }>>();
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
    return c.json(clientSummary(x));
  });

  // Add a card at the desk (card reader or typed in): same SetupIntent flow as online.
  r.post('/clients/:id/card/start', async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    if (!x) throw new HttpError(404, 'Client not found.');
    x.customerId = await payments.ensureCustomer(x);
    await store.put('clients', x);
    return c.json(await payments.startCardSetup(x.customerId));
  });
  r.post('/clients/:id/card/confirm', async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    if (!x) throw new HttpError(404, 'Client not found.');
    const b = await c.req.json<{ setupId: string; simulatedCard?: { number: string } }>();
    x.card = await payments.finishCardSetup(b.setupId, b.simulatedCard);
    await store.put('clients', x);
    return c.json(clientSummary(x));
  });

  r.post('/clients/:id/membership', requireOwner, async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    const { membershipId } = await c.req.json<{ membershipId: string | null }>();
    if (!x) throw new HttpError(404, 'Client not found.');
    if (!membershipId) {
      if (x.membership?.subscriptionId) await payments.cancelSubscription(x.membership.subscriptionId);
      if (x.membership) x.membership.status = 'cancelled';
      await store.put('clients', x);
      return c.json(clientSummary(x));
    }
    const m = await store.get<Membership>('memberships', membershipId);
    if (!m) throw bad('Pick a membership.');
    if (!x.card) throw bad('Add a card on file first.');
    x.customerId ??= await payments.ensureCustomer(x);
    const sub = await payments.subscribe(x.customerId, x.card, m);
    if (sub.priceId && !m.stripePriceId) await store.put('memberships', { ...m, stripePriceId: sub.priceId });
    x.membership = { membershipId: m.id, since: nowIso(), status: 'active', subscriptionId: sub.id, periodStart: nowIso() };
    await store.put('clients', x);
    await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: x.id, kind: 'membership', amount: m.price, tip: 0, method: 'card', status: 'paid', providerId: sub.id, simulated: !payments.live() });
    return c.json(clientSummary(x));
  });

  r.post('/clients/:id/text', async (c) => {
    const x = await store.get<Client>('clients', c.req.param('id')!);
    const { body } = await c.req.json<{ body: string }>();
    if (!x) throw new HttpError(404, 'Client not found.');
    if (!body?.trim()) throw bad('Write a message.');
    if (!x.smsReminders) throw bad(`${x.first} has opted out of texts.`);
    return c.json(await sendText(store, x.phone, body.trim(), 'staff', x));
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
    if (!b.body?.trim()) throw bad('Write a message.');
    const list = await audience(b.audience);
    // marketing texts always carry the opt-out line
    const text = `${b.body.trim()}\nReply STOP to opt out`;
    let sent = 0;
    for (const x of list) {
      const m = await sendText(store, x.phone, text.replace('{first}', x.first), 'campaign', x);
      if (m.status !== 'failed') sent++;
    }
    return c.json({ sent, of: list.length, simulated: !twilioLive() });
  });

  r.post('/run-texts', requireOwner, async (c) => c.json(await runDueTexts(store)));

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
  r.put('/services/:id', requireOwner, async (c) => {
    const s = await store.get<Service>('services', c.req.param('id')!);
    if (!s) throw new HttpError(404, 'Service not found.');
    const b = await c.req.json<Partial<Service>>();
    const next: Service = { ...s, ...pick(b, ['name', 'category', 'price', 'priceVaries', 'duration', 'deposit', 'depositNewClientsOnly', 'description', 'staffIds', 'active', 'prepTip', 'order']) };
    const staff = await store.list<Staff>('staff');
    next.bookableOnline = next.active && next.staffIds.some((id) => staff.find((x) => x.id === id)?.bookable);
    return c.json(await store.put('services', next));
  });
  r.post('/services', requireOwner, async (c) => {
    const b = await c.req.json<Partial<Service>>();
    if (!b.name || !b.category || b.price == null || !b.duration) throw bad('A service needs a name, category, price and length.');
    const s: Service = { id: rid(), name: b.name, category: b.category, order: b.order ?? 99, price: b.price, priceVaries: !!b.priceVaries, duration: b.duration, deposit: b.deposit ?? null, depositNewClientsOnly: !!b.depositNewClientsOnly, description: b.description ?? null, staffIds: b.staffIds ?? [], active: true, bookableOnline: false };
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
    const next: Settings = {
      ...s,
      hours: b.hours ?? s.hours,
      policies: { ...s.policies, ...b.policies },
      notifications: { ...s.notifications, ...b.notifications },
      automations: { ...s.automations, ...b.automations },
      referrals: { ...s.referrals, ...b.referrals },
    };
    return c.json(await store.put('settings', next));
  });

  r.post('/team', requireOwner, async (c) => {
    const b = await c.req.json<{ name: string; short?: string; email: string; role?: 'owner' | 'employee'; color?: string; bookable?: boolean; password: string }>();
    if (!b.name || !b.email || !b.password || b.password.length < 8) throw bad('Name, email and a password of at least 8 characters are needed.');
    if ((await store.list<Staff>('staff')).some((s) => s.email.toLowerCase() === b.email.toLowerCase())) throw bad('Someone already uses that email.');
    const s: Staff = { id: rid(), name: b.name, short: b.short || b.name.split(' ')[0], email: b.email, role: b.role ?? 'employee', color: b.color ?? '#9C8A76', bookable: b.bookable ?? true, active: true, passwordHash: hashPassword(b.password) };
    await store.put('staff', s);
    return c.json(publicStaff(s));
  });
  r.patch('/team/:id', async (c) => {
    const me = c.get('staff');
    const id = c.req.param('id');
    if (me.role !== 'owner' && me.id !== id) throw new HttpError(403, 'Only the owner can do that.');
    const s = await store.get<Staff>('staff', id);
    if (!s) throw new HttpError(404, 'Not found.');
    const b = await c.req.json<Partial<Staff> & { password?: string }>();
    const allowed = me.role === 'owner' ? (['name', 'short', 'email', 'phone', 'color', 'bookable', 'active', 'schedule', 'role'] as const) : (['phone'] as const);
    const next = { ...s, ...pick(b, [...allowed]) } as Staff;
    if (b.password) {
      if (b.password.length < 8) throw bad('Use at least 8 characters.');
      next.passwordHash = hashPassword(b.password);
    }
    await store.put('staff', next);
    return c.json(publicStaff(next));
  });

  return r;
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  const out: Partial<T> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}
