// The owner ticks which services each person does, from that person's side. Online
// booking follows at once; a New Client Ritual follows its service; hidden services
// are left alone; only the owner can change it.
//   npx tsx --test platform/api/test/team-services.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-team-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';

const { makeApp, makeStore } = await import('../src/app');
const store = await makeStore();
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
const danielle = boot.staff.find((s: any) => /danielle/i.test(s.name));
const services = async () => (await call('GET', '/staff/bootstrap')).json.services as any[];
const menu = (list: any[]) => list.filter((s) => s.active && !s.ritualOf);

test('taking someone off a group of services: only those change, and rituals follow', async () => {
  assert.ok(danielle, 'Danielle is on the team');
  const before = await services();
  const hers = menu(before).filter((s) => s.staffIds.includes(danielle.id));
  const waxing = hers.filter((s) => /wax/i.test(s.category));
  assert.ok(waxing.length, 'she does some waxing today');
  const keep = hers.filter((s) => !waxing.includes(s)).map((s) => s.id);

  const r = await call('PUT', `/staff/team/${danielle.id}/services`, { serviceIds: keep });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const after = await services();
  for (const s of after) {
    const was = before.find((x) => x.id === s.id);
    const base = s.ritualOf ? after.find((x) => x.id === s.ritualOf) : s;
    const shouldHave = s.active && menu(after).includes(base) ? keep.includes(base.id) : was.staffIds.includes(danielle.id);
    assert.equal(s.staffIds.includes(danielle.id), shouldHave, `${s.name}`);
    // nobody else moved
    assert.deepEqual(s.staffIds.filter((x: string) => x !== danielle.id), was.staffIds.filter((x: string) => x !== danielle.id), `${s.name}: others unchanged`);
  }
});

test('online booking follows: she isn’t offered for what she no longer does', async () => {
  const list = await services();
  const waxing = menu(list).find((s) => /wax/i.test(s.category) && !s.staffIds.includes(danielle.id) && s.bookableOnline);
  assert.ok(waxing);
  const cfg = (await call('GET', '/public/config')).json;
  const shown = cfg.services?.find((s: any) => s.id === waxing.id);
  if (shown) assert.ok(!shown.staffIds.includes(danielle.id));
  // a service only she did can't be booked online any more
  const solo = menu(list).find((s) => s.staffIds.length === 0);
  if (solo) assert.equal(solo.bookableOnline, false);
});

test('ticking a service back on puts her back, ritual too', async () => {
  const list = await services();
  const brazilian = menu(list).find((s) => s.name.toLowerCase() === 'brazilian');
  const hers = menu(list).filter((s) => s.staffIds.includes(danielle.id)).map((s) => s.id);
  assert.equal((await call('PUT', `/staff/team/${danielle.id}/services`, { serviceIds: [...hers, brazilian.id] })).status, 200);
  const after = await services();
  assert.ok(after.find((s) => s.id === brazilian.id).staffIds.includes(danielle.id));
  const ritual = after.find((s) => s.ritualOf === brazilian.id);
  if (ritual) assert.ok(ritual.staffIds.includes(danielle.id));
});

test('changing a service’s people from the service side carries to its ritual', async () => {
  const list = await services();
  const brazilian = menu(list).find((s) => s.name.toLowerCase() === 'brazilian');
  const ritual = list.find((s) => s.ritualOf === brazilian.id);
  assert.ok(ritual, 'the Brazilian has a New Client Ritual');
  const others = brazilian.staffIds.filter((x: string) => x !== danielle.id);
  assert.equal((await call('PUT', `/staff/services/${brazilian.id}`, { staffIds: others })).status, 200);
  const after = await services();
  assert.deepEqual(after.find((s) => s.id === ritual.id).staffIds, others);
});

test('only the owner can change who does what', async () => {
  assert.equal((await call('PUT', `/staff/team/${danielle.id}/services`, { serviceIds: 'x' })).status, 400);
  assert.equal((await call('PUT', '/staff/team/nobody/services', { serviceIds: [] })).status, 404);
  const employee = boot.staff.find((s: any) => s.role === 'employee' && s.active);
  await call('PATCH', `/staff/team/${employee.id}`, { email: 'employee@example.com', password: 'employee-pass-1' });
  cookie = '';
  assert.equal((await call('POST', '/staff/login', { email: 'employee@example.com', password: 'employee-pass-1' })).status, 200);
  assert.equal((await call('PUT', `/staff/team/${employee.id}/services`, { serviceIds: [] })).status, 403);
});
