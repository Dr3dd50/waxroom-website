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
import { autoEmail } from './email';
import { alertStaff, sendOrQueue, type Actor } from './alerts';
import { calendarLink } from './calendar';
import { perkFor } from './reviews';
import { switched, withLock, withStaffLock } from './switchover';

export const manageLink = (a: Appointment) => `${config.siteUrl}/booking/?t=${a.manageToken}`;
/** Our booking page, opened on one service when there is one. */
export const bookingLink = (service?: Service) => `${config.siteUrl}/book/${service ? `?service=${encodeURIComponent(nice(service.name))}` : ''}`;
export const referralLink = (c: Client) => `${config.siteUrl}/r/?c=${c.referralCode}`;

/**
 * Send one of the automatic messages, if it's switched on: by text when the client
 * wants texts, and (the appointment ones) by email when emails are on.
 * `fromStudio`: set off by the team rather than the client, so the text waits out
 * quiet hours; an email doesn't buzz anyone's phone, so it goes now.
 * Returns the text, or the email when there's no text.
 */
export async function autoText(store: Store, key: string, client: Client, vars: Record<string, string>, kind = key as never, opts: { fromStudio?: boolean } = {}) {
  const settings = await getSettings(store);
  const auto = settings.automations[key];
  // nothing goes to clients from here until the switch from GlossGenius
  if (!switched(settings) || !auto?.enabled) return null;
  const body = fill(auto.text, { first: client.first, ...vars });
  const email = await autoEmail(store, settings, key, client, body, vars, kind);
  if (!client.smsReminders) return email;
  if (opts.fromStudio) return sendOrQueue(store, settings, client.phone, body, kind, client);
  return sendText(store, client.phone, body, kind, client);
}

/**
 * Change one appointment, one change at a time, working on its latest copy: the
 * client's link and the dashboard can act on the same booking at the same moment.
 * The lock follows the booking's manage link, which stays the same when it moves.
 */
export function onAppointment<T>(store: Store, appt: Appointment, fn: (current: Appointment) => Promise<T>): Promise<T> {
  return withLock(store, `appt|${appt.manageToken}`, async () => {
    const t = await store.get<{ id: string; appointmentId: string }>('tokens', appt.manageToken);
    const current = t && (await store.get<Appointment>('appointments', t.appointmentId));
    // moved (a move gives it a new id) or gone since it was looked up
    if (!current || current.id !== appt.id) throw new HttpError(409, 'This booking was just changed. Refresh to see the latest.');
    return fn(current);
  });
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
    calendar_link: calendarLink(a),
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
/**
 * One form for every time: ids start with it and are searched by it, so a time
 * written another way (an offset, no milliseconds) could be missed by the overlap check.
 */
export function utcIso(t: string) {
  const d = new Date(t);
  if (!t || isNaN(+d)) throw bad('Pick a time.');
  return d.toISOString();
}

export async function createAppointment(store: Store, n: NewAppointment) {
  n = { ...n, start: utcIso(n.start) };
  const settings = await getSettings(store);
  if (!n.service.staffIds.includes(n.staffId)) throw bad('That person doesn’t offer this service.');
  // the check and the write happen under one lock, so two bookings can't both pass the check
  return withStaffLock(store, n.staffId, n.start, async () => {
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
  });
}

/** The deposit a booking needs, if any. */
export function depositFor(service: Service, appt: Appointment) {
  return service.deposit && (!service.depositNewClientsOnly || appt.newClient) ? service.deposit : 0;
}

/** Record a deposit attempt on the appointment and in payments. */
async function recordDeposit(store: Store, appt: Appointment, client: Client, amount: number, status: 'paid' | 'failed', providerId: string, simulated: boolean, error?: string) {
  appt.deposit = { amount, status, paymentId: providerId };
  await store.put('payments', {
    id: `${nowIso()}_${rid(4)}`,
    at: nowIso(),
    clientId: client.id,
    appointmentId: appt.id,
    kind: 'deposit',
    amount,
    tip: 0,
    method: 'card',
    status,
    providerId,
    simulated,
    error,
  });
}

/** The booking is final: the client's confirmation text and the team's heads-up. */
export async function announceBooking(store: Store, appt: Appointment, client: Client, actor: Actor) {
  const msg = await autoText(store, 'booking', client, await apptVars(store, appt), 'booking' as never, { fromStudio: 'staff' in actor });
  if (msg) appt.texts.bookedAt = msg.at;
  await store.put('appointments', appt);
  await alertStaff(store, appt, { kind: 'booked' }, actor);
  return appt;
}

/** Take a booking back off the calendar (its deposit failed or was never approved). */
export async function releaseBooking(store: Store, appt: Appointment) {
  await store.delete('appointments', appt.id);
  await store.delete('tokens', appt.manageToken);
  const ref = (await store.list<Referral>('referrals')).find((r) => r.appointmentId === appt.id);
  if (ref) await store.delete('referrals', ref.id);
}

/**
 * Online booking: the deposit (when the service asks for one), then the texts.
 * A declined deposit gives the time back. When the bank wants the client to approve
 * it, the time is held and the page shows that step (then `completeDeposit`).
 */
export async function finalizeOnlineBooking(store: Store, appt: Appointment, client: Client) {
  const service = (await store.get<Service>('services', appt.serviceId))!;
  const deposit = depositFor(service, appt);
  if (deposit) {
    const r = await payments.charge(client.customerId ?? '', client.card, deposit, `Deposit: ${service.name}`, { appointmentId: appt.id, kind: 'deposit' }, true);
    if (r.needsAuth) {
      appt.deposit = { amount: deposit, status: 'pending', paymentId: r.id };
      await store.put('appointments', appt);
      return { appt, needsAuth: r.needsAuth };
    }
    if (!r.ok) {
      await recordDeposit(store, appt, client, deposit, 'failed', r.id, r.simulated, r.error);
      await releaseBooking(store, appt);
      throw new HttpError(402, `The ${money(deposit)} deposit didn’t go through: ${r.error ?? 'card declined'}. Try another card.`);
    }
    await recordDeposit(store, appt, client, deposit, 'paid', r.id, r.simulated);
  }
  return { appt: await announceBooking(store, appt, client, { client: true }) };
}

/** The client approved the deposit with their bank: check it with Stripe, then the booking is final. */
export function completeDeposit(store: Store, found: Appointment) {
  // the page and Stripe's webhook can both report the approval: one at a time, and re-read
  return withLock(store, `pay|${found.deposit?.paymentId ?? found.id}`, async () => {
    const appt = (await store.get<Appointment>('appointments', found.id)) ?? found;
    return finishDeposit(store, appt);
  });
}
async function finishDeposit(store: Store, appt: Appointment) {
  if (appt.deposit?.status === 'paid') return appt; // the other report got here first
  if (appt.deposit?.status !== 'pending' || !appt.deposit.paymentId) throw bad('There’s no deposit waiting on this booking.');
  if (appt.status === 'cancelled' || appt.status === 'no-show') throw new HttpError(409, 'This time was released. Please book again.');
  const client = (await store.get<Client>('clients', appt.clientId))!;
  const p = await payments.paymentStatus(appt.deposit.paymentId);
  const matches = p.amount === -1 || (p.amount === appt.deposit.amount && p.metadata.appointmentId === appt.id);
  if (!p.succeeded || !matches) throw new HttpError(402, 'The deposit wasn’t approved. Please try again or use another card.');
  await recordDeposit(store, appt, client, appt.deposit.amount, 'paid', appt.deposit.paymentId, !payments.live());
  return announceBooking(store, appt, client, { client: true });
}

/** Holds whose deposit was never approved: release them after 20 minutes. */
export async function releaseUnpaidHolds(store: Store, now = new Date()) {
  const cutoff = new Date(now.getTime() - 20 * 60000).toISOString();
  let released = 0;
  for (const a of await store.range<Appointment>('appointments', now.toISOString(), '9999')) {
    if (a.deposit?.status !== 'pending' || a.createdAt > cutoff) continue;
    await payments.cancelPayment(a.deposit.paymentId ?? '');
    if (a.status === 'booked' || a.status === 'confirmed') {
      await releaseBooking(store, a);
      released++;
    } else await store.put('appointments', { ...a, deposit: { ...a.deposit, status: 'failed' } });
  }
  return released;
}

/**
 * Booked at the desk. The client isn't there to approve anything, so a deposit that
 * doesn't go through is noted on the appointment and the booking stands.
 */
export async function finalizeStaffBooking(store: Store, appt: Appointment, client: Client, staff: Staff) {
  const service = (await store.get<Service>('services', appt.serviceId))!;
  const deposit = client.card ? depositFor(service, appt) : 0;
  if (deposit) {
    const r = await payments.charge(client.customerId ?? '', client.card, deposit, `Deposit: ${service.name}`, { appointmentId: appt.id, kind: 'deposit' });
    await recordDeposit(store, appt, client, deposit, r.ok ? 'paid' : 'failed', r.id, r.simulated, r.error);
  }
  return announceBooking(store, appt, client, { staff });
}

/** A new time (and maybe a new person): reminders start over, the client and team are told. */
export async function moveAppointment(store: Store, found: Appointment, dest: { start: string; staffId: string }, actor: Actor) {
  const to = { ...dest, start: utcIso(dest.start) };
  const byStaff = 'staff' in actor;
  const service = (await store.get<Service>('services', found.serviceId))!;
  const { appt, moved } = await onAppointment(store, found, async (appt) => {
    if (!['booked', 'confirmed', ...(byStaff ? ['checked-in'] : [])].includes(appt.status)) throw bad('This booking can’t be changed.');
    if (appt.deposit?.status === 'pending') throw bad('The client is still approving the deposit with their bank. Try again in a few minutes.');
    const moved = await withStaffLock(store, to.staffId, to.start, async () => {
      if (!(await isFree(store, to.staffId, to.start, service.duration, appt.id))) throw new HttpError(409, 'That time isn’t available. Please pick another.');
      // the id carries the start time, so a new time is a new record
      await store.delete('appointments', appt.id);
      const next: Appointment = {
        ...appt,
        id: `${to.start}_${rid(4)}`,
        staffId: to.staffId,
        start: to.start,
        end: new Date(Date.parse(to.start) + service.duration * 60000).toISOString(),
        // a client's own change asks them to confirm again; the desk's keeps what it was
        status: byStaff ? appt.status : 'booked',
        texts: {},
        movedAt: nowIso(),
        calendarSeq: (appt.calendarSeq ?? 0) + 1,
      };
      await store.put('appointments', next);
      await store.put('tokens', { id: next.manageToken, appointmentId: next.id });
      // a referral follows its appointment, so the referrer is still credited at checkout
      const ref = (await store.list<Referral>('referrals')).find((r) => r.appointmentId === appt.id);
      if (ref) await store.put('referrals', { ...ref, appointmentId: next.id });
      return next;
    });
    return { appt, moved };
  });
  const client = (await store.get<Client>('clients', moved.clientId))!;
  if (moved.start !== appt.start || moved.staffId !== appt.staffId) {
    const m = await autoText(store, 'moved', client, await apptVars(store, moved), 'moved' as never, { fromStudio: byStaff });
    if (m) moved.texts.bookedAt = m.at;
    await store.put('appointments', moved);
    await alertStaff(store, moved, { kind: 'moved', from: { start: appt.start, staffId: appt.staffId } }, actor);
  }
  return moved;
}

export function feeFor(appt: Appointment, settings: Settings, noShow: boolean, now = Date.now()) {
  if (noShow) return Math.round((appt.price * settings.policies.noShowFeePercent) / 100);
  const hoursAway = (Date.parse(appt.start) - now) / 3600000;
  return hoursAway < settings.policies.cancellationWindowHours ? Math.round((appt.price * settings.policies.cancellationFeePercent) / 100) : 0;
}

/** How many hours ahead a client must cancel to get a paid deposit back. */
export const refundHours = (s: Settings) => s.policies.depositRefundHours ?? s.policies.cancellationWindowHours;

/**
 * What cancelling now means in money, the same for what the client and the team are
 * shown and what is charged. A paid deposit goes toward a late or no-show fee (only
 * the rest is charged, and any deposit beyond the fee goes back); with no fee it is
 * refunded when the client cancels at least the refund window ahead, and kept inside
 * it. Waiving means no charge at all: the deposit goes back too.
 */
export function cancelOutcome(appt: Appointment, settings: Settings, opts: { noShow?: boolean; waive?: boolean } = {}, now = Date.now()) {
  const policyFee = feeFor(appt, settings, !!opts.noShow, now);
  const deposit = appt.deposit?.status === 'paid' ? appt.deposit.amount : 0;
  if (opts.waive) return { policyFee, fee: 0, depositKept: 0, depositRefund: deposit, deposit };
  if (policyFee) {
    const depositKept = Math.min(deposit, policyFee);
    return { policyFee, fee: policyFee - depositKept, depositKept, depositRefund: deposit - depositKept, deposit };
  }
  const inTime = (Date.parse(appt.start) - now) / 3600000 >= refundHours(settings);
  return { policyFee: 0, fee: 0, depositKept: inTime ? 0 : deposit, depositRefund: inTime ? deposit : 0, deposit };
}

/** Cancel (or mark a no-show). Policy fees go on the card on file unless staff waive them. */
export async function cancelAppointment(store: Store, found: Appointment, opts: { by: 'client' | 'staff'; noShow?: boolean; waive?: boolean; staff?: Staff }) {
  const settings = await getSettings(store);
  // the status changes first, under the booking's lock: a second cancel, a move or a
  // checkout at the same moment finds it already closed. Money moves after.
  const { appt, outcome } = await onAppointment(store, found, async (appt) => {
    if (['cancelled', 'no-show', 'completed'].includes(appt.status)) throw bad('This appointment can’t be cancelled now.');
    // a deposit still waiting on the bank's approval is called off, so it can't go through later
    if (appt.deposit?.status === 'pending') {
      await payments.cancelPayment(appt.deposit.paymentId ?? '');
      appt.deposit = { ...appt.deposit, status: 'failed' };
    }
    const outcome = cancelOutcome(appt, settings, opts);
    appt.status = opts.noShow ? 'no-show' : 'cancelled';
    appt.cancel = {
      at: nowIso(),
      by: opts.by,
      fee: outcome.fee,
      feeStatus: opts.waive && outcome.policyFee ? 'waived' : 'none',
      noShow: !!opts.noShow,
      depositKept: outcome.depositKept,
      depositRefund: outcome.depositRefund,
    };
    appt.calendarSeq = (appt.calendarSeq ?? 0) + 1;
    await store.put('appointments', appt);
    return { appt, outcome };
  });

  const client = (await store.get<Client>('clients', appt.clientId))!;
  if (outcome.fee) {
    const r = await payments.charge(client.customerId ?? '', client.card, outcome.fee, opts.noShow ? 'No-show fee' : 'Late cancellation fee', { appointmentId: appt.id });
    appt.cancel!.feeStatus = r.ok ? 'charged' : 'failed';
    await store.put('payments', {
      id: `${nowIso()}_${rid(4)}`,
      at: nowIso(),
      clientId: client.id,
      appointmentId: appt.id,
      kind: opts.noShow ? 'no-show-fee' : 'cancel-fee',
      amount: outcome.fee,
      tip: 0,
      method: 'card',
      status: r.ok ? 'paid' : 'failed',
      providerId: r.id,
      simulated: r.simulated,
      error: r.error,
    });
  }
  const depositPayment = appt.deposit?.paymentId;
  if (outcome.depositRefund && appt.deposit && depositPayment) {
    await payments.refund(depositPayment, outcome.depositRefund);
    appt.deposit = { ...appt.deposit, status: outcome.depositKept ? 'applied' : 'refunded' };
    await store.put('payments', {
      id: `${nowIso()}_${rid(4)}`,
      at: nowIso(),
      clientId: client.id,
      appointmentId: appt.id,
      kind: 'refund',
      amount: -outcome.depositRefund,
      tip: 0,
      method: 'card',
      status: 'paid',
      providerId: depositPayment,
      simulated: !payments.live() || depositPayment.startsWith('pi_sim_'),
    });
  } else if (outcome.depositKept && appt.deposit) appt.deposit = { ...appt.deposit, status: 'applied' };
  await store.put('appointments', appt);

  const ref = (await store.list<Referral>('referrals')).find((r) => r.appointmentId === appt.id && r.status === 'booked');
  if (ref) await store.put('referrals', { ...ref, status: 'cancelled' });
  if (!opts.noShow) {
    const feeNote =
      (appt.cancel!.feeStatus === 'charged' ? ` A ${money(outcome.fee)} late-cancellation fee was charged per our policy.` : '') +
      (outcome.depositRefund ? ` Your ${money(outcome.depositRefund)} deposit is being refunded to your card.` : outcome.depositKept && !outcome.policyFee ? ` Your ${money(outcome.depositKept)} deposit isn’t refundable this close to the appointment.` : '');
    await autoText(store, 'cancel', client, { ...(await apptVars(store, appt, settings)), fee_note: feeNote }, 'cancel' as never, { fromStudio: opts.by === 'staff' });
    await alertStaff(store, appt, { kind: 'cancelled', fee: appt.cancel!.feeStatus === 'waived' ? 0 : outcome.fee, feeCharged: appt.cancel!.feeStatus === 'charged' }, opts.staff ? { staff: opts.staff } : { client: true });
  }
  return appt;
}

/** Which of the client's unexpired packages still has a visit of this service. */
export function packageWithVisit(client: Client, serviceId: string) {
  const now = nowIso();
  return (client.packages ?? []).findIndex((p) => (p.remaining[serviceId] ?? 0) > 0 && (!p.expiresAt || p.expiresAt > now));
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
  // a thank-you visit (for rating an earlier one), when the membership doesn't cover it
  const perk = membershipUsed ? undefined : perkFor(client, service.id);
  if (perk) {
    lines.push({ label: `Thank-you: ${perk.label.replace(/^Free /, 'free ')}`, amount: -due });
    due = 0;
  }
  // a prepaid package visit, when neither covers it
  const pkgIndex = membershipUsed || perk || !input.useMembership ? -1 : packageWithVisit(client, service.id);
  if (pkgIndex !== -1) {
    lines.push({ label: 'Package visit', amount: -due });
    due = 0;
  }
  const referralDiscount = !membershipUsed && pkgIndex === -1 && appt.referral ? Math.min(due, appt.referral.friendDiscount) : 0;
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
  return { lines, due, membershipUsed, membershipLeft, pkgIndex, perk, referralDiscount, creditUsed, deposit, client, service };
}

export function checkoutAppointment(store: Store, found: Appointment, input: CheckoutInput) {
  // one checkout at a time, and not on a booking cancelled or moved a moment ago
  return onAppointment(store, found, (appt) => checkoutNow(store, appt, input));
}

async function checkoutNow(store: Store, appt: Appointment, input: CheckoutInput) {
  if (appt.status === 'completed') throw bad('Already checked out.');
  if (['cancelled', 'no-show'].includes(appt.status)) throw bad('This appointment was cancelled.');
  if (appt.deposit?.status === 'pending') throw bad('The client is still approving the deposit with their bank. Try again in a few minutes.');
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
  if (q.perk) {
    const used = q.perk;
    q.client.perks = (q.client.perks ?? []).map((p) => (p.id === used.id ? { ...p, usedAt: nowIso(), appointmentId: appt.id } : p));
  }
  if (q.pkgIndex !== -1) {
    const pk = q.client.packages![q.pkgIndex];
    pk.remaining[q.service.id] -= 1;
    appt.checkout.packageUsed = pk.packageId;
    await store.put('appointments', appt);
  }
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
      await autoText(store, 'referral', referrer, { friend: q.client.first, amount: money(settings.referrals.referrerGets) }, 'referral' as never, { fromStudio: true });
    }
  }
  await autoText(
    store,
    'receipt',
    q.client,
    { total: money(total), referral_link: referralLink(q.client), referral_amount: money(settings.referrals.friendGets) },
    'receipt' as never,
    { fromStudio: true },
  );
  return appt;
}
