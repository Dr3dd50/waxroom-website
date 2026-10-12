// Meta Conversions API: the server copy of each event reuses the browser's event id,
// hashes contact details, sends nothing without consent, drops malformed tracking
// without failing the booking, and keeps failed sends for the scheduled retry.
//   npx tsx --test platform/api/test/meta.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-meta-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.SITE_URL = 'https://www.waxroomrichmond.com';
process.env.META_PIXEL_ID = '111222333';
process.env.META_CAPI_ACCESS_TOKEN = 'test-token';

// Meta's API, faked: record what was sent; `failNext` makes the next call fail.
const sent: any[] = [];
let failNext = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).startsWith('https://graph.facebook.com/')) {
    if (failNext) {
      failNext = false;
      return new Response('{"error":"down"}', { status: 500 });
    }
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{"events_received":1}', { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;

const { makeApp, makeStore } = await import('../src/app');
const { retryMetaEvents } = await import('../src/services/meta');
const { addDays, zoned } = await import('../src/lib/time');
const store = await makeStore();
// online booking opens after the GlossGenius import (gate.test.ts covers that); open it here
await store.put('settings', { ...(await store.get<any>('settings', 'settings')), onlineBooking: { open: true } });
const app = makeApp(store);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (res.headers.get('content-type')?.includes('json') ? await res.json() : null) as any };
}
function nextWeekday(n: number) {
  let day = addDays(zoned(new Date()).day, n);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
  return day;
}
async function book(phone: string, tracking: unknown, dayOffset: number) {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === 'Lip Wax');
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${nextWeekday(dayOffset)}`)).json;
  const start = await call('POST', '/public/bookings/start', { client: { first: 'Amara', last: 'Jones', phone, email: ' Amara@Example.com ' } });
  return call(
    'POST',
    '/public/bookings/confirm',
    { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, start: slots[0].start, tracking, url: 'https://www.waxroomrichmond.com/book/?group=waxing' },
    { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'TestBrowser/1.0' },
  );
}

test('a booking sends Schedule with the browser event id, hashed contact details and the visitor info', async () => {
  sent.length = 0;
  const eventId = randomUUID();
  const r = await book('804-555-0201', { consent: 'allowed', eventId, fbp: 'fb.1.1700000000000.123456', fbc: 'fb.1.1700000000000.AbC_123' }, 3);
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://graph.facebook.com/v23.0/111222333/events');
  const e = sent[0].body.data[0];
  assert.equal(e.event_name, 'Schedule');
  assert.equal(e.event_id, eventId);
  assert.equal(e.action_source, 'website');
  assert.equal(e.event_source_url, 'https://www.waxroomrichmond.com/book/?group=waxing');
  assert.deepEqual(e.user_data.em, [sha('amara@example.com')]);
  assert.deepEqual(e.user_data.ph, [sha('18045550201')]);
  assert.deepEqual(e.user_data.fn, [sha('amara')]);
  assert.equal(e.user_data.client_ip_address, '203.0.113.9');
  assert.equal(e.user_data.client_user_agent, 'TestBrowser/1.0');
  assert.equal(e.user_data.fbp, 'fb.1.1700000000000.123456');
  assert.equal(e.user_data.fbc, 'fb.1.1700000000000.AbC_123');
  assert.equal(e.custom_data.currency, 'USD');
  assert.ok(!JSON.stringify(sent[0].body).includes('Example.com'), 'no raw email leaves the server');
  assert.equal(sent[0].body.test_event_code, undefined);
});

test('no consent, no server event, and the booking still succeeds', async () => {
  sent.length = 0;
  const r = await book('804-555-0202', { consent: 'denied' }, 4);
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0);
});

test('malformed tracking is dropped without failing the booking', async () => {
  sent.length = 0;
  const r = await book('804-555-0203', { consent: 'allowed', eventId: 'not-a-uuid', fbp: '<script>', fbc: 42 }, 5);
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  const e = sent[0].body.data[0];
  assert.match(e.event_id, /^[0-9a-f-]{36}$/); // a fresh id, since the browser's was unusable
  assert.equal(e.user_data.fbp, undefined);
  assert.equal(e.user_data.fbc, undefined);
});

test('the track endpoint only relays a Book tap, and only with consent and an event id', async () => {
  sent.length = 0;
  const eventId = randomUUID();
  const ok = await call('POST', '/public/track', { event: 'InitiateCheckout', tracking: { consent: 'allowed', eventId }, url: 'https://www.waxroomrichmond.com/services/brows/', service: 'Eyebrow Wax' });
  assert.equal(ok.status, 204);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.data[0].event_name, 'InitiateCheckout');
  assert.equal(sent[0].body.data[0].event_id, eventId);
  assert.equal(sent[0].body.data[0].custom_data.content_name, 'Eyebrow Wax');
  // anything else is ignored: other event names, no consent, another site's URL
  assert.equal((await call('POST', '/public/track', { event: 'Purchase', tracking: { consent: 'allowed', eventId: randomUUID() } })).status, 204);
  assert.equal((await call('POST', '/public/track', { event: 'InitiateCheckout', tracking: { consent: 'denied', eventId: randomUUID() } })).status, 204);
  await call('POST', '/public/track', { event: 'InitiateCheckout', tracking: { consent: 'allowed', eventId: randomUUID() }, url: 'https://evil.example/' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.data[0].event_source_url, 'https://www.waxroomrichmond.com/book/');
  // a garbage body is still a quiet 204
  const res = await app.request('/api/public/track', { method: 'POST', body: 'not json' });
  assert.equal(res.status, 204);
});

test('a failed send is kept and the scheduled retry delivers it', async () => {
  sent.length = 0;
  failNext = true;
  const eventId = randomUUID();
  const r = await book('804-555-0204', { consent: 'allowed', eventId }, 6);
  assert.equal(r.status, 200, 'Meta being down never fails the booking');
  assert.equal(sent.length, 0);
  assert.equal((await store.list('metaOutbox')).length, 1);
  const retry = await retryMetaEvents(store);
  assert.deepEqual(retry, { sent: 1, waiting: 0 });
  assert.equal(sent[0].body.data[0].event_id, eventId);
  assert.equal((await store.list('metaOutbox')).length, 0);
});
