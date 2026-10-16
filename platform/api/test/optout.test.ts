// The website's text opt-out form: offers only, or every text. It stops them at once,
// sends a client's number one text saying so, and answers the same for any number.
//   npx tsx --test platform/api/test/optout.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-opt-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { handleInbound } = await import('../src/services/notify');
const store = await makeStore();
const settings = () => store.get<any>('settings', 'settings');
await store.put('settings', { ...(await settings()), switchover: { done: true }, notifications: { ...(await settings()).notifications, quietStart: 0, quietEnd: 0 } });
const app = makeApp(store);

let cookie = '';
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, json: (await res.json()) as any };
}
await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
const newClient = async (first: string, phone: string) => {
  const c = (await call('POST', '/staff/clients', { first, last: 'Opt', phone })).json;
  await store.put('clients', { ...(await store.get<any>('clients', c.id)), smsReminders: true, smsMarketing: true });
  return c.id as string;
};
const client = (id: string) => store.get<any>('clients', id);
const optOuts = async (id: string) => (await store.list<any>('messages')).filter((m) => m.clientId === id && m.kind === 'opt-out');
const optOut = (phone: string, scope: string) => call('POST', '/public/texts/opt-out', { phone, scope });

test('offers only: offers stop, appointment texts continue, one text says so', async () => {
  const id = await newClient('Ada', '804-555-0801');
  const r = await optOut('(804) 555-0801', 'offers');
  assert.equal(r.status, 200);
  const c = await client(id);
  assert.equal(c.smsMarketing, false);
  assert.equal(c.smsReminders, true);
  const sent = await optOuts(id);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /won’t get offers or news.*Appointment texts continue/);
  // sending the form again changes nothing and texts nothing
  await optOut('8045550801', 'offers');
  assert.equal((await optOuts(id)).length, 1);
});

test('all texts: the same as replying STOP, and START brings appointment texts back', async () => {
  const id = await newClient('Bee', '804-555-0802');
  assert.equal((await optOut('804.555.0802', 'all')).status, 200);
  const c = await client(id);
  assert.equal(c.smsReminders, false);
  assert.equal(c.smsMarketing, false);
  const [sent] = await optOuts(id);
  assert.match(sent.body, /unsubscribed from all texts.*Reply START/);
  // the dashboard won't text them now either
  assert.equal((await call('POST', `/staff/clients/${id}/text`, { body: 'Hi' })).status, 400);
  await handleInbound(store, '+18045550802', 'START');
  assert.equal((await client(id)).smsReminders, true);
});

test('a number that isn’t a client gets the same answer and no text', async () => {
  const before = (await store.list<any>('messages')).length;
  const r = await optOut('804-555-0899', 'all');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, scope: 'all' });
  assert.equal((await store.list<any>('messages')).length, before);
});

test('a client who already replied STOP isn’t texted again', async () => {
  const id = await newClient('Cy', '804-555-0803');
  await handleInbound(store, '+18045550803', 'STOP');
  await optOut('804-555-0803', 'all');
  assert.equal((await optOuts(id)).length, 0);
});

test('it needs a real number and a choice', async () => {
  assert.equal((await optOut('555', 'all')).status, 400);
  assert.equal((await optOut('804-555-0801', 'everything')).status, 400);
});
