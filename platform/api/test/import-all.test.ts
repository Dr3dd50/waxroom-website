// Every GlossGenius client with a name comes in: banned ones stay banned and can't book
// online, ones with no mobile number get no texts, and two people on one phone stay two
// people. Re-importing changes nothing.
//   npx tsx --test platform/api/test/import-all.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-import-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { importGlossGenius } = await import('../src/services/importer');
const { sendText } = await import('../src/services/sms');
const store = await makeStore();
await store.put('settings', { ...(await store.get<any>('settings', 'settings')), switchover: { done: true } });
const app = makeApp(store);
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
};
const clients = () => store.list<any>('clients');
const byName = async (first: string, last: string) => (await clients()).find((c) => c.first === first && c.last === last);

const csv = [
  'First Name,Last Name,Phone,Email,Banned',
  'Ana,Avery,804-555-0601,ana@example.com,false',
  'Ana,Avery,(804) 555-0601,,false', // the same person twice
  'Bea,Avery,804-555-0601,,false', // her daughter, on her phone
  'Cara,Cole,,cara@example.com,false', // no phone
  'Dee,Dunn,804-555-0604,dee@example.com,true', // banned
  ',,804-555-0607,,false', // no name
].join('\n');

test('everyone with a name comes in, and the report says what happened to each row', async () => {
  const r = await importGlossGenius(store, { clients: csv });
  assert.deepEqual(r.clients, { added: 4, matched: 0, duplicates: 1, sharedPhone: 1, banned: 1, noPhone: 1, skipped: 1 });
  const bea = await byName('Bea', 'Avery');
  assert.equal(bea.phone, '');
  assert.equal(bea.smsReminders, false);
  assert.match(bea.notes, /Shares the phone \(804\) 555-0601 with Ana Avery/);
  const cara = await byName('Cara', 'Cole');
  assert.equal(cara.phone, '');
  assert.equal(cara.smsReminders, false);
  assert.equal(cara.smsOptOut, undefined, 'no number is not an opt-out');
  assert.equal((await byName('Dee', 'Dunn')).banned.source, 'glossgenius');
});

test('importing again matches everyone (by phone, or by email with no phone) and adds nobody', async () => {
  const before = (await clients()).length;
  const r = await importGlossGenius(store, { clients: csv });
  assert.equal(r.clients!.added, 0);
  assert.equal((await clients()).length, before);
});

test('a ban lifted in GlossGenius lifts here; one set by the owner stays', async () => {
  await importGlossGenius(store, { clients: csv.replace('dee@example.com,true', 'dee@example.com,false') });
  assert.equal((await byName('Dee', 'Dunn')).banned, undefined);
  const dee = await byName('Dee', 'Dunn');
  await store.put('clients', { ...dee, banned: { at: new Date().toISOString(), source: 'desk', by: 'Danielle' } });
  await importGlossGenius(store, { clients: csv.replace('dee@example.com,true', 'dee@example.com,false') });
  assert.equal((await byName('Dee', 'Dunn')).banned.source, 'desk');
});

test('a banned client can’t start a booking online, by phone or by email', async () => {
  const byPhone = await call('POST', '/public/bookings/start', { client: { first: 'Dee', last: 'Dunn', phone: '804-555-0604', email: 'x@example.com' } });
  assert.equal(byPhone.status, 409);
  assert.match(byPhone.json.error, /call or text the studio/);
  const byEmail = await call('POST', '/public/bookings/start', { client: { first: 'Dee', last: 'Dunn', phone: '804-555-0699', email: 'DEE@example.com' } });
  assert.equal(byEmail.status, 409);
  assert.equal((await clients()).filter((c) => c.phone === '+18045550699').length, 0, 'no new record for them');
});

test('a text to a client with no number is recorded as not sent, never tried', async () => {
  const cara = await byName('Cara', 'Cole');
  const m = await sendText(store, cara.phone, 'Hi', 'staff', cara);
  assert.equal(m.status, 'failed');
  assert.match(m.error!, /no mobile number/);
});

test('appointments for someone sharing a phone land on them, by name', async () => {
  const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const r = await importGlossGenius(store, {
    appointments: ['Client,Phone,Service,Date,Time,Staff', `Bea Avery,804-555-0601,Bikini,${day},10:00 AM,Danielle`].join('\n'),
  });
  assert.equal(r.appointments!.added, 1, JSON.stringify(r.appointments));
  const bea = await byName('Bea', 'Avery');
  assert.ok((await store.list<any>('appointments')).some((a) => a.clientId === bea.id));
});

test('a client who had no phone picks up the number GlossGenius has for them later', async () => {
  await importGlossGenius(store, { clients: csv.replace(',,cara@example.com,false', ',804-555-0605,cara@example.com,false') });
  const cara = await byName('Cara', 'Cole');
  assert.equal(cara.phone, '+18045550605');
  assert.equal(cara.smsReminders, true);
  assert.equal(cara.smsConsent.source, 'glossgenius');
});
