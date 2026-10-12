import type { Store } from '../store/store';
import type { Appointment, Client, Package, Payment } from '../types';
import { bad, nowIso, rid, toE164 } from '../lib/util';
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

/** Match a returning client by phone, or add a new one. */
export async function upsertClient(store: Store, input: ClientInput) {
  const phone = toE164(input.phone ?? '');
  if (!phone) throw bad('Enter a 10-digit US mobile number.');
  if (!input.first?.trim()) throw bad('Enter a first name.');
  const existing = await findClientByPhone(store, phone);
  if (existing) {
    existing.email ||= input.email?.trim() ?? '';
    if (input.smsReminders !== undefined) existing.smsReminders = input.smsReminders;
    if (input.smsMarketing && !existing.smsMarketing) {
      existing.smsMarketing = true;
      existing.smsMarketingAt = nowIso();
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
    smsMarketing: !!input.smsMarketing,
    smsMarketingAt: input.smsMarketing ? nowIso() : undefined,
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
