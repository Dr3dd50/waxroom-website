// Texts. With Twilio keys set they go out through Twilio (a Messaging Service
// registered for A2P 10DLC); until then they're kept in an outbox the
// dashboard shows, marked as not sent.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, twilioLive } from '../config';
import type { Store } from '../store/store';
import type { Client, Message, Settings } from '../types';
import { nowIso, rid } from '../lib/util';

/** On a client's first text from this number: who it's from and how to stop (carriers expect it). */
export const FIRST_TEXT_LINE = 'The Wax Room: reply STOP to opt out, HELP for help.';

export async function sendText(store: Store, to: string, body: string, kind: Message['kind'], client?: Client): Promise<Message> {
  const at = nowIso();
  const first = !!client && !client.textedAt && !/reply stop/i.test(body);
  const text = first ? `${body}\n${FIRST_TEXT_LINE}` : body;
  const msg: Message = { id: `${at}_${rid(4)}`, at, direction: 'out', to, clientId: client?.id, kind, body: text, status: 'simulated' };
  // Nothing is texted from here before the switch from GlossGenius. Every path that
  // texts checks first; this is the last stop in case one is ever missed.
  const settings = await store.get<Settings>('settings', 'settings');
  if (!settings?.switchover?.done) {
    msg.status = 'failed';
    msg.error = 'Not sent: texts start at the switch from GlossGenius.';
  } else if (twilioLive()) {
    const t = config.twilio;
    const form = new URLSearchParams({ To: to, Body: text });
    if (t.messagingServiceSid) form.set('MessagingServiceSid', t.messagingServiceSid);
    else form.set('From', t.from!);
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${t.accountSid}:${t.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const j = (await r.json()) as { sid?: string; message?: string };
      msg.status = r.ok ? 'sent' : 'failed';
      msg.providerId = j.sid;
      if (!r.ok) msg.error = j.message;
    } catch (e) {
      msg.status = 'failed';
      msg.error = (e as Error).message;
    }
  }
  await store.put('messages', msg);
  // once one has actually gone out, later texts leave the line off
  if (first && msg.status === 'sent') {
    const fresh = await store.get<Client>('clients', client!.id);
    if (fresh && !fresh.textedAt) await store.put('clients', { ...fresh, textedAt: at });
    client!.textedAt = at;
  }
  return msg;
}

/** Twilio signs webhook requests; check it so nobody can fake a client's reply. */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string) {
  if (!config.twilio.authToken) return true; // local: nothing to verify against
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = Buffer.from(createHmac('sha1', config.twilio.authToken).update(data).digest('base64'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Fill {placeholders} in a message template. */
export const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m).replace(/\s+/g, ' ').trim();
