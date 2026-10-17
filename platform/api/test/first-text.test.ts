// The STOP/HELP line goes on a client's first text that actually reaches them, and
// only that one. Twilio is stood in for here, so the texts count as sent.
//   npx tsx --test platform/api/test/first-text.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'wr-first-')), 'store.json');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';
process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_AUTH_TOKEN = 'token';
process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGtest';

const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (String(url).includes('api.twilio.com')) {
    sent.push(new URLSearchParams(String(init?.body)).get('Body') ?? '');
    return new Response(JSON.stringify({ sid: `SM${sent.length}` }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
}) as typeof fetch;

const { makeStore } = await import('../src/app');
const { sendText, FIRST_TEXT_LINE } = await import('../src/services/sms');
const store = await makeStore();
await store.put('settings', { ...(await store.get<any>('settings', 'settings')), switchover: { done: true } });

test('the first text that goes out carries the line; the next one doesn’t', async () => {
  const c = { id: 'c1', first: 'Ola', last: 'First', phone: '+18045550950', email: '', notes: '', createdAt: new Date().toISOString(), smsReminders: true, smsMarketing: false, credit: 0, referralCode: 'OLA1' };
  await store.put('clients', c);
  const one = await sendText(store, c.phone, 'Hi Ola! You’re booked.', 'booking', c as any);
  assert.equal(one.status, 'sent');
  assert.equal(sent[0], `Hi Ola! You’re booked.\n${FIRST_TEXT_LINE}`);
  assert.ok((await store.get<any>('clients', 'c1')).textedAt);
  const fresh = await store.get<any>('clients', 'c1');
  await sendText(store, c.phone, 'Reminder: tomorrow.', 'reminder', fresh);
  assert.equal(sent[1], 'Reminder: tomorrow.');
});
