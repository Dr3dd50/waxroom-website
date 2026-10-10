// Booking, changes, cancellations and checkout, with the texts and payments
// each step triggers.
import { config } from '../config';
import type { Store } from '../store/store';
import type { Appointment, Checkout, Client, Membership, Referral, Service, Settings, Staff } from '../types';
import { fmtDate, fmtDay, fmtTime } from '../lib/time';
import { HttpError, bad, money, nice, nowIso, rid } from '../lib/util';
import { getSettings, isFree } from './availability';
import { futureAppointments, hasVisited } from './clients';
import { payments } from './payments';
import { fill, sendText } from './sms';

export const manageLink = (a: Appointment) => `${config.siteUrl}/booking/?t=${a.manageToken}`;
export const bookingLink = () => `${config.siteUrl}/book/`;
export const referralLink = (c: Client) => `${config.siteUrl}/r/${c.referralCode}`;

/** Text one of the automatic messages, if it's switched on and the client wants texts. */
export async function autoText(store: Store, key: string, client: Client, vars: Record<string, string>, kind = key as never) {
  const settings = await getSettings(store);
  const auto = settings.automations[key];
  if (!auto?.enabled || !client.smsReminders) return null;
  return sendText(store, client.phone, fill(auto.text, { first: client.first, ...vars }), kind, client);
}

export async function apptVars(store: Store, a: Appointment, settings?: Settings) {
  const s = settings ?? (await getSettings(store));
  const service = (await store.get<Service>('services', a.serviceId))!;
  const staff = (await store.get<Staff>('staff', a.staffId))!;
  return {
    service: nice(service.name),
    staff: staff.short,
    date: fmtDate(a.start, s.timezone),
    day: fmtDay(a.start, s.timezone),
    time: fmtTime(a.start, s.timezone),
    manage_link: manageLink(a),
    booking_link: bookingLink(),
    prep_tip: service.prepTip ?? '',
    window: String(s.policies.cancellationWindowHours),
    fee: String(s.policies.cancellationFeePercent),
  };
}

type NewAppointment = {
  client: Client;
  isNewClient: boolean;
  service: Service;
  staffId: string;
  start: string;
  source: Appointment['source'];
  notes?: string;
  referralCode?: string;
  price?: number;
};

/** Create the appointment (the time is checked once more right here). */
export async function createAppointment(store: Store, n: NewAppointment) {
  const settings = await getSettings(store);
  if (!n.service.staffIds.includes(n.staffId)) throw bad('That person doesn’t offer this service.');
  if (!(await isFree(store, n.staffId, n.start, n.service.duration))) throw new HttpError(409, 'That time was just taken. Please pick another.');
  if (n.source === 'online' && settings.policies.futureBookingsLimit) {
    const upcoming = await futureAppointments(store, n.client.id);
    if (upcoming.length >= settings.policies.futureBookingsLimit)
      throw bad(`You already have ${upcoming.length} upcoming appointments. Call or text us to book more.`);
  }
  const newClient = n.isNewClient || !(await hasVisited(store, n.client.id));
  const end = new Date(Date.parse(n.start) + n.service.duration * 60000).toISOString();
  const appt: Appointment = {
    id: `${n.start}_${rid(4)}`,
    clientId: n.client.id,
    staffId: n.staffId,
    serviceId: n.service.id,
    start: n.start,
    end,
    status: 'booked',
    price: n.price ?? n.service.price,
    source: n.source,
    notes: n.notes ?? '',
    manageToken: rid(12),
    createdAt: nowIso(),
    newClient,
    texts: {},
  };

  // A friend booking through a referral link: first visit only, and not their own link.
  if (n.referralCode && settings.referrals.enabled && newClient) {
    const referrer = (await store.list<Client>('clients')).find((c) => c.referralCode.toUpperCase() === n.referralCode!.toUpperCase());
    if (referrer && referrer.id !== n.client.id) {
      appt.referral = { referrerId: referrer.id, code: referrer.referralCode, friendDiscount: settings.referrals.friendGets };
      n.client.referredBy ??= referrer.id;
      await store.put('clients', n.client);
      const ref: Referral = { id: rid(), referrerId: referrer.id, friendId: n.client.id, code: referrer.referralCode, status: 'booked', createdAt: nowIso(), appointmentId: appt.id };
      await store.put('referrals', ref);
    }
  }
  await store.put('appointments', appt);
  await store.put('tokens', { id: appt.manageToken, appointmentId: appt.id });
  return appt;
}

/** Deposit (when the service asks for one), then the booking confirmation text. */
export async function finalizeBooking(store: Store, appt: Appointment, client: Client) {
  const service = (await store.get<Service>('services', appt.serviceId))!;
  const deposit = service.deposit && (!service.depositNewClientsOnly || appt.newClient) ? service.deposit : 0;
  if (deposit) {
    const r = await payments.charge(client.customerId ?? '', client.card, deposit, `Deposit: ${service.name}`, { appointmentId: appt.id });
    appt.deposit = { amount: deposit, status: r.ok ? 'paid' : 'failed', paymentId: r.id };
    await store.put('payments', {
      id: `${nowIso()}_${rid(4)}`,
      at: nowIso(),
      clientId: client.id,
      appointmentId: appt.id,
      kind: 'deposit',
      amount: deposit,
      tip: 0,
      method: 'card',
      status: r.ok ? 'paid' : 'failed',
      providerId: r.id,
      simulated: r.simulated,
      error: r.error,
    });
    if (!r.ok) throw new HttpError(402, `The ${money(deposit)} deposit didn’t go through: ${r.error ?? 'card declined'}. Try another card.`);
  }
  const msg = await autoText(store, 'booking', client, await apptVars(store, appt), 'booking' as never);
  if (msg) appt.texts.bookedAt = msg.at;
  await store.put('appointments', appt);
  return appt;
}

export function feeFor(appt: Appointment, settings: Settings, noShow: boolean) {
  if (noShow) return Math.round((appt.price * settings.policies.noShowFeePercent) / 100);
  const hoursAway = (Date.parse(appt.start) - Date.now()) / 3600000;
  return hoursAway < settings.policies.cancellationWindowHours ? Math.round((appt.price * settings.policies.cancellationFeePercent) / 100) : 0;
}

/** Cancel (or mark a no-show). Policy fees go on the card on file unless staff waive them. */
export async function cancelAppointment(store: Store, appt: Appointment, opts: { by: 'client' | 'staff'; noShow?: boolean; waive?: boolean }) {
  if (['cancelled', 'no-show', 'completed'].includes(appt.status)) throw bad('This appointment can’t be cancelled now.');
  const settings = await getSettings(store);
  const client = (await store.get<Client>('clients', appt.clientId))!;
  let fee = feeFor(appt, settings, !!opts.noShow);
  // a paid deposit counts toward the fee
  const depositPaid = appt.deposit?.status === 'paid' ? appt.deposit.amount : 0;
  fee = Math.max(0, fee - depositPaid);
  let feeStatus: NonNullable<Appointment['cancel']>['feeStatus'] = 'none';
  if (fee && opts.waive) feeStatus = 'waived';
  else if (fee) {
    const r = await payments.charge(client.customerId ?? '', client.card, fee, opts.noShow ? 'No-show fee' : 'Late cancellation fee', { appointmentId: appt.id });
    feeStatus = r.ok ? 'charged' : 'failed';
    await store.put('payments', {
      id: `${nowIso()}_${rid(4)}`,
      at: nowIso(),
      clientId: client.id,
      appointmentId: appt.id,
      kind: opts.noShow ? 'no-show-fee' : 'cancel-fee',
      amount: fee,
      tip: 0,
      method: 'card',
      status: r.ok ? 'paid' : 'failed',
      providerId: r.id,
      simulated: r.simulated,
      error: r.error,
    });
  }
  appt.status = opts.noShow ? 'no-show' : 'cancelled';
  appt.cancel = { at: nowIso(), by: opts.by, fee: opts.waive ? 0 : fee, feeStatus, noShow: !!opts.noShow };
  await store.put('appointments', appt);
  const ref = (await store.list<Referral>('referrals')).find((r) => r.appointmentId === appt.id && r.status === 'booked');
  if (ref) await store.put('referrals', { ...ref, status: 'cancelled' });
  if (!opts.noShow) {
    const feeNote = feeStatus === 'charged' ? ` A ${money(fee)} late-cancellation fee was charged per our policy.` : '';
    await autoText(store, 'cancel', client, { ...(await apptVars(store, appt, settings)), fee_note: feeNote }, 'cancel' as never);
  }
  return appt;
}

/** Visits a membership still covers this month for a service. */
export async function membershipVisitsLeft(store: Store, client: Client, serviceId: string) {
  if (client.membership?.status !== 'active') return 0;
  const m = await store.get<Membership>('memberships', client.membership.membershipId);
  const inc = m?.includes.find((i) => i.serviceId === serviceId);
  if (!inc) return 0;
  const since = client.membership.periodStart;
  const used = (await store.range<Appointment>('appointments', since, '9999')).filter(
    (a) => a.clientId === client.id && a.serviceId === serviceId && a.checkout?.membershipUsed,
  ).length;
  return Math.max(0, inc.quantity - used);
}

export type CheckoutInput = { tip: number; method: Checkout['method']; useCredit: boolean; useMembership: boolean; price?: number; staffId: string };

/** What the client owes, line by line, before tip. */
export async function quote(store: Store, appt: Appointment, input: Omit<CheckoutInput, 'tip' | 'method' | 'staffId'>) {
  const client = (await store.get<Client>('clients', appt.clientId))!;
  const service = (await store.get<Service>('services', appt.serviceId))!;
  const price = input.price ?? appt.price;
  const lines: Checkout['lines'] = [{ label: nice(service.name), amount: price }];
  let due = price;
  const membershipLeft = await membershipVisitsLeft(store, client, service.id);
  const membershipUsed = input.useMembership && membershipLeft > 0;
  if (membershipUsed) {
    const m = await store.get<Membership>('memberships', client.membership!.membershipId);
    lines.push({ label: m?.name ?? 'Membership', amount: -due });
    due = 0;
  }
  const referralDiscount = !membershipUsed && appt.referral ? Math.min(due, appt.referral.friendDiscount) : 0;
  if (referralDiscount) {
    lines.push({ label: 'Referral: first-visit discount', amount: -referralDiscount });
    due -= referralDiscount;
  }
  const deposit = appt.deposit?.status === 'paid' ? Math.min(due, appt.deposit.amount) : 0;
  if (deposit) {
    lines.push({ label: 'Deposit paid at booking', amount: -deposit });
    due -= deposit;
  }
  const creditUsed = input.useCredit ? Math.min(due, client.credit) : 0;
  if (creditUsed) {
    lines.push({ label: 'Account credit', amount: -creditUsed });
    due -= creditUsed;
  }
  return { lines, due, membershipUsed, membershipLeft, referralDiscount, creditUsed, deposit, client, service };
}

export async function checkoutAppointment(store: Store, appt: Appointment, input: CheckoutInput) {
  if (appt.status === 'completed') throw bad('Already checked out.');
  if (['cancelled', 'no-show'].includes(appt.status)) throw bad('This appointment was cancelled.');
  const settings = await getSettings(store);
  const q = await quote(store, appt, input);
  const tip = Math.max(0, Math.round(input.tip));
  const total = q.due + tip;
  let paymentId: string | undefined;
  const status: Checkout['status'] = 'paid';
  let simulated = !payments.live();
  if (input.method === 'card' && total > 0) {
    const r = await payments.charge(q.client.customerId ?? '', q.client.card, total, `${q.service.name} + tip`, { appointmentId: appt.id });
    paymentId = r.id;
    simulated = r.simulated;
    if (!r.ok) throw new HttpError(402, `The card was declined (${r.error ?? 'unknown reason'}). Try another method.`);
  }
  if (input.price !== undefined) appt.price = input.price;
  appt.checkout = {
    at: nowIso(),
    by: input.staffId,
    lines: q.lines,
    subtotal: q.due,
    tip,
    total,
    method: total > 0 ? input.method : 'none',
    paymentId,
    status,
    creditUsed: q.creditUsed,
    membershipUsed: q.membershipUsed,
    referralDiscount: q.referralDiscount,
  };
  appt.status = 'completed';
  if (appt.deposit?.status === 'paid') appt.deposit.status = 'applied';
  await store.put('appointments', appt);
  q.client.credit -= q.creditUsed;
  q.client.lastVisitAt = appt.end;
  await store.put('clients', q.client);
  if (total > 0)
    await store.put('payments', {
      id: `${nowIso()}_${rid(4)}`,
      at: nowIso(),
      clientId: q.client.id,
      appointmentId: appt.id,
      kind: 'checkout',
      amount: q.due,
      tip,
      method: input.method === 'none' ? 'other' : input.method,
      status: 'paid',
      providerId: paymentId,
      simulated,
      staffId: appt.staffId,
    });

  // First visit through a referral link: the referrer earns their credit now.
  if (appt.referral) {
    const ref = (await store.list<Referral>('referrals')).find((r) => r.appointmentId === appt.id && r.status === 'booked');
    const referrer = await store.get<Client>('clients', appt.referral.referrerId);
    if (ref && referrer) {
      referrer.credit += settings.referrals.referrerGets;
      await store.put('clients', referrer);
      await store.put('referrals', { ...ref, status: 'completed', completedAt: nowIso() });
      await autoText(store, 'referral', referrer, { friend: q.client.first, amount: money(settings.referrals.referrerGets) }, 'referral' as never);
    }
  }
  await autoText(
    store,
    'receipt',
    q.client,
    { total: money(total), referral_link: referralLink(q.client), referral_amount: money(settings.referrals.friendGets) },
    'receipt' as never,
  );
  return appt;
}
