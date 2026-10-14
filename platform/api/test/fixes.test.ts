// The booking audit's fixes, each checked against a fresh store: a membership
// switch stops the old one billing, book-again texts only while timely, one change
// at a time to a booking, the fee shown is the fee charged, deposits refunded in
// time, cards by texted link, the public form can't change a client on file, team
// texts for appointments that came from GlossGenius, offers wait out quiet hours,
// and a moved booking's reminders count from the move.
//   npx tsx --test platform/api/test/fixes.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-fix-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { runDueTexts } = await import('../src/services/notify');
const { flushOutbox } = await import('../src/services/alerts');
const { payments } = await import('../src/services/payments');
const { addDays, zoned, zonedToUtc } = await import('../src/lib/time');
const store = await makeStore();
const settings = () => store.get<any>('settings', 'settings');
// switched over, and no quiet hours unless a test sets them
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
const asOwner = () => call('POST', '/staff/login', { email: 'waxroomrichmond@gmail.com', password: 'owner-pass-123' });
const messages = async (kind: string) => (await store.list<any>('messages')).filter((m) => m.kind === kind);

function nextWeekday(n: number) {
  let day = addDays(zoned(new Date()).day, n);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
  return day;
}
/** A start time `hours` from now, on a 15-minute mark. */
const inHours = (hours: number) => new Date(Math.ceil((Date.now() + hours * 3600000) / 900000) * 900000).toISOString();

async function book(serviceName: string, phone: string, first: string, day: string, client: Record<string, unknown> = {}) {
  const cat = (await call('GET', '/public/catalog')).json;
  const service = cat.services.find((s: any) => s.name === serviceName);
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${day}`)).json;
  assert.ok(slots.length, `open times for ${serviceName} on ${day}`);
  const start = await call('POST', '/public/bookings/start', { client: { first, last: 'Test', phone, ...client } });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, start: slots[0].start });
  assert.equal(done.status, 200, JSON.stringify(done.json));
  return { ...done, service, clientId: start.json.clientId as string, slots };
}

/** The studio texts a card link; the client opens it and saves a card. */
async function cardByLink(clientId: string) {
  const r = await call('POST', `/staff/clients/${clientId}/card-link`, {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const token = new URL(r.json.link).searchParams.get('t')!;
  const setup = await call('POST', `/public/card/${token}/start`, {});
  assert.equal(setup.status, 200, JSON.stringify(setup.json));
  const saved = await call('POST', `/public/card/${token}/confirm`, { setupId: setup.json.setupId, simulatedCard: { number: '5555555555554444' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  return { token, r, saved };
}

test('a card goes on file through a texted link: nobody at the studio types it', async () => {
  await asOwner();
  const client = (await call('POST', '/staff/clients', { first: 'Cami', last: 'T', phone: '804-555-0401' })).json;
  const { token, r, saved } = await cardByLink(client.id);
  assert.equal(r.json.texted, true);
  const sent = (await messages('card-link')).find((m) => m.clientId === client.id);
  assert.match(sent.body, /\/card\/\?t=/);
  assert.equal(saved.json.card, 'Mastercard •• 4444');
  assert.equal((await store.get<any>('clients', client.id)).card.last4, '4444');
  // one card per link
  assert.equal((await call('GET', `/public/card/${token}`)).status, 404);
  // the old desk form is gone
  assert.equal((await call('POST', `/staff/clients/${client.id}/card/start`, {})).status, 404);
});

test('switching a client’s membership in the dashboard stops the old one billing', async () => {
  await asOwner();
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const [first, second] = boot.memberships.filter((m: any) => m.active);
  const client = (await call('POST', '/staff/clients', { first: 'Mira', last: 'T', phone: '804-555-0402' })).json;
  await cardByLink(client.id);
  const cancelled: string[] = [];
  const real = payments.cancelSubscription;
  payments.cancelSubscription = async (id: string) => void cancelled.push(id);
  try {
    const a = await call('POST', `/staff/clients/${client.id}/membership`, { membershipId: first.id });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    const oldSub = (await store.get<any>('clients', client.id)).membership.subscriptionId;
    assert.equal((await call('POST', `/staff/clients/${client.id}/membership`, { membershipId: first.id })).status, 400);
    const b = await call('POST', `/staff/clients/${client.id}/membership`, { membershipId: second.id });
    assert.equal(b.status, 200, JSON.stringify(b.json));
    const now = (await store.get<any>('clients', client.id)).membership;
    assert.equal(now.membershipId, second.id);
    assert.notEqual(now.subscriptionId, oldSub);
    assert.deepEqual(cancelled, [oldSub]);
  } finally {
    payments.cancelSubscription = real;
  }
});

test('the fee shown before cancelling is the fee charged, deposit included', async () => {
  // a New Client Ritual with its $10 deposit, then moved inside the 24-hour window
  const r = await book('New Client Ritual', '804-555-0403', 'Nia', nextWeekday(4));
  assert.equal(r.json.deposit, 1000);
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  await store.put('appointments', { ...appt, start: inHours(5), end: inHours(6) });
  const view = (await call('GET', `/public/booking/${appt.manageToken}`)).json;
  // 50% of the price, less the deposit already paid
  const policyFee = Math.round(appt.price * 0.5);
  assert.equal(view.cancelFee, policyFee - 1000);
  assert.equal(view.cancelDepositRefund, 0);
  const done = await call('POST', `/public/booking/${appt.manageToken}/cancel`);
  assert.equal(done.status, 200, JSON.stringify(done.json));
  const fee = (await store.list<any>('payments')).find((p) => p.appointmentId === appt.id && p.kind === 'cancel-fee');
  assert.equal(fee.amount, view.cancelFee);
  assert.equal(done.json.cancelled.fee, view.cancelFee);

  // the dashboard's numbers come from the same sums
  await asOwner();
  const b = await book('New Client Ritual', '804-555-0404', 'Oni', nextWeekday(4));
  const appt2 = (await store.list<any>('appointments')).find((a) => a.clientId === b.clientId);
  await store.put('appointments', { ...appt2, start: inHours(5), end: inHours(6) });
  const p = (await call('GET', `/staff/appointments/${encodeURIComponent(appt2.id)}/cancel-preview`)).json;
  assert.equal(p.late, true);
  assert.equal(p.cancel.fee, policyFee - 1000);
  assert.equal(p.noShow.fee, appt2.price - 1000);
  assert.equal(p.waive.fee, 0);
  assert.equal(p.waive.depositRefund, 1000);
});

test('a deposit comes back when the client cancels before the refund window, and is kept inside it', async () => {
  const r = await book('New Client Ritual', '804-555-0405', 'Pia', nextWeekday(6));
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  const view = (await call('GET', `/public/booking/${appt.manageToken}`)).json;
  assert.equal(view.cancelFee, 0);
  assert.equal(view.cancelDepositRefund, 1000);
  const refunded: [string, number | undefined][] = [];
  const real = payments.refund;
  payments.refund = async (id: string, amount?: number) => void refunded.push([id, amount]);
  try {
    const done = await call('POST', `/public/booking/${appt.manageToken}/cancel`);
    assert.equal(done.status, 200);
    assert.deepEqual(refunded, [[appt.deposit.paymentId, 1000]]);
    const after = await store.get<any>('appointments', appt.id);
    assert.equal(after.deposit.status, 'refunded');
    assert.equal(after.cancel.depositRefund, 1000);
    assert.ok((await store.list<any>('payments')).some((p) => p.kind === 'refund' && p.amount === -1000 && p.appointmentId === appt.id));
    assert.match((await messages('cancel')).find((m) => m.clientId === r.clientId).body, /\$10 deposit is being refunded/);

    // the owner moves the refund window out to 10 days: a booking 6 days off keeps its deposit
    await asOwner();
    assert.equal((await call('PUT', '/staff/settings', { policies: { depositRefundHours: 240 } })).status, 200);
    const k = await book('New Client Ritual', '804-555-0406', 'Quin', nextWeekday(6));
    const kept = (await store.list<any>('appointments')).find((a) => a.clientId === k.clientId);
    const v2 = (await call('GET', `/public/booking/${kept.manageToken}`)).json;
    assert.equal(v2.cancelDepositRefund, 0);
    assert.equal(v2.cancelDepositKept, 1000);
    assert.equal(v2.refundHours, 240);
    refunded.length = 0;
    await call('POST', `/public/booking/${kept.manageToken}/cancel`);
    assert.deepEqual(refunded, []);
    assert.equal((await store.get<any>('appointments', kept.id)).deposit.status, 'applied');
  } finally {
    payments.refund = real;
    await asOwner();
    await call('PUT', '/staff/settings', { policies: { depositRefundHours: 24 } });
  }
});

test('the website form can’t change a client already on file: a STOP stays a STOP', async () => {
  const { handleInbound } = await import('../src/services/notify');
  const r = await book('Bikini', '804-555-0407', 'Rae', nextWeekday(7));
  await handleInbound(store, '+18045550407', 'STOP');
  // someone books with that number again, with reminders and offers ticked
  await book('Bikini', '804-555-0407', 'Someone', nextWeekday(8), { smsReminders: true, smsMarketing: true, email: 'other@example.com' });
  const c = await store.get<any>('clients', r.clientId);
  assert.equal(c.smsReminders, false);
  assert.equal(c.smsMarketing, false);
  assert.equal(c.first, 'Rae');
  // and the desk adding "a new client" with that number changes nothing either
  await asOwner();
  const dup = await call('POST', '/staff/clients', { first: 'Other', last: 'Person', phone: '804-555-0407', smsMarketing: true });
  assert.equal(dup.status, 400);
  assert.doesNotMatch(dup.json.error, /Rae/);
  assert.equal((await store.get<any>('clients', r.clientId)).smsMarketing, false);
});

test('two changes to one booking at the same moment: one wins, and the booking stays whole', async () => {
  await asOwner();
  const boot = (await call('GET', '/staff/bootstrap')).json;
  const r = await book('Lip Wax', '804-555-0408', 'Sol', nextWeekday(9));
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  const service = boot.services.find((s: any) => s.id === appt.serviceId);
  const days = [nextWeekday(10), nextWeekday(11)];
  const clientSlot = (await call('GET', `/public/availability?service=${service.id}&day=${days[0]}&staff=${appt.staffId}`)).json[0].start;
  const staffSlot = (await call('GET', `/staff/availability?service=${service.id}&day=${days[1]}&staff=${appt.staffId}`)).json[0].start;
  const results = await Promise.all([
    call('POST', `/public/booking/${appt.manageToken}/reschedule`, { start: clientSlot }),
    call('POST', `/staff/appointments/${encodeURIComponent(appt.id)}/move`, { start: staffSlot }),
  ]);
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  const live = (await store.list<any>('appointments')).filter((a) => a.manageToken === appt.manageToken);
  assert.equal(live.length, 1);

  // a cancel and a move at once: whichever lands first, the other is refused
  const cur = live[0];
  const another = (await call('GET', `/staff/availability?service=${service.id}&day=${nextWeekday(12)}&staff=${cur.staffId}`)).json[0].start;
  const both = await Promise.all([
    call('POST', `/public/booking/${cur.manageToken}/cancel`),
    call('POST', `/staff/appointments/${encodeURIComponent(cur.id)}/move`, { start: another }),
  ]);
  // the loser is told the booking changed (409) or can't be changed any more (400)
  assert.equal(both.filter((x) => x.status === 200).length, 1, JSON.stringify(both.map((x) => x.json)));
  assert.ok(both.every((x) => x.status === 200 || x.status === 400 || x.status === 409));
  const after = (await store.list<any>('appointments')).filter((a) => a.manageToken === cur.manageToken);
  assert.equal(after.length, 1);
  if (both[0].status === 200) assert.equal(after[0].status, 'cancelled');
  else assert.equal(after[0].start, another);
});

test('the team hears about changes to appointments that came from GlossGenius', async () => {
  await asOwner();
  const boot = (await call('GET', '/staff/bootstrap')).json;
  await call('PATCH', `/staff/team/${boot.me.id}`, { phone: '804-555-0901' });
  const brazilian = boot.services.find((s: any) => s.name === 'Brazilian');
  const client = (await call('POST', '/staff/clients', { first: 'Tess', last: 'T', phone: '804-555-0409' })).json;
  const start = inHours(24 * 5);
  const appt = { id: `${start}_imp1`, clientId: client.id, staffId: boot.me.id, serviceId: brazilian.id, start, end: new Date(Date.parse(start) + 30 * 60000).toISOString(), status: 'booked', price: 6500, source: 'import', notes: '', manageToken: 'importtoken01', createdAt: new Date().toISOString(), newClient: false, texts: {} };
  await store.put('appointments', appt);
  await store.put('tokens', { id: appt.manageToken, appointmentId: appt.id });
  const before = (await messages('alert')).length;
  assert.equal((await call('POST', `/public/booking/${appt.manageToken}/cancel`)).status, 200);
  const alerts = (await messages('alert')).slice(before);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /Cancelled: Tess T\., Brazilian/);
});

test('offers and desk-made texts wait out quiet hours; an opt-out overnight drops them', async () => {
  await asOwner();
  const s = await settings();
  const hour = zoned(new Date(), s.timezone).hour;
  // quiet right now, for the next two hours
  assert.equal((await call('PUT', '/staff/settings', { notifications: { quietStart: hour, quietEnd: (hour + 2) % 24 } })).status, 200);
  try {
    const keep = (await call('POST', '/staff/clients', { first: 'Uma', last: 'T', phone: '804-555-0410', smsMarketing: true })).json;
    const drop = (await call('POST', '/staff/clients', { first: 'Val', last: 'T', phone: '804-555-0411', smsMarketing: true })).json;
    const sentBefore = (await messages('campaign')).length;
    const r = await call('POST', '/staff/campaigns', { audience: 'all', body: 'Hi {first}, a treat this week.' });
    assert.equal(r.status, 200);
    assert.equal(r.json.sent, 0);
    assert.ok(r.json.queued >= 2);
    assert.equal((await messages('campaign')).length, sentBefore);
    // a booking made at the desk now: its confirmation waits too
    const boot = (await call('GET', '/staff/bootstrap')).json;
    const lip = boot.services.find((x: any) => x.name === 'Lip Wax');
    const slot = (await call('GET', `/staff/availability?service=${lip.id}&day=${nextWeekday(13)}&staff=${boot.me.id}`)).json[0].start;
    assert.equal((await call('POST', '/staff/appointments', { clientId: keep.id, serviceId: lip.id, staffId: boot.me.id, start: slot })).status, 200);
    assert.equal((await messages('booking')).filter((m) => m.clientId === keep.id).length, 0);
    // Val replies STOP overnight
    await store.put('clients', { ...(await store.get<any>('clients', drop.id)), smsReminders: false });
    await flushOutbox(store, new Date(Date.now() + 3 * 3600000));
    const campaign = await messages('campaign');
    assert.ok(campaign.some((m) => m.clientId === keep.id && m.body.includes('Hi Uma')));
    assert.ok(!campaign.some((m) => m.clientId === drop.id));
    assert.equal((await messages('booking')).filter((m) => m.clientId === keep.id).length, 1);
    assert.equal((await store.list<any>('outbox')).length, 0);
  } finally {
    await call('PUT', '/staff/settings', { notifications: { quietStart: 0, quietEnd: 0 } });
  }
});

test('a booking moved into the reminder window isn’t sent a reminder on top of the “moved” text', async () => {
  await asOwner();
  const r = await book('Underarm', '804-555-0412', 'Wren', nextWeekday(9));
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  const moved = await call('POST', `/staff/appointments/${encodeURIComponent(appt.id)}/move`, { start: inHours(20) });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.ok(moved.json.movedAt);
  await runDueTexts(store, new Date());
  const mine = (await store.list<any>('messages')).filter((m) => m.clientId === r.clientId);
  assert.equal(mine.filter((m) => m.kind === 'moved').length, 1);
  assert.equal(mine.filter((m) => m.kind === 'reminder' || m.kind === 'confirm-request').length, 0);
});

test('book-again texts: on per service, timely only, with the real time since the visit', async () => {
  await asOwner();
  const services = await store.list<any>('services');
  const brazilian = services.find((s) => s.name === 'Brazilian');
  assert.ok(!brazilian.rebookText); // off until the owner turns it on
  assert.equal((await call('PUT', '/staff/rebook-texts', { services: [{ id: brazilian.id, on: true, days: 28 }] })).status, 200);
  const owner = (await call('GET', '/staff/bootstrap')).json.me;
  async function visited(first: string, phone: string, daysAgo: number) {
    const c = (await call('POST', '/staff/clients', { first, last: 'T', phone })).json;
    const end = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const start = new Date(Date.parse(end) - 30 * 60000).toISOString();
    await store.put('appointments', { id: `${start}_v${first}`, clientId: c.id, staffId: owner.id, serviceId: brazilian.id, start, end, status: 'completed', price: 6500, source: 'import', notes: '', manageToken: `t${first}`, createdAt: start, newClient: false, texts: {} });
    await store.put('clients', { ...(await store.get<any>('clients', c.id)), lastVisitAt: end });
    return c.id as string;
  }
  const recent = await visited('Xena', '804-555-0413', 31);
  const lapsed = await visited('Yara', '804-555-0414', 730);
  const tenAm = zonedToUtc(zoned(new Date()).day, 10 * 60 + 5);
  await runDueTexts(store, tenAm);
  const sent = await messages('rebook');
  const x = sent.find((m) => m.clientId === recent);
  assert.ok(x, 'the client due 3 days ago gets the text');
  assert.match(x.body, /about 4 weeks since your Brazilian/);
  assert.ok(!sent.some((m) => m.clientId === lapsed), 'a visit two years ago gets nothing');
});

test('the owner sets when the reminder and the confirmation request go out', async () => {
  await asOwner();
  assert.equal((await call('PUT', '/staff/settings', { notifications: { reminderHoursBefore: 0 } })).status, 400);
  assert.equal((await call('PUT', '/staff/settings', { notifications: { reminderHoursBefore: 48, confirmHoursBefore: 48 } })).status, 400);
  const ok = await call('PUT', '/staff/settings', { notifications: { reminderHoursBefore: 48, confirmHoursBefore: 96 } });
  assert.equal(ok.status, 200);
  assert.equal((await settings()).notifications.reminderHoursBefore, 48);
  // a booking 40 hours out, made a week ago, now gets its reminder
  const r = await book('Chin', '804-555-0415', 'Zia', nextWeekday(10));
  const appt = (await store.list<any>('appointments')).find((a) => a.clientId === r.clientId);
  await store.put('appointments', { ...appt, createdAt: new Date(Date.now() - 7 * 86400000).toISOString() });
  const at = new Date(Date.parse(appt.start) - 40 * 3600000);
  await runDueTexts(store, at);
  assert.equal((await store.list<any>('messages')).filter((m) => m.clientId === r.clientId && m.kind === 'reminder').length, 1);
  await call('PUT', '/staff/settings', { notifications: { reminderHoursBefore: 24, confirmHoursBefore: 72 } });
});
