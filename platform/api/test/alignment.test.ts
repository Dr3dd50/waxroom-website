// Keeping bookings, texts and calendars in step while GlossGenius and our own
// booking both run: the import and the gate in front of online booking, staff
// texts, the client's calendar file, follow-ups per service, what employees see of
// client contact details, and a deposit the client's bank asks them to approve.
//   npx tsx --test platform/api/test/alignment.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-align-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const { runDueTexts } = await import('../src/services/notify');
const { flushOutbox } = await import('../src/services/alerts');
const { releaseUnpaidHolds } = await import('../src/services/appointments');
const { addDays, zoned, zonedToUtc } = await import('../src/lib/time');
const store = await makeStore();
const app = makeApp(store);

let cookie = '';
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, json: json as any, type: res.headers.get('content-type') };
}
const login = async (email: string, password: string) => {
  cookie = '';
  const r = await call('POST', '/staff/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
};
const asOwner = () => login('waxroomrichmond@gmail.com', 'owner-pass-123');
const settings = () => store.get<any>('settings', 'settings');
async function setNotifications(n: Record<string, number>) {
  const s = await settings();
  await store.put('settings', { ...s, notifications: { ...s.notifications, ...n } });
}
const NEVER_QUIET = { quietStart: 0, quietEnd: 0 };

function nextWeekday(n: number) {
  let day = addDays(zoned(new Date()).day, n);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
  return day;
}
const usDate = (day: string) => `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;
const today = zoned(new Date()).day;

async function bookOnline(service: any, phone: string, first: string, day: string, opts: { card?: string; staffId?: string } = {}) {
  const slots = (await call('GET', `/public/availability?service=${service.id}&day=${day}${opts.staffId ? `&staff=${opts.staffId}` : ''}`)).json;
  assert.ok(slots.length, `open times for ${service.name} on ${day}`);
  const start = await call('POST', '/public/bookings/start', { client: { first, last: 'Test', phone, email: `${first}@example.com` } });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const done = await call('POST', '/public/bookings/confirm', { clientId: start.json.clientId, setupId: start.json.setupId, simulatedCard: { number: opts.card ?? '4242424242424242' }, serviceId: service.id, staffId: opts.staffId, start: slots[0].start });
  return { ...done, clientId: start.json.clientId as string, slot: slots[0] };
}

let boot: any, cat: any, nyeesha: any;
const svc = (name: string) => cat.services.find((s: any) => s.name === name);

const futureDay = nextWeekday(5);
const clientsCsv = ['First Name,Last Name,Phone,Email,Birthday,Banned', 'Rena,Brooks,(804) 555-0301,rena@example.com,3/4/1990,false', 'Tia,Moss,804-555-0302,,,', 'Lou,Lash,804.555.0303,,,', 'Ban,Ned,804-555-0399,,,true'].join('\n');
const apptCsv = (status: string) =>
  [
    'Client,Phone,Service,Staff,Date,Time,Status,Price',
    `Rena Brooks,8045550301,Brazilian,Danielle W,${usDate(futureDay)},11:00 AM,${status},$65`,
    `Tia Moss,8045550302,Eyebrow Wax,Danielle W,${usDate(addDays(today, -22))},10:00 AM,Completed,$20`,
    `Lou Lash,8045550303,1 Week Fill,Danielle W,${usDate(addDays(today, -10))},10:00 AM,Completed,$45`,
    `Nobody Known,8045550000,Brazilian,Danielle W,${usDate(futureDay)},1:00 PM,Booked,$65`,
  ].join('\n');

test('before the switch nothing here books, texts or charges, and GlossGenius imports come in', async () => {
  cat = (await call('GET', '/public/catalog')).json;
  assert.equal((await call('GET', '/public/config')).json.booking, 'closed');
  assert.equal((await call('POST', '/public/bookings/start', { client: { first: 'Early', last: 'Bird', phone: '804-555-0300' } })).status, 403);

  await asOwner();
  boot = (await call('GET', '/staff/bootstrap')).json;
  nyeesha = boot.staff.find((s: any) => s.short === 'Nyeesha');
  assert.deepEqual((await call('GET', '/staff/switchover')).json.blockers, ['Import the GlossGenius clients.', 'Import the GlossGenius appointments.']);
  // check the files first: nothing is saved
  const dry = await call('POST', '/staff/import/glossgenius', { clients: clientsCsv, appointments: apptCsv('Booked'), dryRun: true });
  assert.equal(dry.status, 200);
  assert.deepEqual(dry.json.report.clients, { added: 3, matched: 0, skipped: 1 });
  assert.equal((await store.list<any>('clients')).length, 0);
  const imp = (await call('POST', '/staff/import/glossgenius', { clients: clientsCsv, appointments: apptCsv('Booked') })).json.report;
  assert.equal(imp.appointments.added, 3);
  assert.equal(imp.appointments.unmatched, 1);
  assert.match(imp.appointments.problems[0], /Nobody Known/);
  assert.deepEqual((await call('GET', '/staff/switchover')).json.blockers, []);

  // the desk can't book, text, or run the timed texts here yet
  const rena = (await store.list<any>('clients')).find((c: any) => c.first === 'Rena');
  const day = nextWeekday(4);
  assert.equal((await call('POST', '/staff/appointments', { clientId: rena.id, serviceId: svc('Bikini').id, staffId: boot.me.id, start: zonedToUtc(day, 10 * 60).toISOString() })).status, 409);
  assert.equal((await call('POST', `/staff/clients/${rena.id}/text`, { body: 'hi' })).status, 409);
  assert.equal((await call('POST', `/staff/clients/${rena.id}/card-link`, {})).status, 409);
  assert.equal((await call('POST', '/staff/campaigns', { audience: 'all', body: 'Sale' })).status, 409);
  assert.equal((await call('POST', '/staff/run-texts', {})).status, 409);
  const imported = (await store.list<any>('appointments')).find((a: any) => a.source === 'import' && a.status === 'booked');
  await setNotifications(NEVER_QUIET);
  assert.equal((await runDueTexts(store, new Date(Date.parse(imported.start) - 23 * 3600000))).sent, 0);
  // and a text that slipped through anyway would not go out
  const { sendText } = await import('../src/services/sms');
  const m = await sendText(store, '+18045550301', 'test', 'staff');
  assert.equal(m.status, 'failed');
  assert.match(m.error ?? '', /switch from GlossGenius/);
  // a STOP still counts
  const { handleInbound } = await import('../src/services/notify');
  await handleInbound(store, '+18045550301', 'STOP');
  assert.equal((await store.get<any>('clients', rena.id)).smsReminders, false);
  assert.ok(!(await store.list<any>('messages')).some((x: any) => x.direction === 'out' && x.status !== 'failed'));
});

test('a GlossGenius booking blocks that time here and follows a later export; then the switch', async () => {
  const owner = boot.staff.find((s: any) => s.role === 'owner');
  const slots = (await call('GET', `/public/availability?service=${svc('Brazilian').id}&day=${futureDay}&staff=${owner.id}`)).json;
  const eleven = zonedToUtc(futureDay, 11 * 60).toISOString();
  assert.ok(!slots.some((s: any) => s.start === eleven), '11:00 is taken by the imported booking');
  const imported = (await store.list<any>('appointments')).find((a: any) => a.source === 'import' && a.start === eleven);
  assert.equal((await call('POST', `/staff/appointments/${encodeURIComponent(imported.id)}/move`, { start: zonedToUtc(futureDay, 14 * 60).toISOString() })).status, 409);

  // cancelled on GlossGenius: the next import frees the time, without duplicates
  const again = (await call('POST', '/staff/import/glossgenius', { clients: clientsCsv, appointments: apptCsv('Cancelled') })).json.report;
  assert.deepEqual([again.clients.added, again.appointments.added, again.appointments.updated], [0, 0, 1]);
  assert.equal((await store.get<any>('appointments', imported.id)).status, 'cancelled');
  const after = (await call('GET', `/public/availability?service=${svc('Brazilian').id}&day=${futureDay}&staff=${owner.id}`)).json;
  assert.ok(after.some((s: any) => s.start === eleven));

  // the switch needs GlossGenius's own online booking turned off first
  assert.equal((await call('POST', '/staff/switchover', { done: true })).status, 400);
  assert.equal((await call('POST', '/staff/switchover', { done: true, glossGeniusOff: true })).status, 200);
  assert.equal((await call('GET', '/public/config')).json.booking, 'open');
  // and after it, nothing more comes in from GlossGenius
  assert.equal((await call('POST', '/staff/import/glossgenius', { appointments: apptCsv('Booked') })).status, 409);
});

test('two people booking the same time at the same moment: only one gets it', async () => {
  const service = svc('Bikini');
  const day = nextWeekday(15);
  const owner = boot.staff.find((s: any) => s.role === 'owner');
  const slot = (await call('GET', `/public/availability?service=${service.id}&day=${day}&staff=${owner.id}`)).json[0];
  const starts = await Promise.all(
    ['804-555-0320', '804-555-0321', '804-555-0322'].map((phone, i) => call('POST', '/public/bookings/start', { client: { first: `Racer${i}`, last: 'Test', phone, email: `racer${i}@example.com` } })),
  );
  const results = await Promise.all(
    starts.map((st) =>
      call('POST', '/public/bookings/confirm', { clientId: st.json.clientId, setupId: st.json.setupId, simulatedCard: { number: '4242424242424242' }, serviceId: service.id, staffId: owner.id, start: slot.start }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
  const live = (await store.list<any>('appointments')).filter((a: any) => a.start === slot.start && a.staffId === owner.id && a.status !== 'cancelled');
  assert.equal(live.length, 1);
});

test('book-again texts: off until the owner turns them on, then after each service’s own interval', async () => {
  const s = await settings();
  const tenAm = zonedToUtc(today, 10 * 60 + 5);
  // off for every service to start with
  await runDueTexts(store, tenAm);
  assert.equal((await store.list<any>('messages')).filter((m: any) => m.kind === 'rebook').length, 0);
  const tia0 = (await store.list<any>('clients')).find((c: any) => c.first === 'Tia');
  assert.equal(tia0.rebookNudgedFor, undefined);
  await asOwner();
  const services = await store.list<any>('services');
  const id = (name: string) => services.find((x: any) => x.name === name).id;
  // a timing has to make sense before it can be on
  assert.equal((await call('PUT', '/staff/rebook-texts', { services: [{ id: id('Eyebrow Wax'), on: true, days: 0 }] })).status, 400);
  const on = await call('PUT', '/staff/rebook-texts', { services: [{ id: id('Eyebrow Wax'), on: true, days: 21 }, { id: id('1 Week Fill'), on: true, days: 14 }] });
  assert.equal(on.status, 200);
  await runDueTexts(store, tenAm);
  const nudges = (await store.list<any>('messages')).filter((m: any) => m.kind === 'rebook');
  const tia = (await store.list<any>('clients')).find((c: any) => c.first === 'Tia');
  // brow wax: 21 days; it's been 22
  assert.equal(nudges.length, 1, JSON.stringify(nudges));
  assert.equal(nudges[0].clientId, tia.id);
  assert.match(nudges[0].body, /3 weeks since your Eyebrow Wax/);
  assert.match(nudges[0].body, /\/book\/\?service=Eyebrow%20Wax/);
  // the lash fill (14 days) isn't due yet; it will be in 5 days
  await runDueTexts(store, zonedToUtc(addDays(today, 5), 10 * 60 + 5));
  assert.equal((await store.list<any>('messages')).filter((m: any) => m.kind === 'rebook').length, 2);
  void s;
});

test('the team gets a text for bookings, moves and cancellations, without client numbers', async () => {
  await asOwner();
  const owner = boot.me;
  await call('PATCH', `/staff/team/${owner.id}`, { phone: '804-555-0901' });
  await call('PATCH', `/staff/team/${nyeesha.id}`, { phone: '804-555-0902', email: 'nyeesha@example.com', password: 'employee-pass' });
  const service = cat.services.find((s: any) => s.staffIds.includes(nyeesha.id) && !s.deposit && s.category === 'Intimate Waxing');
  const before = (await store.list<any>('messages')).length;
  const r = await bookOnline(service, '804-555-0310', 'Alexa', nextWeekday(6), { staffId: nyeesha.id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const alerts = (await store.list<any>('messages')).slice(before).filter((m: any) => m.kind === 'alert');
  assert.deepEqual(alerts.map((m: any) => m.to).sort(), ['+18045550901', '+18045550902']);
  assert.match(alerts[0].body, /^New booking: Alexa T\., .* with Nyeesha\. Booked online\.$/);
  assert.ok(!alerts.some((m: any) => m.body.includes('555-0310') || m.body.includes('5550310')));

  // Nyeesha cancels her own: only the owner hears about it
  await login('nyeesha@example.com', 'employee-pass');
  const appt = (await store.list<any>('appointments')).find((a: any) => a.clientId === r.clientId);
  const n = (await store.list<any>('messages')).length;
  assert.equal((await call('POST', `/staff/appointments/${encodeURIComponent(appt.id)}/cancel`, {})).status, 200);
  const cancelAlerts = (await store.list<any>('messages')).slice(n).filter((m: any) => m.kind === 'alert');
  assert.deepEqual(cancelAlerts.map((m: any) => m.to), ['+18045550901']);
  assert.match(cancelAlerts[0].body, /^Cancelled: Alexa T\., .*Cancelled by Nyeesha\./);
});

test('in quiet hours the team’s texts wait until morning', async () => {
  const hour = zoned(new Date()).hour;
  await setNotifications({ quietStart: hour, quietEnd: (hour + 1) % 24 });
  const service = cat.services.find((s: any) => s.staffIds.includes(nyeesha.id) && !s.deposit && s.category === 'Intimate Waxing');
  const before = (await store.list<any>('messages')).filter((m: any) => m.kind === 'alert').length;
  const r = await bookOnline(service, '804-555-0311', 'Quinn', nextWeekday(7), { staffId: nyeesha.id });
  assert.equal(r.status, 200);
  assert.equal((await store.list<any>('outbox')).length, 2);
  assert.equal((await store.list<any>('messages')).filter((m: any) => m.kind === 'alert').length, before);
  // still quiet: nothing goes; once the hour is over, both go
  assert.equal(await flushOutbox(store, new Date()), 0);
  assert.equal(await flushOutbox(store, new Date(Date.now() + 3600000)), 2);
  assert.equal((await store.list<any>('outbox')).length, 0);
  await setNotifications(NEVER_QUIET);
});

test('the client’s calendar file follows the booking through a move and a cancellation', async () => {
  const service = svc('Bikini');
  const r = await bookOnline(service, '804-555-0312', 'Cal', nextWeekday(9));
  const booked = (await store.list<any>('messages')).find((m: any) => m.kind === 'booking' && m.clientId === r.clientId);
  const link = booked.body.match(/(\S+\/api\/cal\/\S+)/)[1];
  const token = link.split('/').pop();
  const ics = await call('GET', `/cal/${token}`);
  assert.match(ics.type ?? '', /text\/calendar/);
  assert.match(ics.json, new RegExp(`UID:${token}@waxroomrichmond.com`));
  assert.match(ics.json, /SEQUENCE:0/);
  assert.match(ics.json, /STATUS:CONFIRMED/);

  const later = (await call('GET', `/public/availability?service=${service.id}&day=${nextWeekday(10)}`)).json;
  const moved = await call('POST', `/public/booking/${token}/reschedule`, { start: later[2].start });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.ok((await store.list<any>('messages')).some((m: any) => m.kind === 'moved' && m.clientId === r.clientId && m.body.includes(`/api/cal/${token}`)));
  const ics2 = (await call('GET', `/cal/${token}`)).json;
  assert.match(ics2, /SEQUENCE:1/);
  assert.match(ics2, new RegExp(`DTSTART:${later[2].start.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`));

  assert.equal((await call('POST', `/public/booking/${token}/cancel`)).status, 200);
  assert.match((await call('GET', `/cal/${token}`)).json, /STATUS:CANCELLED/);
});

test('employees see client phone numbers and emails only when the owner allows it', async () => {
  await login('nyeesha@example.com', 'employee-pass');
  let list = (await call('GET', '/staff/clients')).json;
  assert.ok(list.length > 0);
  assert.ok(list.every((c: any) => c.phone === '' && c.email === '' && c.contactHidden));
  const day = (await call('GET', `/staff/appointments?from=${nextWeekday(6)}&to=${addDays(nextWeekday(6), 3)}`)).json;
  assert.ok(day.clients.every((c: any) => c.phone === ''));
  // saving a client with the hidden fields empty doesn't wipe them
  const alexa = list.find((c: any) => c.first === 'Alexa');
  await call('PATCH', `/staff/clients/${alexa.id}`, { phone: '', email: '', notes: 'Prefers mornings' });
  assert.equal((await store.get<any>('clients', alexa.id)).phone, '+18045550310');
  // and they can't reach a client they haven't seen
  const tia = (await store.list<any>('clients')).find((c: any) => c.first === 'Tia');
  assert.equal((await call('PATCH', `/staff/clients/${tia.id}`, { notes: 'x' })).status, 404);

  await asOwner();
  assert.equal((await call('PUT', '/staff/settings', { privacy: { employeesSeeContact: true } })).status, 200);
  await login('nyeesha@example.com', 'employee-pass');
  list = (await call('GET', '/staff/clients')).json;
  assert.equal(list.find((c: any) => c.first === 'Alexa').phone, '+18045550310');
  await asOwner();
  await call('PUT', '/staff/settings', { privacy: { employeesSeeContact: false } });
});

test('a deposit the bank asks the client to approve holds the time until they do', async () => {
  const ritual = svc('New Client Ritual');
  // Stripe's test card that always asks for approval; the practice mode treats it the same way
  const r = await bookOnline(ritual, '804-555-0313', 'Dee', nextWeekday(11), { card: '4000002760003184' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.needsAuthentication, true);
  assert.ok(r.json.clientSecret && r.json.token);
  // held: nobody else can take it, and no texts yet
  const again = (await call('GET', `/public/availability?service=${ritual.id}&day=${nextWeekday(11)}`)).json;
  assert.ok(!again.some((s: any) => s.start === r.slot.start && s.staffIds.length === r.slot.staffIds.length));
  assert.ok(!(await store.list<any>('messages')).some((m: any) => m.clientId === r.clientId));

  const done = await call('POST', `/public/booking/${r.json.token}/deposit`, {});
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal(done.json.deposit, 1000);
  assert.ok((await store.list<any>('messages')).some((m: any) => m.kind === 'booking' && m.clientId === r.clientId));

  // one that's never approved is released after 20 minutes
  const left = await bookOnline(ritual, '804-555-0314', 'Gone', nextWeekday(12), { card: '4000002760003184' });
  assert.equal(left.json.needsAuthentication, true);
  assert.equal(await releaseUnpaidHolds(store, new Date(Date.now() + 10 * 60000)), 0);
  assert.equal(await releaseUnpaidHolds(store, new Date(Date.now() + 21 * 60000)), 1);
  assert.ok(!(await store.list<any>('appointments')).some((a: any) => a.clientId === left.clientId));
  assert.equal((await call('POST', `/public/booking/${left.json.token}/deposit`, {})).status, 404);
});

test('a declined deposit gives the time straight back', async () => {
  const ritual = svc('New Client Ritual');
  const { payments } = await import('../src/services/payments');
  const charge = payments.charge;
  payments.charge = async () => ({ ok: false, id: 'pi_sim_declined', simulated: true, error: 'Your card was declined.' });
  try {
    const r = await bookOnline(ritual, '804-555-0315', 'Nope', nextWeekday(13));
    assert.equal(r.status, 402);
    assert.ok(!(await store.list<any>('appointments')).some((a: any) => a.clientId === r.clientId));
    const slots = (await call('GET', `/public/availability?service=${ritual.id}&day=${nextWeekday(13)}`)).json;
    assert.ok(slots.some((s: any) => s.start === r.slot.start));
  } finally {
    payments.charge = charge;
  }
});

// ── from the audit ──
test('the import reads the right columns, names the team member, follows moves, and keeps GlossGenius lengths', async () => {
  // a fresh store that hasn't switched (imports stop at the switch)
  const { FileStore } = await import('../src/store/file');
  const { seed, upgrade } = await import('../src/seed');
  const { importGlossGenius } = await import('../src/services/importer');
  const s2 = new FileStore(join(mkdtempSync(join(tmpdir(), 'wr-imp-')), 'store.json'));
  await seed(s2);
  await upgrade(s2);
  const day = nextWeekday(5);
  const other = nextWeekday(6);
  await importGlossGenius(s2, { clients: 'First Name,Last Name,Phone\nAmy,Ames,8045550501\nBo,Bell,8045550502\n' });
  const head = 'Created Date,Client,Phone,Service,Team Member,Date,Time,Duration,Status';
  const first = await importGlossGenius(s2, {
    appointments: [
      head,
      `01/02/2020,Amy Ames,8045550501,Brazilian,Danielle W,${usDate(day)},10:00 AM,1h 30m,Booked`,
      `01/02/2020,Bo Bell,8045550502,Brazilian,Somebody Else,${usDate(day)},2:00 PM,45,Booked`,
      `01/02/2020,Bo Bell,8045550502,Bikini,Danielle W,${usDate(other)},11:00 AM,,Booked`,
    ].join('\n'),
  });
  assert.equal(first.appointments!.added, 2, JSON.stringify(first));
  assert.match(first.appointments!.problems[0], /Team member “somebody else” not found/);
  const amy = (await s2.list<any>('appointments')).find((a: any) => a.start === zonedToUtc(day, 10 * 60).toISOString());
  assert.ok(amy, 'the appointment date, not the Created Date');
  assert.equal(Date.parse(amy.end) - Date.parse(amy.start), 90 * 60000, 'GlossGenius’s 1h 30m, not our 1-hour length');
  // in GlossGenius, Bo's bikini moved to 1pm: the next export no longer has 11am
  const second = await importGlossGenius(s2, {
    appointments: [head, `01/02/2020,Amy Ames,8045550501,Brazilian,Danielle W,${usDate(day)},10:00 AM,1h 30m,Booked`, `01/02/2020,Bo Bell,8045550502,Bikini,Danielle W,${usDate(other)},1:00 PM,,Booked`].join('\n'),
  });
  assert.equal(second.appointments!.removed, 1);
  assert.equal(second.appointments!.added, 1);
  const bo = (await s2.list<any>('appointments')).filter((a: any) => a.start.startsWith(other) || zoned(a.start).day === other);
  assert.deepEqual(bo.map((a: any) => [zoned(a.start).minutes / 60, a.status]).sort(), [
    [11, 'cancelled'],
    [13, 'booked'],
  ]);
});

test('employees: a text’s reply has no phone number, and booking by phone doesn’t undo a STOP', async () => {
  await login('nyeesha@example.com', 'employee-pass');
  const alexa = (await call('GET', '/staff/clients')).json.find((c: any) => c.first === 'Alexa');
  const sent = await call('POST', `/staff/clients/${alexa.id}/text`, { body: 'See you soon' });
  assert.equal(sent.status, 200);
  assert.ok(!JSON.stringify(sent.json).includes('555'), JSON.stringify(sent.json));
  // a client who texted STOP, booked again at the desk by phone number
  const { handleInbound } = await import('../src/services/notify');
  await handleInbound(store, '+18045550310', 'STOP');
  const service = cat.services.find((s: any) => s.staffIds.includes(nyeesha.id) && !s.deposit && s.category === 'Intimate Waxing');
  const day = nextWeekday(16);
  const slot = (await call('GET', `/staff/availability?service=${service.id}&day=${day}&staff=${nyeesha.id}`)).json[0];
  const r = await call('POST', '/staff/appointments', { client: { first: 'Alexa', last: 'Test', phone: '804-555-0310' }, serviceId: service.id, staffId: nyeesha.id, start: slot.start });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await store.get<any>('clients', alexa.id)).smsReminders, false);
  assert.ok(!(await store.list<any>('messages')).some((m: any) => m.kind === 'booking' && m.channel !== 'email' && m.clientId === alexa.id && m.at >= r.json.createdAt));
  // and the import notes (which can hold phone numbers) aren't sent to employees
  assert.equal((await call('GET', '/staff/bootstrap')).json.settings.glossGeniusImport, undefined);
});

test('a time written with an offset is stored like any other, so the overlap check sees it', async () => {
  await asOwner();
  const service = svc('Bikini');
  const day = nextWeekday(17);
  const slot = (await call('GET', `/staff/availability?service=${service.id}&day=${day}&staff=${boot.me.id}`)).json[0];
  const rena = (await store.list<any>('clients')).find((c: any) => c.first === 'Tia');
  const offset = new Date(slot.start).toISOString().replace('.000Z', '+00:00');
  const a = await call('POST', '/staff/appointments', { clientId: rena.id, serviceId: service.id, staffId: boot.me.id, start: offset });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(a.json.start, slot.start);
  const b = await call('POST', '/staff/appointments', { clientId: rena.id, serviceId: service.id, staffId: boot.me.id, start: slot.start });
  assert.equal(b.status, 409);
});

// ── New Client Rituals ──
test('each ritual is bookable as the service plus 15 minutes (the steam is up to an hour and needs no staff), at its own price and deposit', async () => {
  const services = await store.list<any>('services');
  const rituals = services.filter((s: any) => s.ritualOf);
  assert.equal(rituals.length, 10);
  const facial = rituals.find((s: any) => s.name === 'Jet Plasma Facial Ritual');
  const base = services.find((s: any) => s.id === facial.ritualOf);
  assert.equal(base.name, 'Jet Plasma Facial');
  assert.equal(base.duration, 60, 'Jet Plasma Facial is 1 hour');
  assert.deepEqual([facial.price, facial.deposit, facial.duration, facial.depositNewClientsOnly], [22000, 5000, 75, false]);
  // the Brazilian one is GlossGenius's NEW CLIENT RITUAL, not a second copy
  const brazilian = rituals.find((s: any) => s.name === 'NEW CLIENT RITUAL');
  assert.equal(services.find((s: any) => s.id === brazilian.ritualOf).name, 'Brazilian');
  assert.equal(brazilian.duration, 60, 'the New Client Ritual is booked as 1 hour (owner)');
  // and Bio Scan is off sale
  assert.ok(!(await call('GET', '/public/catalog')).json.memberships.some((m: any) => m.name === 'Bio Scan'));
  // running the upgrade again changes nothing
  const { upgrade } = await import('../src/seed');
  await upgrade(store);
  assert.equal((await store.list<any>('services')).filter((s: any) => s.ritualOf).length, 10);
});

test('a ritual is only for a client new to that service, and their follow-up is for the service itself', async () => {
  const cat = (await call('GET', '/public/catalog')).json;
  const ritual = cat.services.find((s: any) => s.name === 'Vajacial Ritual');
  assert.ok(ritual?.ritualOf);
  const first = await bookOnline(ritual, '804-555-0330', 'Vee', nextWeekday(18));
  assert.equal(first.status, 200, JSON.stringify(first.json));
  // the same client again: refused, pointed at the regular service
  const again = await bookOnline(ritual, '804-555-0330', 'Vee', nextWeekday(19));
  assert.equal(again.status, 409);
  assert.match(again.json.error, /first Vajacial.*book the Vajacial itself/i);
  // after the ritual visit, the rebooking text is for the Vajacial
  const appt = (await store.list<any>('appointments')).find((a: any) => a.clientId === first.clientId && a.status !== 'cancelled');
  await store.put('appointments', { ...appt, status: 'completed' });
  const client = await store.get<any>('clients', first.clientId);
  await store.put('clients', { ...client, lastVisitAt: appt.end });
  const { rebookDue } = await import('../src/services/notify');
  const all = await store.list<any>('services');
  const vajacial = all.find((s: any) => s.name === 'Vajacial');
  const services = new Map(all.map((s: any) => [s.id, s.id === vajacial.id ? { ...s, rebookText: true } : s]));
  const due = await rebookDue(store, { ...client, lastVisitAt: appt.end }, services as any, 42);
  assert.equal(due?.service.name, 'Vajacial');
});
