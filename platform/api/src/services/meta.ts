// Meta Conversions API: the server half of the pixel. The browser fires an event
// with an id it made up; the same event goes from here with the same id, so Meta
// keeps one, and events the browser lost (ad-blockers, closed tabs) still arrive.
// Nothing is sent unless the browser said tracking is allowed, contact details
// leave only as SHA-256 hashes, and a failed send is kept and retried by the
// 15-minute scheduled run rather than dropped.
import { createHash, randomUUID } from 'node:crypto';
import type { Store } from '../store/store';
import { config } from '../config';
import { nowIso, rid } from '../lib/util';

const GRAPH = 'https://graph.facebook.com/v23.0';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_COOKIE = /^fb\.\d\.\d+\.[A-Za-z0-9_.-]+$/;
const SEVEN_DAYS = 7 * 86400000; // Meta refuses events older than this

/** What the browser sends alongside a conversion. */
export type Tracking = { consent: 'allowed' | 'denied'; fbp: string | null; fbc: string | null; eventId: string | null };

/** Lenient: bad tracking data is dropped, never a reason to refuse a booking. */
export function readTracking(raw: unknown): Tracking {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const consent = o.consent === 'allowed' ? 'allowed' : 'denied';
  const cookie = (v: unknown) => (typeof v === 'string' && v.length <= 255 && META_COOKIE.test(v.trim()) ? v.trim() : null);
  return {
    consent,
    fbp: cookie(o.fbp),
    fbc: cookie(o.fbc),
    eventId: consent === 'allowed' && typeof o.eventId === 'string' && UUID.test(o.eventId) ? o.eventId.toLowerCase() : null,
  };
}

/** The visitor's address and browser, as CloudFront passes them on (not hashed: Meta needs them as-is). */
export function requestInfo(header: (name: string) => string | undefined) {
  const ip = header('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  return { ip, ua: header('user-agent') || undefined };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

export type Person = { email?: string; phone?: string; first?: string; last?: string; id?: string };

/** Hashed customer details: email, phone (digits with country code), names, our client id, country. */
function hashedUser(p: Person) {
  const u: Record<string, string[]> = { country: [sha('us')] };
  if (norm(p.email)) u.em = [sha(norm(p.email))];
  const digits = (p.phone ?? '').replace(/\D/g, '');
  if (digits) u.ph = [sha(digits.length === 10 ? `1${digits}` : digits)];
  if (norm(p.first)) u.fn = [sha(norm(p.first))];
  if (norm(p.last)) u.ln = [sha(norm(p.last))];
  if (p.id) u.external_id = [sha(p.id)];
  return u;
}

export const metaLive = () => !!(config.meta.pixelId && config.meta.token);

type Outbox = { id: string; at: string; event: Record<string, unknown>; attempts: number; lastError?: string };

/**
 * Send one event to Meta, if tracking is set up and the visitor allowed it.
 * Never throws into the caller's request: a failed send is kept for retry.
 */
export async function sendMetaEvent(
  store: Store,
  e: {
    name: string;
    tracking: Tracking;
    url: string;
    request: { ip?: string; ua?: string };
    person?: Person;
    custom?: Record<string, unknown>;
  },
) {
  if (!metaLive() || e.tracking.consent !== 'allowed') return null;
  const event = {
    event_name: e.name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: e.tracking.eventId ?? randomUUID(), // the browser's id, so Meta keeps one of the two
    action_source: 'website',
    event_source_url: e.url,
    user_data: {
      ...hashedUser(e.person ?? {}),
      ...(e.request.ip ? { client_ip_address: e.request.ip } : {}),
      ...(e.request.ua ? { client_user_agent: e.request.ua } : {}),
      ...(e.tracking.fbp ? { fbp: e.tracking.fbp } : {}),
      ...(e.tracking.fbc ? { fbc: e.tracking.fbc } : {}),
    },
    ...(e.custom ? { custom_data: e.custom } : {}),
  };
  try {
    await post([event]);
  } catch (err) {
    await store.put<Outbox>('metaOutbox', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), event, attempts: 1, lastError: String((err as Error).message) });
  }
  return event.event_id;
}

async function post(data: unknown[]) {
  const body: Record<string, unknown> = { data, access_token: config.meta.token };
  if (config.meta.testCode) body.test_event_code = config.meta.testCode;
  const res = await fetch(`${GRAPH}/${config.meta.pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Retry kept events (run every 15 minutes). Events Meta would now refuse as too old are logged and dropped. */
export async function retryMetaEvents(store: Store) {
  if (!metaLive()) return { sent: 0, waiting: 0 };
  let sent = 0, waiting = 0;
  for (const o of await store.list<Outbox>('metaOutbox')) {
    if (Date.now() - Date.parse(o.at) > SEVEN_DAYS - 3600000) {
      console.error('meta: giving up on an event older than 7 days', o.event.event_name, o.lastError);
      await store.delete('metaOutbox', o.id);
      continue;
    }
    try {
      await post([o.event]);
      await store.delete('metaOutbox', o.id);
      sent++;
    } catch (err) {
      await store.put<Outbox>('metaOutbox', { ...o, attempts: o.attempts + 1, lastError: String((err as Error).message) });
      waiting++;
    }
  }
  if (waiting) console.error(`meta: ${waiting} event(s) still failing; see metaOutbox`);
  return { sent, waiting };
}
