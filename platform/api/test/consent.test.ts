// Text consent, for the record carriers can ask for: how and when each client agreed to
// appointment texts or stopped them, a client's first text naming us and how to stop,
// and a STOP that the desk can't quietly undo.
//   npx tsx --test platform/api/test/consent.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-consent-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { handleInbound } = await import('../src/services/notify');
const { FIRST_TEXT_LINE } = await import('../src/services/sms');
const { textsOff } = await import('../src/services/importer');
const { addDays, zoned } = await import('../src/lib/time');
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
function nextWeekday(n: number) {
  let day = addDays(zoned(new Date()).day, n);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
  return day;
}
const client = (id: string) => store.get<any>('clients', id);
const textsTo = async (id: string) => (await store.list<any>('messages')).filter((m) => m.clientId === id && m.channel !== 'email');

test('booking online: agreeing is recorded, and the first text says who we are and how to stop', async () => {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === 'Underarm');
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${nextWeekday(4)}`)).json;
  const start = await call('POST', '/public/bookings/start', { client: { first: 'Rae', last: 'Online', phone: '804-555-0901', email: 'rae@example.com' } });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, start: slots[0].start });
  assert.equal(done.status, 200, JSON.stringify(done.json));
  const c = await client(start.json.clientId);
  assert.equal(c.smsReminders, true);
  assert.equal(c.smsConsent.source, 'online');
  assert.ok(c.smsConsent.at);
  const [booking] = (await textsTo(c.id)).filter((m) => m.kind === 'booking');
  assert.ok(booking.body.endsWith(`\n${FIRST_TEXT_LINE}`), booking.body);
});

test('at the desk: the answer to “can we text you?” is recorded either way, with who asked', async () => {
  await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  const yes = (await call('POST', '/staff/clients', { first: 'Sol', last: 'Desk', phone: '804-555-0902', smsReminders: true })).json;
  const sol = await client(yes.id);
  assert.equal(sol.smsConsent.source, 'desk');
  assert.ok(sol.smsConsent.by);
  const no = (await call('POST', '/staff/clients', { first: 'Tal', last: 'Desk', phone: '804-555-0903', smsReminders: false })).json;
  const tal = await client(no.id);
  assert.equal(tal.smsReminders, false);
  assert.equal(tal.smsOptOut.source, 'desk');
  assert.equal(tal.smsConsent, undefined);
  // the client card carries the record
  const card = (await call('GET', `/staff/clients/${yes.id}`)).json;
  assert.equal(card.smsConsent?.source ?? card.client?.smsConsent?.source, 'desk');
});

test('a STOP stays a STOP when the desk adds the same number again', async () => {
  const c = (await call('POST', '/staff/clients', { first: 'Uma', last: 'Stop', phone: '804-555-0904', smsReminders: true })).json;
  await handleInbound(store, '+18045550904', 'STOP');
  const stopped = await client(c.id);
  assert.equal(stopped.smsOptOut.source, 'reply');
  await call('POST', '/staff/clients', { first: 'Uma', last: 'Stop', phone: '804-555-0904', smsReminders: true });
  assert.equal((await client(c.id)).smsReminders, false);
  // START is how it comes back, recorded as such
  await handleInbound(store, '+18045550904', 'START');
  const back = await client(c.id);
  assert.equal(back.smsReminders, true);
  assert.equal(back.smsConsent.source, 'text-reply');
  assert.equal(back.smsOptOut, undefined);
});

test('turning texts off or on from the client’s record is recorded as the client asking', async () => {
  const c = (await call('POST', '/staff/clients', { first: 'Vi', last: 'Edit', phone: '804-555-0905', smsReminders: true })).json;
  await call('PATCH', `/staff/clients/${c.id}`, { smsReminders: false });
  assert.equal((await client(c.id)).smsOptOut.source, 'desk');
  await call('PATCH', `/staff/clients/${c.id}`, { smsReminders: true });
  const on = await client(c.id);
  assert.equal(on.smsConsent.source, 'desk');
  assert.equal(on.smsOptOut, undefined);
});

test('the STOP line isn’t added twice to a text that already has one', async () => {
  const { sendText } = await import('../src/services/sms');
  const c = await client((await call('POST', '/staff/clients', { first: 'Wyn', last: 'Line', phone: '804-555-0906', smsReminders: true })).json.id);
  const m = await sendText(store, c.phone, 'Offer: 10% off.\nReply STOP to opt out', 'campaign', c);
  assert.equal(m.body, 'Offer: 10% off.\nReply STOP to opt out');
});

test('GlossGenius opt-outs carry over, whatever the column is called', () => {
  assert.equal(textsOff({ 'first name': 'A', 'sms opt in': 'No' }), true);
  assert.equal(textsOff({ 'text notifications': 'false' }), true);
  assert.equal(textsOff({ 'sms opt out': 'yes' }), true);
  assert.equal(textsOff({ 'sms opt in': 'Yes' }), false);
  assert.equal(textsOff({ 'sms marketing': 'No' }), false, 'offers start off anyway');
  assert.equal(textsOff({ phone: '8045550000', notes: 'no' }), false);
});
