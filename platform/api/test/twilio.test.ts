// Replies from clients (C, STOP, a rating) come in through Twilio's webhook. Twilio
// signs the address it posted to, which is the staff site's until www carries the
// API, so a signature for either address is accepted and anything else refused.
//   npx tsx --test platform/api/test/twilio.test.ts
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-tw-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';
process.env.SITE_URL = 'https://www.waxroomrichmond.com';
process.env.STAFF_URL = 'https://staff.waxroomrichmond.com';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';

const { makeApp, makeStore } = await import('../src/app');
const store = await makeStore();
const app = makeApp(store);

const sign = (url: string, params: Record<string, string>) =>
  createHmac('sha1', 'test-auth-token').update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
const post = (params: Record<string, string>, signature: string) =>
  app.request('/api/webhooks/twilio', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body: new URLSearchParams(params) });

const reply = { From: '+18045550700', Body: 'HELP', MessageSid: 'SM1' };

test('a reply signed for the staff site’s address is accepted', async () => {
  const r = await post(reply, sign('https://staff.waxroomrichmond.com/api/webhooks/twilio', reply));
  assert.equal(r.status, 200);
});

test('and for the website’s address, once www carries the API', async () => {
  const r = await post(reply, sign('https://www.waxroomrichmond.com/api/webhooks/twilio', reply));
  assert.equal(r.status, 200);
});

test('anything else is refused', async () => {
  assert.equal((await post(reply, sign('https://evil.example/api/webhooks/twilio', reply))).status, 403);
  assert.equal((await post(reply, 'not-a-signature')).status, 403);
  assert.equal((await post({ ...reply, Body: 'STOP' }, sign('https://staff.waxroomrichmond.com/api/webhooks/twilio', reply))).status, 403);
});
