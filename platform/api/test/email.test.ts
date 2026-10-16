// Appointment emails: while texting isn't available, clients hear about their
// bookings by email. The same messages as the texts, with a subject and links in
// place of reply keywords; online booking asks for an address while they're on.
//   npx tsx --test platform/api/test/email.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-mail-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { runDueTexts } = await import('../src/services/notify');
const { sendEmail, toHtml } = await import('../src/services/email');
const { addDays, zoned } = await import('../src/lib/time');
const store = await makeStore();
const settings = () => store.get<any>('settings', 'settings');
// emails start off (texts are the default); these tests are about what happens once the owner turns them on
assert.equal((await settings()).emails.enabled, false);
await store.put('settings', { ...(await settings()), emails: { enabled: true }, switchover: { done: true }, notifications: { ...(await settings()).notifications, quietStart: 0, quietEnd: 0 } });
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
const emails = async (clientId: string, kind?: string) => (await store.list<any>('messages')).filter((m) => m.clientId === clientId && m.channel === 'email' && (!kind || m.kind === kind));
const texts = async (clientId: string, kind?: string) => (await store.list<any>('messages')).filter((m) => m.clientId === clientId && m.channel !== 'email' && (!kind || m.kind === kind));

async function book(first: string, phone: string, client: Record<string, unknown> = {}) {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === 'Underarm');
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${nextWeekday(4)}`)).json;
  const start = await call('POST', '/public/bookings/start', { client: { first, last: 'Mail', phone, email: `${first.toLowerCase()}@example.com`, smsReminders: true, ...client } });
  if (start.status !== 200) return { status: start.status, json: start.json };
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, start: slots[0].start });
  assert.equal(done.status, 200, JSON.stringify(done.json));
  return { status: 200, json: done.json, clientId: start.json.clientId as string };
}

test('online booking asks for an email while appointment emails are on', async () => {
  assert.equal((await call('GET', '/public/config')).json.emailRequired, true);
  const r = await book('Nomail', '804-555-0601', { email: '' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /email/i);
  assert.equal((await book('Typo', '804-555-0602', { email: 'typo@nowhere' })).status, 400);
});

test('the booking confirmation is emailed, with a subject, the links and the studio’s sign-off', async () => {
  const r = await book('Ines', '804-555-0603');
  const [mail] = await emails(r.clientId!, 'booking');
  assert.ok(mail, 'booking email');
  assert.equal(mail.to, 'ines@example.com');
  assert.match(mail.subject, /^You’re booked: Underarm on .+ at .+/);
  assert.match(mail.body, /Hi Ines! You’re booked for Underarm/);
  assert.match(mail.body, /\/booking\/\?t=|manage|booking/i);
  assert.match(mail.body, /The Wax Room\n11162 Hull Street Rd N/);
  assert.equal(mail.status, 'simulated', 'no app password in tests: kept, not sent');
  // the text still goes too (kept unsent until Twilio is approved)
  assert.equal((await texts(r.clientId!, 'booking')).length, 1);
});

test('the confirm-request email links to a confirm button instead of "Reply C"', async () => {
  const r = await book('Jada', '804-555-0604');
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  // booked well ahead, then the confirm window opens
  await store.put('appointments', { ...appt, createdAt: new Date(Date.parse(appt.start) - 10 * 86400000).toISOString() });
  const n = (await settings()).notifications;
  await runDueTexts(store, new Date(Date.parse(appt.start) - (n.confirmHoursBefore - 1) * 3600000));
  const [mail] = await emails(r.clientId!, 'confirm-request');
  assert.ok(mail, 'confirm-request email');
  assert.doesNotMatch(mail.body, /Reply C/);
  assert.match(mail.body, new RegExp(`Confirm you’re coming: \\S+${appt.manageToken}`));
  assert.match(mail.subject, /please confirm/);
  // the link's page confirms it
  const done = await call('POST', `/public/booking/${appt.manageToken}/attend`);
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal(done.json.status, 'confirmed');
  assert.equal((await store.get<any>('appointments', appt.id)).status, 'confirmed');
});

test('a client who turned texts off still gets the appointment emails, and no texts', async () => {
  const r = await book('Kemi', '804-555-0605', { smsReminders: false });
  assert.equal((await emails(r.clientId!, 'booking')).length, 1);
  assert.equal((await texts(r.clientId!)).length, 0);
});

test('cancellations are emailed; ratings, book-again and offers stay text-only', async () => {
  const r = await book('Lola', '804-555-0606');
  const cancel = await call('POST', `/public/booking/${r.json.token}/cancel`);
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  const [mail] = await emails(r.clientId!, 'cancel');
  assert.ok(mail, 'cancel email');
  assert.match(mail.subject, /^Cancelled: Underarm on /);
  const kinds = new Set((await store.list<any>('messages')).filter((m) => m.channel === 'email').map((m) => m.kind));
  for (const k of ['rating-request', 'rating-thanks', 'rebook', 'campaign', 'birthday']) assert.ok(!kinds.has(k), `${k} not emailed`);
});

test('the owner can turn appointment emails off; online booking then doesn’t ask for one', async () => {
  await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  assert.equal((await call('PUT', '/staff/settings', { emails: { enabled: false } })).status, 200);
  assert.equal((await call('GET', '/public/config')).json.emailRequired, false);
  const boot = (await call('GET', '/staff/bootstrap')).json;
  assert.equal(boot.settings.emails.enabled, false);
  assert.equal(boot.live.email, false);
  const r = await book('Mona', '804-555-0607', { email: '' });
  assert.equal(r.status, 200);
  assert.equal((await emails(r.clientId!)).length, 0);
  assert.equal((await call('PUT', '/staff/settings', { emails: { enabled: true } })).status, 200);
});

test('nothing is emailed before the switch from GlossGenius, even if something asks', async () => {
  const s = await settings();
  await store.put('settings', { ...s, switchover: { done: false } });
  const m = await sendEmail(store, 'nina@example.com', 'Test', 'Hello', 'booking');
  assert.equal(m.status, 'failed');
  assert.match(m.error ?? '', /switch/);
  await store.put('settings', s);
});

test('the email’s HTML escapes the words and makes links clickable', () => {
  const html = toHtml('Hi <b>Ana</b> & co\n\nBook: https://www.waxroomrichmond.com/book/?x=1&y=2');
  assert.match(html, /Hi &lt;b&gt;Ana&lt;\/b&gt; &amp; co/);
  assert.match(html, /<a href="https:\/\/www\.waxroomrichmond\.com\/book\/\?x=1&amp;y=2"/);
});
