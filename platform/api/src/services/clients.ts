import texting from '../../../../src/data/texting.json';
import { sendText } from './sms';
import type { Store } from '../store/store';
import type { Appointment, Client, Package, Payment } from '../types';
import catalog from '../../../seed/catalog.json';
import { HttpError, bad, nowIso, prettyPhone, rid, toE164 } from '../lib/util';
import { withLock } from './switchover';

export async function findClientByPhone(store: Store, phone: string) {
  return (await store.list<Client>('clients')).find((c) => c.phone === phone);
}

export async function uniqueReferralCode(store: Store, first: string) {
  const taken = new Set((await store.list<Client>('clients')).map((c) => c.referralCode));
  const base = first.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'FRIEND';
  for (let n = 10; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

export type ClientInput = { first: string; last: string; phone: string; email?: string; smsReminders?: boolean; smsMarketing?: boolean; birthday?: string };

/**
 * Match a returning client by phone, or add a new one. Only `trusted` input (the
 * team, signed in) changes a client already on file: anyone can type any phone
 * number into the website, so from there an existing client's text choices and
 * details stay as they are. A STOP is only undone by the client replying START.
 */
export async function upsertClient(store: Store, input: ClientInput, opts: { trusted?: boolean; by?: string } = {}) {
  const phone = toE164(input.phone ?? '');
  if (!phone) throw bad('Enter a 10-digit US mobile number.');
  if (!input.first?.trim()) throw bad('Enter a first name.');
  const existing = await findClientByPhone(store, phone);
  if (!opts.trusted) {
    // banned in GlossGenius or by the owner: not online, under their number or their email
    const email = input.email?.trim().toLowerCase();
    const banned = existing?.banned || (email && (await store.list<Client>('clients')).some((c) => c.banned && c.email.toLowerCase() === email));
    if (banned) throw new HttpError(409, `We can’t book this online. Please call or text the studio at ${prettyPhone(catalog.business.phone)}.`);
  }
  if (existing && !opts.trusted) return { client: existing, isNew: false };
  if (existing) {
    existing.email ||= input.email?.trim() ?? '';
    // the desk can record a no; texts back on is a change made on the client's own record
    if (input.smsReminders === false && existing.smsReminders) {
      existing.smsReminders = false;
      existing.smsOptOut = { at: nowIso(), source: 'desk', scope: 'all', by: opts.by };
    }
    if (input.smsMarketing && !existing.smsMarketing) {
      existing.smsMarketing = true;
      existing.smsMarketingAt = nowIso();
      existing.smsMarketingSource = 'desk';
    }
    await store.put('clients', existing);
    return { client: existing, isNew: false };
  }
  const client: Client = {
    id: rid(),
    first: input.first.trim(),
    last: (input.last ?? '').trim(),
    phone,
    email: (input.email ?? '').trim(),
    birthday: input.birthday,
    notes: '',
    createdAt: nowIso(),
    smsReminders: input.smsReminders ?? true,
    // online: giving a mobile number under the texting terms; at the desk: asked in person
    ...((input.smsReminders ?? true)
      ? { smsConsent: { at: nowIso(), source: opts.trusted ? ('desk' as const) : ('online' as const), by: opts.by } }
      : { smsOptOut: { at: nowIso(), source: 'desk' as const, scope: 'all' as const, by: opts.by } }),
    // offers: asked in person at the desk counts now; from the website it waits for a YES (askForOffersYes)
    smsMarketing: !!opts.trusted && !!input.smsMarketing,
    smsMarketingAt: opts.trusted && input.smsMarketing ? nowIso() : undefined,
    smsMarketingSource: opts.trusted && input.smsMarketing ? ('desk' as const) : undefined,
    credit: 0,
    referralCode: await uniqueReferralCode(store, input.first),
  };
  await store.put('clients', client);
  return { client, isNew: true };
}

/** A client counts as new until their first completed visit. */
export async function hasVisited(store: Store, clientId: string) {
  return (await store.list<Appointment>('appointments')).some((a) => a.clientId === clientId && a.status === 'completed');
}

export async function futureAppointments(store: Store, clientId: string) {
  const now = nowIso();
  return (await store.range<Appointment>('appointments', now, '9999')).filter((a) => a.clientId === clientId && !['cancelled', 'no-show'].includes(a.status));
}

/**
 * A paid package goes on the client's account, once per payment: the booking page
 * and Stripe's webhook can both report the same payment.
 */
export function grantPackage(store: Store, client: Client, p: Package, paymentId: string, simulated: boolean) {
  return withLock(store, `pay|${paymentId}`, () => grantOnce(store, client, p, paymentId, simulated));
}
async function grantOnce(store: Store, client: Client, p: Package, paymentId: string, simulated: boolean) {
  const existing = (await store.list<Payment>('payments')).find((x) => x.providerId === paymentId && x.kind === 'package');
  const fresh = (await store.get<Client>('clients', client.id)) ?? client;
  if (existing) return { expiresAt: fresh.packages?.find((k) => k.packageId === p.id)?.expiresAt ?? null, already: true };
  const expiresAt = p.expiresMonths ? new Date(Date.now() + p.expiresMonths * 30.44 * 86400000).toISOString() : null;
  fresh.packages = [...(fresh.packages ?? []), { packageId: p.id, boughtAt: nowIso(), expiresAt, remaining: Object.fromEntries(p.items.map((i) => [i.serviceId, i.quantity])) }];
  await store.put('clients', fresh);
  Object.assign(client, fresh);
  await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: client.id, kind: 'package', amount: p.price, tip: 0, method: 'card', status: 'paid', providerId: paymentId, simulated });
  return { expiresAt, already: false };
}

/** How long a "reply YES" for offers stays good. */
export const OFFERS_YES_DAYS = 30;

/**
 * Someone ticked "text me offers" on the website. Anyone can type any number there, so
 * the number gets one text asking for a YES and offers start only when it comes back.
 * Not for a number already on offers, already asked lately, or that replied STOP.
 */
export async function askForOffersYes(store: Store, client: Client) {
  const fresh = (await store.get<Client>('clients', client.id)) ?? client;
  if (fresh.smsMarketing || !fresh.smsReminders) return null;
  if (fresh.smsMarketingPending && Date.now() - Date.parse(fresh.smsMarketingPending) < OFFERS_YES_DAYS * 86400000) return null;
  const msg = await sendText(store, fresh.phone, texting.offersConfirm, 'opt-in', fresh);
  // not sent (before the switch from GlossGenius): nothing to wait for
  if (msg.status === 'failed') return msg;
  await store.put('clients', { ...fresh, smsMarketingPending: msg.at });
  return msg;
}
