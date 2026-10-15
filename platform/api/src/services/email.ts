// Appointment emails, from the studio's Gmail (an app password in the keys secret).
// Each is the same message as the text, worded for email: a subject, the links
// written out, and anything that only works by text ("Reply C") swapped for a link.
// Without the app password they're kept like unsent texts, marked as not sent.
import nodemailer, { type Transporter } from 'nodemailer';
import { config, emailLive } from '../config';
import type { Store } from '../store/store';
import type { Client, Message, Settings } from '../types';
import { nowIso, rid } from '../lib/util';
import { fill } from './sms';

/** The automatic messages that are emailed too, with each one's subject. */
export const EMAIL_SUBJECTS: Record<string, string> = {
  booking: 'You’re booked: {service} on {date} at {time}',
  moved: 'Your {service} is now {date} at {time}',
  'confirm-request': 'See you {day} at {time}: please confirm',
  reminder: 'Reminder: {service} tomorrow at {time}',
  cancel: 'Cancelled: {service} on {date}',
  receipt: 'Your receipt from The Wax Room',
};

const SIGN_OFF = 'The Wax Room\n11162 Hull Street Rd N, Midlothian, VA\nQuestions? Just reply to this email.';

/** The text's words for an email: a reply keyword becomes the link that does the same. */
export function emailBody(text: string, vars: Record<string, string>) {
  const body = text.replace(/Reply C to confirm\.?/i, vars.manage_link ? `Confirm you’re coming: ${vars.manage_link}` : '').replace(/\s{2,}/g, ' ').trim();
  return `${body}\n\n${SIGN_OFF}`;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Plain words with clickable links; one paragraph per line. */
export const toHtml = (text: string) =>
  `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#1d1814;max-width:560px">${text
    .split('\n\n')
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>').replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#a86a12">${u}</a>`)}</p>`)
    .join('')}</div>`;

let transport: Transporter | undefined;
const mailer = () =>
  (transport ??= nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.gmail.user, pass: config.gmail.appPassword } }));

export async function sendEmail(store: Store, to: string, subject: string, body: string, kind: Message['kind'], client?: Client): Promise<Message> {
  const at = nowIso();
  const msg: Message = { id: `${at}_${rid(4)}`, at, direction: 'out', to, clientId: client?.id, kind, body, subject, channel: 'email', status: 'simulated' };
  // the same last stop as texts: nothing goes to clients before the switch from GlossGenius
  const settings = await store.get<Settings>('settings', 'settings');
  if (!settings?.switchover?.done) {
    msg.status = 'failed';
    msg.error = 'Not sent: emails start at the switch from GlossGenius.';
  } else if (emailLive()) {
    try {
      const r = await mailer().sendMail({ from: { name: 'The Wax Room', address: config.gmail.user }, to, subject, text: body, html: toHtml(body) });
      msg.status = 'sent';
      msg.providerId = r.messageId;
    } catch (e) {
      msg.status = 'failed';
      msg.error = (e as Error).message;
    }
  }
  await store.put('messages', msg);
  return msg;
}

/** Email one of the automatic messages, if emails are on and the client has an address. */
export async function autoEmail(store: Store, settings: Settings, key: string, client: Client, text: string, vars: Record<string, string>, kind: Message['kind']) {
  const subject = EMAIL_SUBJECTS[key];
  if (!subject || !settings.emails?.enabled || !validEmail(client.email)) return null;
  return sendEmail(store, client.email!.trim(), fill(subject, { first: client.first, ...vars }), emailBody(text, vars), kind, client);
}

export const validEmail = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
