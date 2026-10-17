// www is served by the original website hosting, which has no /api, so its pages call
// the API on the staff domain: the site's own origins may, others may not, and links
// to the API (calendar invites) point at the staff domain.
//   npx tsx --test platform/api/test/site-origin.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-origin-')), 'store.json');
process.env.SITE_URL = 'https://www.waxroomrichmond.com';
process.env.STAFF_URL = 'https://staff.waxroomrichmond.com';

const { makeApp, makeStore } = await import('../src/app');
const { calendarLink } = await import('../src/services/calendar');
const { referralLink } = await import('../src/services/appointments');
const app = makeApp(await makeStore());
const preflight = (origin: string) =>
  app.request('/api/public/bookings/start', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });

test('the website, with or without www, may call the booking API', async () => {
  for (const origin of ['https://www.waxroomrichmond.com', 'https://waxroomrichmond.com']) {
    const r = await preflight(origin);
    assert.equal(r.headers.get('access-control-allow-origin'), origin);
    assert.match(r.headers.get('access-control-allow-headers') ?? '', /content-type/i);
  }
  const get = await app.request('/api/public/config', { headers: { Origin: 'https://www.waxroomrichmond.com' } });
  assert.equal(get.headers.get('access-control-allow-origin'), 'https://www.waxroomrichmond.com');
});

test('other sites may not, and the staff routes never answer another origin', async () => {
  assert.equal((await preflight('https://evil.example')).headers.get('access-control-allow-origin'), null);
  const staff = await app.request('/api/staff/bootstrap', { headers: { Origin: 'https://www.waxroomrichmond.com' } });
  assert.equal(staff.headers.get('access-control-allow-origin'), null);
});

test('calendar links go to the API on the staff domain; referral links work on any host', () => {
  assert.equal(calendarLink({ manageToken: 'abc' } as any), 'https://staff.waxroomrichmond.com/api/cal/abc');
  assert.equal(referralLink({ referralCode: 'KEISHA10' } as any), 'https://www.waxroomrichmond.com/r/?c=KEISHA10');
});
