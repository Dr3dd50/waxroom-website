// After a visit: the rating text, the thank-you for answering (a free Yoni Steam, once
// per client, whatever the score), the review link for every answer, the owner's
// private heads-up on a low score, and the free visit used at checkout.
//   npx tsx --test platform/api/test/reviews.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-rev-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { runDueTexts, handleInbound } = await import('../src/services/notify');
const store = await makeStore();
const settings = () => store.get<any>('settings', 'settings');
await store.put('settings', { ...(await settings()), switchover: { done: true }, notifications: { ...(await settings()).notifications, quietStart: 0, quietEnd: 0 } });
const app = makeApp(store);

let cookie = '';
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, json: json as any };
}
await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
const boot = (await call('GET', '/staff/bootstrap')).json;
const owner = boot.me;
await call('PATCH', `/staff/team/${owner.id}`, { phone: '804-555-0999' });
const svc = (name: string) => boot.services.find((s: any) => s.name === name && !s.ritualOf);
const texts = async (clientId: string, kind?: string) => (await store.list<any>('messages')).filter((m) => m.clientId === clientId && (!kind || m.kind === kind));
const later = (hours: number) => new Date(Date.now() + hours * 3600000);

/** A visit that started an hour ago, checked out now (cash). */
async function visit(clientId: string, serviceName: string) {
  const service = svc(serviceName);
  const start = new Date(Date.now() - 3600000).toISOString();
  const id = `${start}_${Math.random().toString(36).slice(2, 6)}`;
  const token = `tok${Math.random().toString(36).slice(2, 10)}`;
  await store.put('appointments', { id, clientId, staffId: owner.id, serviceId: service.id, start, end: new Date(Date.parse(start) + service.duration * 60000).toISOString(), status: 'checked-in', price: service.price, source: 'staff', notes: '', manageToken: token, createdAt: start, newClient: false, texts: {} });
  await store.put('tokens', { id: token, appointmentId: id });
  const r = await call('POST', `/staff/appointments/${encodeURIComponent(id)}/checkout`, { tip: 0, method: 'cash', useCredit: false, useMembership: false });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
const newClient = async (first: string, phone: string) => (await call('POST', '/staff/clients', { first, last: 'Rater', phone })).json;

test('the rating text goes 2 hours after checkout, once, offering the free Yoni Steam for answering', async () => {
  const c = await newClient('Ava', '804-555-0501');
  await visit(c.id, 'Brazilian');
  await runDueTexts(store, later(1));
  assert.equal((await texts(c.id, 'rating-request')).length, 0, 'not yet at one hour');
  await runDueTexts(store, later(2.1));
  await runDueTexts(store, later(2.4));
  const asked = await texts(c.id, 'rating-request');
  assert.equal(asked.length, 1);
  assert.match(asked[0].body, /How was your Brazilian with Danielle\? Reply with a number from 1 to 5/);
  assert.match(asked[0].body, /your next Yoni Steam is on us/);
});

test('any answer earns the thank-you once; 4–5 get the review link', async () => {
  const c = (await store.list<any>('clients')).find((x) => x.first === 'Ava');
  await handleInbound(store, c.phone, '5');
  const after = await store.get<any>('clients', c.id);
  assert.equal(after.perks.length, 1);
  assert.equal(after.perks[0].label, 'Free Yoni Steam');
  const days = (Date.parse(after.perks[0].expiresAt) - Date.now()) / 86400000;
  assert.ok(days > 89 && days < 91, `expires in ${days} days`);
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === c.id);
  assert.equal(appt.rating.score, 5);
  const thanks = await texts(c.id, 'rating-thanks');
  assert.equal(thanks.length, 1);
  assert.match(thanks[0].body, /Your free Yoni Steam is on your account, good until/);
  assert.match(thanks[0].body, /search\.google\.com\/local\/writereview/);
  // a second "5" isn't a rating any more: no second thank-you
  await handleInbound(store, c.phone, '5');
  assert.equal((await texts(c.id, 'rating-thanks')).length, 1);
  assert.equal((await store.get<any>('clients', c.id)).perks.length, 1);
  // no heads-up to the owner for a good score
  assert.equal((await store.list<any>('messages')).filter((m) => m.kind === 'alert' && /Rating/.test(m.body)).length, 0);
});

test('a low score gets the same thank-you and the review link, and the owner a private heads-up', async () => {
  const c = await newClient('Bea', '804-555-0502');
  await visit(c.id, 'Bikini');
  await runDueTexts(store, later(2.2));
  await handleInbound(store, '+18045550502', '2');
  const thanks = await texts(c.id, 'rating-thanks');
  assert.equal(thanks.length, 1);
  assert.match(thanks[0].body, /Thank you for telling us, Bea/);
  assert.match(thanks[0].body, /free Yoni Steam is on your account/);
  assert.match(thanks[0].body, /writereview/);
  assert.doesNotMatch(thanks[0].body, /owner|reach out/i);
  assert.equal((await store.get<any>('clients', c.id)).perks.length, 1);
  const alert = (await store.list<any>('messages')).find((m) => m.kind === 'alert' && /Rating 2\/5 from Bea R\. for Bikini with Danielle/.test(m.body));
  assert.ok(alert, 'owner heads-up');
  assert.equal(alert.to, '+18045550999');
  assert.doesNotMatch(alert.body, /555-0502|5550502/);
});

test('asked at most once every 90 days; the thank-you is once per client, ever', async () => {
  const c = (await store.list<any>('clients')).find((x) => x.first === 'Bea');
  await visit(c.id, 'Underarm');
  await runDueTexts(store, later(2.2));
  assert.equal((await texts(c.id, 'rating-request')).length, 1, 'still within 90 days');
  // 100 days on, she's asked again, without the offer
  await store.put('clients', { ...(await store.get<any>('clients', c.id)), ratingAskedAt: new Date(Date.now() - 100 * 86400000).toISOString() });
  await visit(c.id, 'Underarm');
  await runDueTexts(store, later(2.2));
  const asked = await texts(c.id, 'rating-request');
  assert.equal(asked.length, 2);
  assert.doesNotMatch(asked[1].body, /on us/);
  await handleInbound(store, '+18045550502', '4');
  assert.equal((await store.get<any>('clients', c.id)).perks.length, 1);
  assert.doesNotMatch((await texts(c.id, 'rating-thanks')).at(-1).body, /Yoni Steam/);
});

test('the free Yoni Steam comes off at checkout, once', async () => {
  const c = (await store.list<any>('clients')).find((x) => x.first === 'Ava');
  const first = await visit(c.id, 'Yoni Steam');
  assert.equal(first.checkout.total, 0);
  assert.ok(first.checkout.lines.some((l: any) => /Thank-you: free Yoni Steam/.test(l.label)));
  const used = (await store.get<any>('clients', c.id)).perks[0];
  assert.ok(used.usedAt);
  const second = await visit(c.id, 'Yoni Steam');
  assert.equal(second.checkout.total, svc('Yoni Steam').price);
});

test('no rating text for a client who opted out, or when the owner turns it off', async () => {
  const c = await newClient('Cal', '804-555-0503');
  await store.put('clients', { ...(await store.get<any>('clients', c.id)), smsReminders: false });
  await visit(c.id, 'Lip Wax');
  await runDueTexts(store, later(2.2));
  assert.equal((await texts(c.id, 'rating-request')).length, 0);

  assert.equal((await call('PUT', '/staff/settings', { reviews: { enabled: false } })).status, 200);
  const d = await newClient('Dee', '804-555-0504');
  await visit(d.id, 'Lip Wax');
  await runDueTexts(store, later(2.2));
  assert.equal((await texts(d.id, 'rating-request')).length, 0);
  assert.equal((await call('PUT', '/staff/settings', { reviews: { enabled: true, delayHours: 0 } })).status, 400);
  assert.equal((await call('PUT', '/staff/settings', { reviews: { enabled: true, reviewUrl: 'not a link' } })).status, 400);
});
