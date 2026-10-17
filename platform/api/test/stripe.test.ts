// Stripe, live mode, against a fake Stripe API: the real SDK builds every request,
// so this checks what we send and how we read the answers. Card on file, a deposit
// the bank asks the client to approve, a membership, and the webhook (in the newer
// API shape too) for a renewal and for an approved deposit whose page was closed.
//   npx tsx --test platform/api/test/stripe.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-stripe-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';

// ── a small fake of the Stripe API ──
type Req = { method: string; path: string; form: URLSearchParams };
const reqs: Req[] = [];
const intents = new Map<string, { id: string; status: string; amount: number; metadata: Record<string, string>; customer: string; client_secret: string }>();
let nextCard = { last4: '4242', asksApproval: false };
let n = 0;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Request-Id': `req_${++n}` } });
const metadataOf = (form: URLSearchParams) => Object.fromEntries([...form].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname !== 'api.stripe.com') return realFetch(input, init);
  const method = (init?.method ?? 'GET').toUpperCase();
  const form = new URLSearchParams(method === 'GET' ? url.search : String(init?.body ?? ''));
  reqs.push({ method, path: url.pathname, form });
  const p = url.pathname;
  if (method === 'POST' && p === '/v1/customers') return json(200, { id: `cus_${++n}`, object: 'customer' });
  if (method === 'POST' && p === '/v1/setup_intents') return json(200, { id: `seti_${++n}`, object: 'setup_intent', client_secret: `seti_secret_${n}`, status: 'requires_payment_method' });
  if (method === 'GET' && p.startsWith('/v1/setup_intents/'))
    return json(200, { id: p.split('/').pop(), object: 'setup_intent', status: 'succeeded', payment_method: { id: `pm_${nextCard.last4}`, object: 'payment_method', card: { brand: 'visa', last4: nextCard.last4 } } });
  if (method === 'POST' && p === '/v1/payment_intents') {
    const id = `pi_${++n}`;
    const pi = { id, status: 'succeeded', amount: Number(form.get('amount')), metadata: metadataOf(form), customer: form.get('customer')!, client_secret: `${id}_secret` };
    if (form.get('payment_method') === 'pm_3184') {
      intents.set(id, { ...pi, status: 'requires_payment_method' });
      return json(402, { error: { type: 'card_error', code: 'authentication_required', message: 'This payment requires authentication.', payment_intent: { ...pi, object: 'payment_intent', status: 'requires_payment_method' } } });
    }
    intents.set(id, pi);
    return json(200, { ...pi, object: 'payment_intent' });
  }
  if (method === 'GET' && p.startsWith('/v1/payment_intents/')) return json(200, { ...intents.get(p.split('/').pop()!), object: 'payment_intent' });
  if (method === 'POST' && p.match(/^\/v1\/payment_intents\/[^/]+\/cancel$/)) return json(200, { id: p.split('/')[3], object: 'payment_intent', status: 'canceled' });
  if (method === 'POST' && p === '/v1/refunds') return json(200, { id: `re_${++n}`, object: 'refund' });
  if (method === 'POST' && p === '/v1/prices') return json(200, { id: `price_${++n}`, object: 'price' });
  if (method === 'POST' && p === '/v1/subscriptions')
    return json(200, { id: `sub_${++n}`, object: 'subscription', status: 'active', latest_invoice: { id: `in_${n}`, object: 'invoice', payment_intent: { id: `pi_sub_${n}`, status: 'succeeded' } } });
  return json(404, { error: { type: 'invalid_request_error', message: `fake Stripe has no ${method} ${p}` } });
}) as typeof fetch;

const { makeApp, makeStore } = await import('../src/app');
const { addDays, zoned } = await import('../src/lib/time');
const store = await makeStore();
await store.put('settings', { ...(await store.get<any>('settings', 'settings')), switchover: { done: true } });
const app = makeApp(store);

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, json: (res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()) as any };
}
function nextWeekday(k: number) {
  let day = addDays(zoned(new Date()).day, k);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
  return day;
}
async function startBooking(serviceName: string, phone: string, day: string, last4: string) {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === serviceName);
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${day}`)).json;
  const start = await call('POST', '/public/bookings/start', { client: { first: 'Sam', last: 'Stripe', phone, email: 'sam@example.com' } });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  assert.equal(start.json.simulated, false);
  assert.match(start.json.clientSecret, /^seti_secret_/);
  nextCard = { last4, asksApproval: last4 === '3184' };
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, serviceId: service.id, start: slots[0].start });
  return { done, clientId: start.json.clientId as string };
}
async function webhook(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${++n}`, object: 'event', type, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_fake' });
  return call('POST', '/webhooks/stripe', payload, { 'stripe-signature': header });
}

test('booking saves a card through a SetupIntent (cards only) and charges the deposit off-session', async () => {
  assert.equal((await call('GET', '/public/config')).json.payments, 'stripe');
  const { done } = await startBooking('New Client Ritual', '804-555-0401', nextWeekday(3), '4242');
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal(done.json.deposit, 1000);
  assert.equal(done.json.card, 'Visa •• 4242');
  const si = reqs.find((r) => r.method === 'POST' && r.path === '/v1/setup_intents')!;
  assert.equal(si.form.get('usage'), 'off_session');
  assert.equal(si.form.get('payment_method_types[0]'), 'card');
  const pi = reqs.find((r) => r.method === 'POST' && r.path === '/v1/payment_intents')!;
  assert.deepEqual([pi.form.get('amount'), pi.form.get('off_session'), pi.form.get('confirm'), pi.form.get('metadata[kind]')], ['1000', 'true', 'true', 'deposit']);
});

test('a deposit that needs approval returns its client secret, and is checked with Stripe after', async () => {
  const { done, clientId } = await startBooking('New Client Ritual', '804-555-0402', nextWeekday(4), '3184');
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal(done.json.needsAuthentication, true);
  assert.match(done.json.clientSecret, /_secret$/);
  assert.equal(done.json.paymentMethodId, 'pm_3184');
  // not approved yet: refused
  assert.equal((await call('POST', `/public/booking/${done.json.token}/deposit`, {})).status, 402);
  // the client approves in the page (Stripe.js); Stripe now reports it succeeded
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === clientId);
  intents.get(appt.deposit.paymentId)!.status = 'succeeded';
  const ok = await call('POST', `/public/booking/${done.json.token}/deposit`, {});
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.deposit, 1000);
});

test('an approved deposit whose page was closed is finished by the webhook', async () => {
  const { done, clientId } = await startBooking('New Client Ritual', '804-555-0403', nextWeekday(5), '3184');
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === clientId);
  const pi = intents.get(appt.deposit.paymentId)!;
  pi.status = 'succeeded';
  const r = await webhook('payment_intent.succeeded', { ...pi, object: 'payment_intent' });
  assert.equal(r.status, 200);
  assert.equal((await store.get<any>('appointments', appt.id)).deposit.status, 'paid');
  assert.ok((await store.list<any>('messages')).some((m) => m.kind === 'booking' && m.clientId === clientId));
  // and the page coming back late changes nothing
  assert.equal((await call('POST', `/public/booking/${done.json.token}/deposit`, {})).status, 200);
});

test('membership: subscription on the saved card, then a renewal recorded from the webhook (old and new invoice shapes)', async () => {
  const cat = (await call('GET', '/public/catalog')).json;
  const m = cat.memberships[0];
  const start = await call('POST', `/public/memberships/${m.id}/start`, { client: { first: 'Mia', last: 'Member', phone: '804-555-0404' } });
  nextCard = { last4: '4242', asksApproval: false };
  const joined = await call('POST', `/public/memberships/${m.id}/confirm`, { clientId: start.json.clientId, setupId: start.json.setupId });
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  const sub = reqs.find((r) => r.path === '/v1/subscriptions')!;
  assert.equal(sub.form.get('default_payment_method'), 'pm_4242');
  assert.equal(sub.form.get('payment_behavior'), 'allow_incomplete');
  const client = await store.get<any>('clients', start.json.clientId);
  assert.equal(client.membership.status, 'active');
  const subId = client.membership.subscriptionId;
  const memberPayments = async () => (await store.list<any>('payments')).filter((p) => p.kind === 'membership' && p.clientId === client.id);
  assert.equal((await memberPayments()).length, 1);
  // Stripe also reports the first invoice: not counted twice
  const firstInvoice = (await memberPayments())[0].providerId;
  await webhook('invoice.paid', { id: firstInvoice, object: 'invoice', subscription: subId, amount_paid: m.price, period_start: 1 });
  assert.equal((await memberPayments()).length, 1);
  // next month, newer API shape (subscription under parent)
  await webhook('invoice.paid', { id: 'in_renewal', object: 'invoice', parent: { subscription_details: { subscription: subId } }, amount_paid: m.price, period_start: Math.floor(Date.now() / 1000) });
  assert.equal((await memberPayments()).length, 2);
  await webhook('invoice.payment_failed', { id: 'in_failed', object: 'invoice', parent: { subscription_details: { subscription: subId } } });
  assert.equal((await store.get<any>('clients', client.id)).membership.status, 'past_due');
});

test('a webhook with a bad signature is refused', async () => {
  const r = await call('POST', '/webhooks/stripe', JSON.stringify({ type: 'invoice.paid', data: { object: {} } }), { 'stripe-signature': 't=1,v1=nope' });
  assert.equal(r.status, 400);
});

// ── from the audit ──
test('a package can’t be claimed with a made-up or someone else’s payment', async () => {
  const cat = (await call('GET', '/public/catalog')).json;
  const p = cat.packages[0];
  const s = await call('POST', `/public/packages/${p.id}/start`, { client: { first: 'Pat', last: 'Package', phone: '804-555-0410' } });
  const before = (await store.list<any>('payments')).length;
  assert.equal((await call('POST', `/public/packages/${p.id}/approved`, { clientId: s.json.clientId, paymentId: 'pi_sim_free' })).status, 402);
  // a real, paid intent, but for another customer
  intents.set('pi_other', { id: 'pi_other', status: 'succeeded', amount: p.price, metadata: { packageId: p.id, clientId: s.json.clientId, kind: 'package' }, customer: 'cus_someone_else', client_secret: 'x' });
  assert.equal((await call('POST', `/public/packages/${p.id}/approved`, { clientId: s.json.clientId, paymentId: 'pi_other' })).status, 402);
  assert.equal((await store.list<any>('payments')).length, before);
  assert.ok(!(await store.get<any>('clients', s.json.clientId)).packages?.length);
});

test('the page and the webhook reporting one approved deposit at once: one payment, one text', async () => {
  const { done, clientId } = await startBooking('New Client Ritual', '804-555-0411', nextWeekday(6), '3184');
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === clientId);
  const pi = intents.get(appt.deposit.paymentId)!;
  pi.status = 'succeeded';
  await Promise.all([call('POST', `/public/booking/${done.json.token}/deposit`, {}), webhook('payment_intent.succeeded', { ...pi, object: 'payment_intent' })]);
  assert.equal((await store.list<any>('payments')).filter((p) => p.providerId === pi.id && p.status === 'paid').length, 1);
  assert.equal((await store.list<any>('messages')).filter((m) => m.kind === 'booking' && m.channel !== 'email' && m.clientId === clientId).length, 1);
});

test('a hold cancelled before the bank approval comes through is refunded, not kept', async () => {
  const { done, clientId } = await startBooking('New Client Ritual', '804-555-0412', nextWeekday(7), '3184');
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === clientId);
  assert.equal((await call('POST', `/public/booking/${done.json.token}/cancel`, {})).status, 200);
  assert.ok(reqs.some((r) => r.path === `/v1/payment_intents/${appt.deposit.paymentId}/cancel`), 'the pending payment is called off');
  // it went through anyway (approved at that same moment): money goes back
  const pi = intents.get(appt.deposit.paymentId)!;
  pi.status = 'succeeded';
  assert.equal((await webhook('payment_intent.succeeded', { ...pi, object: 'payment_intent' })).status, 200);
  assert.ok(reqs.some((r) => r.path === '/v1/refunds' && r.form.get('payment_intent') === pi.id));
});

test('Stripe isn’t called before the switch from GlossGenius, keys or not', async () => {
  const s = await store.get<any>('settings', 'settings');
  await store.put('settings', { ...s, switchover: { done: false } });
  const n = reqs.length;
  assert.equal((await call('POST', '/public/bookings/start', { client: { first: 'Too', last: 'Early', phone: '804-555-0413' } })).status, 409);
  const { payments } = await import('../src/services/payments');
  await assert.rejects(() => payments.ensureCustomer({ id: 'x', first: 'A', last: 'B', phone: '+18045550413', email: '' } as any), /switch over from GlossGenius/);
  assert.equal(reqs.length, n);
  await store.put('settings', { ...s, switchover: { done: true } });
});
