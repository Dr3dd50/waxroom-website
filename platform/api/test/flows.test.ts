// End-to-end checks of the main workflows against a fresh store (no sample data):
// online booking with a saved card and deposit, the referral discount and credit,
// checkout with membership and credit, late cancellation and no-show fees,
// client replies, the timed reminder, and what employees can see.
//   npx tsx --test platform/api/test/flows.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { runDueTexts } = await import('../src/services/notify');
const { addDays, zoned, zonedToUtc } = await import('../src/lib/time');
const store = await makeStore();
const app = makeApp(store);

let cookie = '';
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, json: json as any };
}

// A weekday a few days out, so lead time and quiet hours don't get in the way.
function nextWeekday(n: number) {
  let day = addDays(zoned(new Date()).day, n);
  while ([0].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) day = addDays(day, 1);
  return day;
}

async function book(serviceName: string, phone: string, first: string, day: string, extra: Record<string, unknown> = {}) {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === serviceName);
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${day}`)).json;
  assert.ok(slots.length, `open times for ${serviceName} on ${day}`);
  const start = await call('POST', '/public/bookings/start', { client: { first, last: 'Test', phone, email: `${first}@example.com`, smsReminders: true } });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, start: slots[0].start, ...extra });
  return { ...done, service, clientId: start.json.clientId, slot: slots[0] };
}

test('online booking saves a card, takes the new-client deposit and texts a confirmation', async () => {
  const r = await book('New Client Ritual', '804-555-0101', 'Amara', nextWeekday(3));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.deposit, 1000);
  assert.equal(r.json.card, 'Visa •• 4242');
  const msgs = await store.list<any>('messages');
  assert.ok(msgs.some((m) => m.kind === 'booking' && m.body.includes('Amara')));
});

test('the same time can’t be booked twice', async () => {
  const day = nextWeekday(4);
  const a = await book('Brazilian', '804-555-0102', 'Bria', day);
  assert.equal(a.status, 200);
  const start = await call('POST', '/public/bookings/start', { client: { first: 'Cara', last: 'T', phone: '804-555-0103' } });
  const again = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, serviceId: a.service.id, staffId: a.json.staffId, start: a.slot.start });
  assert.equal(again.status, 409);
});

test('referral: friend gets money off the first visit, referrer gets credit after checkout', async () => {
  const day = nextWeekday(5);
  const referrer = await book('Lip Wax', '804-555-0104', 'Dana', day);
  const code = (await store.get<any>('clients', referrer.clientId)).referralCode;
  const friend = await book('Brazilian', '804-555-0105', 'Erin', day, { referralCode: code });
  assert.equal(friend.status, 200, JSON.stringify(friend.json));
  assert.equal(friend.json.referralDiscount, 1000);

  assert.equal((await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' })).status, 200);
  const appts = (await call('GET', `/staff/appointments?from=${day}&to=${day}`)).json.appointments;
  const fa = appts.find((a: any) => a.clientId === friend.clientId);
  const q = (await call('GET', `/staff/appointments/${encodeURIComponent(fa.id)}/quote`)).json;
  assert.equal(q.due, 6500 - 1000);
  const co = await call('POST', `/staff/appointments/${encodeURIComponent(fa.id)}/checkout`, { tip: 1300, method: 'card', useCredit: true, useMembership: true });
  assert.equal(co.status, 200, JSON.stringify(co.json));
  assert.equal(co.json.checkout.total, 5500 + 1300);
  const ref = await store.get<any>('clients', referrer.clientId);
  assert.equal(ref.credit, 1000);
  const refs = await store.list<any>('referrals');
  assert.equal(refs[0].status, 'completed');
  // the referrer's credit comes off their own checkout
  const ra = appts.find((a: any) => a.clientId === referrer.clientId);
  const q2 = (await call('GET', `/staff/appointments/${encodeURIComponent(ra.id)}/quote`)).json;
  assert.equal(q2.due, 1200 - 1000);
});

test('late cancellation charges the policy fee; no-show charges in full; staff can waive', async () => {
  const day = zoned(new Date()).day;
  // staff book an appointment two hours from now (inside the 24-hour window)
  const login = await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const brazilian = boot.services.find((s: any) => s.name === 'Brazilian');
  const owner = login.json.id;
  const soon = new Date(Math.ceil((Date.now() + 2 * 3600000) / 900000) * 900000).toISOString();
  const client = (await call('POST', '/staff/clients', { first: 'Fay', last: 'T', phone: '804-555-0106' })).json;
  await call('POST', `/staff/clients/${client.id}/card/start`, {});
  await call('POST', `/staff/clients/${client.id}/card/confirm`, { setupId: 'x', simulatedCard: { number: '5555555555554444' } });
  const a = await call('POST', '/staff/appointments', { clientId: client.id, serviceId: brazilian.id, staffId: owner, start: soon });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  const t = (await store.get<any>('appointments', a.json.id)).manageToken;
  const view = (await call('GET', `/public/booking/${t}`)).json;
  assert.equal(view.cancelFee, 3250);
  const cancelled = await call('POST', `/public/booking/${t}/cancel`);
  assert.equal(cancelled.json.status, 'cancelled');
  const fees = (await store.list<any>('payments')).filter((p) => p.kind === 'cancel-fee');
  assert.equal(fees[0].amount, 3250);

  const b = await call('POST', '/staff/appointments', { clientId: client.id, serviceId: brazilian.id, staffId: owner, start: soon });
  const ns = await call('POST', `/staff/appointments/${encodeURIComponent(b.json.id)}/cancel`, { noShow: true });
  assert.equal(ns.json.cancel.fee, 6500);
  const c2 = await call('POST', '/staff/appointments', { clientId: client.id, serviceId: brazilian.id, staffId: owner, start: soon });
  const waived = await call('POST', `/staff/appointments/${encodeURIComponent(c2.json.id)}/cancel`, { waive: true });
  assert.equal(waived.json.cancel.feeStatus, 'waived');
  void day;
});

test('membership covers its included visits, then charges normally', async () => {
  await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const cookieClub = boot.memberships.find((m: any) => m.name === 'Monthly Cookie Club');
  const join = await call('POST', `/public/memberships/${cookieClub.id}/start`, { client: { first: 'Gia', last: 'T', phone: '804-555-0107' } });
  const joined = await call('POST', `/public/memberships/${cookieClub.id}/confirm`, { clientId: join.json.clientId, setupId: join.json.setupId, simulatedCard: { number: '4242424242424242' } });
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  const brazilian = boot.services.find((s: any) => s.name === 'Brazilian');
  const day = nextWeekday(6);
  const slots = (await call('GET', `/staff/availability?service=${brazilian.id}&day=${day}&staff=${boot.me.id}`)).json;
  const a1 = (await call('POST', '/staff/appointments', { clientId: join.json.clientId, serviceId: brazilian.id, staffId: boot.me.id, start: slots[0].start })).json;
  const q1 = (await call('GET', `/staff/appointments/${encodeURIComponent(a1.id)}/quote`)).json;
  assert.equal(q1.due, 0);
  await call('POST', `/staff/appointments/${encodeURIComponent(a1.id)}/checkout`, { tip: 0, method: 'card', useCredit: false, useMembership: true });
  const a2 = (await call('POST', '/staff/appointments', { clientId: join.json.clientId, serviceId: brazilian.id, staffId: boot.me.id, start: slots[8].start })).json;
  const q2 = (await call('GET', `/staff/appointments/${encodeURIComponent(a2.id)}/quote`)).json;
  assert.equal(q2.due, 6500);
});

test('replying C confirms; STOP turns texts off', async () => {
  const { handleInbound } = await import('../src/services/notify');
  const r = await book('Bikini', '804-555-0108', 'Hana', nextWeekday(7));
  await handleInbound(store, '+18045550108', 'c');
  const appts = await store.list<any>('appointments');
  assert.equal(appts.find((a) => a.clientId === r.clientId).status, 'confirmed');
  await handleInbound(store, '+18045550108', 'STOP');
  assert.equal((await store.get<any>('clients', r.clientId)).smsReminders, false);
});

test('reminder goes out 24 hours before, once, outside quiet hours', async () => {
  const r = await book('Underarm', '804-555-0109', 'Ivy', nextWeekday(8));
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  // pretend it's 11am the day before
  const before = zonedToUtc(addDays(zoned(appt.start).day, -1), 11 * 60);
  if (Date.parse(appt.start) - before.getTime() > 24 * 3600000) before.setTime(Date.parse(appt.start) - 23 * 3600000);
  const local = zoned(before);
  if (local.hour < 9 || local.hour >= 21) before.setTime(zonedToUtc(local.day, 12 * 60).getTime());
  await runDueTexts(store, before);
  await runDueTexts(store, before);
  const reminders = (await store.list<any>('messages')).filter((m) => m.kind === 'reminder' && m.clientId === r.clientId);
  assert.equal(reminders.length, 1);
});

test('employees only see their own calendar and can’t open owner pages', async () => {
  const owner = await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const other = boot.staff.find((s: any) => s.role === 'employee' && s.bookable);
  await call('PATCH', `/staff/team/${other.id}`, { email: 'nyeesha@example.com', password: 'employee-pass' });
  await call('POST', '/staff/logout');
  cookie = '';
  assert.equal((await call('POST', '/staff/login', { email: 'nyeesha@example.com', password: 'employee-pass' })).status, 200);
  const day = nextWeekday(4);
  const list = (await call('GET', `/staff/appointments?from=${day}&to=${addDays(day, 10)}`)).json.appointments;
  assert.ok(list.every((a: any) => a.staffId === other.id));
  assert.equal((await call('GET', '/staff/payments')).status, 403);
  assert.equal((await call('PUT', '/staff/settings', {})).status, 403);
  void owner;
});

test('a package is paid once and covers its visits at checkout', async () => {
  await call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const bundle = boot.packages.find((p: any) => p.name === 'Brazilian Bundle');
  const s = await call('POST', `/public/packages/${bundle.id}/start`, { client: { first: 'Jo', last: 'T', phone: '804-555-0110' } });
  const bought = await call('POST', `/public/packages/${bundle.id}/confirm`, { clientId: s.json.clientId, setupId: s.json.setupId });
  assert.equal(bought.status, 200, JSON.stringify(bought.json));
  const brazilian = boot.services.find((x: any) => x.name === 'Brazilian');
  const day = nextWeekday(9);
  const slots = (await call('GET', `/staff/availability?service=${brazilian.id}&day=${day}&staff=${boot.me.id}`)).json;
  const a = (await call('POST', '/staff/appointments', { clientId: s.json.clientId, serviceId: brazilian.id, staffId: boot.me.id, start: slots[0].start })).json;
  const q = (await call('GET', `/staff/appointments/${encodeURIComponent(a.id)}/quote`)).json;
  assert.equal(q.due, 0);
  await call('POST', `/staff/appointments/${encodeURIComponent(a.id)}/checkout`, { tip: 1000, method: 'card', useCredit: false, useMembership: true });
  const client = await store.get<any>('clients', s.json.clientId);
  assert.equal(client.packages[0].remaining[brazilian.id], 2);
});
