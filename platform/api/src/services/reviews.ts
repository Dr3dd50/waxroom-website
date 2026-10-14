// After a visit: a text asking the client to rate it 1–5, a while after checkout.
// Whoever answers is thanked the same way whatever the score (a free service, once
// per client), and every answer gets the Google review link. Google forbids
// rewarding reviews and asking only happy clients, so the thank-you is for
// answering, the link goes to everyone, and nothing depends on the score except
// the wording. A low score also sends the owner a private heads-up.
import type { Store } from '../store/store';
import type { Appointment, Client, Perk, Service, Settings, Staff } from '../types';
import { fmtDate } from '../lib/time';
import { nice, nowIso, rid } from '../lib/util';
import { autoText } from './appointments';
import { sendOrQueue } from './alerts';

export const REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJkdP2HwFusYkRlevzsf7f53Q';

/** A reply this long after the question no longer counts as the answer. */
const ANSWER_WITHIN_DAYS = 7;
/** A visit checked out longer ago than this isn't asked about (a missed run, or the text was switched on later). */
const ASK_WITHIN_HOURS = 48;

/** The thank-you service, if the owner set one and it still exists. */
async function rewardService(store: Store, s: Settings) {
  const id = s.reviews?.rewardServiceId;
  return id ? ((await store.get<Service>('services', id)) ?? null) : null;
}

/** How the thank-you is named in texts and on the client's account. */
const rewardName = (s: Settings, service: Service) => s.reviews?.rewardLabel?.trim() || nice(service.name);

/** Has this client already had the thank-you? (Once per client, ever.) */
const rewarded = (c: Client) => (c.perks ?? []).some((p) => p.reason === 'rating');

/** Unused, unexpired thank-you visits for a service. */
export function perkFor(c: Client, serviceId: string, now = nowIso()) {
  return (c.perks ?? []).find((p) => p.serviceId === serviceId && !p.usedAt && (!p.expiresAt || p.expiresAt > now));
}

/** Ask about visits checked out at least `delayHours` ago (run by the 15-minute tick, outside quiet hours). */
export async function askForRatings(store: Store, settings: Settings, now = new Date()) {
  const r = settings.reviews;
  if (!r?.enabled) return 0;
  const latest = new Date(now.getTime() - r.delayHours * 3600000).toISOString();
  const earliest = new Date(now.getTime() - (r.delayHours + ASK_WITHIN_HOURS) * 3600000).toISOString();
  // appointments are filed by start time; a visit checked out in the window started up to a day before it
  const done = (await store.range<Appointment>('appointments', new Date(Date.parse(earliest) - 86400000).toISOString(), now.toISOString())).filter(
    (a) => a.status === 'completed' && a.checkout && a.checkout.at <= latest && a.checkout.at > earliest && !a.texts.ratingAskedAt,
  );
  // one text per client: the last thing they had done
  const byClient = new Map<string, Appointment>();
  for (const a of done.sort((x, y) => x.checkout!.at.localeCompare(y.checkout!.at))) byClient.set(a.clientId, a);
  const reward = await rewardService(store, settings);
  let sent = 0;
  for (const a of byClient.values()) {
    const client = await store.get<Client>('clients', a.clientId);
    // every visit of the batch is marked, asked or not, so none is picked up again later
    const mark = async (at: string) => {
      for (const x of done.filter((d) => d.clientId === a.clientId)) await store.put('appointments', { ...x, texts: { ...x.texts, ratingAskedAt: at } });
    };
    const recently = client?.ratingAskedAt && now.getTime() - Date.parse(client.ratingAskedAt) < r.everyDays * 86400000;
    if (!client || recently) {
      await mark(now.toISOString());
      continue;
    }
    const service = await store.get<Service>('services', a.serviceId);
    const staff = await store.get<Staff>('staff', a.staffId);
    const rewardNote = reward && !rewarded(client) ? ` To say thanks for answering, your next ${rewardName(settings, reward)} is on us.` : '';
    const m = await autoText(store, 'rating-request', client, { service: nice(service?.name ?? 'visit'), staff: staff?.short ?? 'us', reward_note: rewardNote }, 'rating-request' as never);
    const at = m?.at ?? now.toISOString();
    await mark(at);
    if (m) {
      await store.put('clients', { ...client, ratingAskedAt: at, ratingPending: { appointmentId: a.id, askedAt: at } });
      sent++;
    }
  }
  return sent;
}

/** A reply that's a rating (a lone 1–5) to a question still waiting on one: record it and say thanks. Null when it isn't one. */
export async function handleRating(store: Store, client: Client, body: string, settings: Settings) {
  const m = /^\s*([1-5])\s*(\/\s*5|stars?|⭐+)?\s*[.!]?\s*$/i.exec(body);
  const pending = client.ratingPending;
  if (!m || !pending || Date.now() - Date.parse(pending.askedAt) > ANSWER_WITHIN_DAYS * 86400000) return null;
  const score = Number(m[1]);
  const at = nowIso();
  const appt = await store.get<Appointment>('appointments', pending.appointmentId);
  if (appt) await store.put('appointments', { ...appt, rating: { score, at } });

  // the thank-you: for answering, whatever the score, once per client
  const r = settings.reviews!;
  const reward = await rewardService(store, settings);
  let rewardLine = '';
  const next: Client = { ...client, ratingPending: undefined };
  if (reward && !rewarded(client)) {
    const expiresAt = r.rewardDays ? new Date(Date.now() + r.rewardDays * 86400000).toISOString() : null;
    const perk: Perk = { id: rid(), serviceId: reward.id, label: `Free ${rewardName(settings, reward)}`, reason: 'rating', grantedAt: at, expiresAt };
    next.perks = [...(client.perks ?? []), perk];
    rewardLine = `Your free ${rewardName(settings, reward)} is on your account${expiresAt ? `, good until ${fmtDate(expiresAt, settings.timezone)}` : ''}. `;
  }
  await store.put('clients', next);

  const reply = await autoText(store, score >= 4 ? 'rating-thanks' : 'rating-thanks-low', next, { reward_line: rewardLine, review_link: r.reviewUrl }, 'rating-thanks' as never);

  // a low score: a private heads-up for the owner, never mentioned to the client
  if (score <= 3) {
    const owners = (await store.list<Staff>('staff')).filter((s) => s.role === 'owner' && s.active && s.phone && s.alerts !== false);
    const service = appt && (await store.get<Service>('services', appt.serviceId));
    const staff = appt && (await store.get<Staff>('staff', appt.staffId));
    const what = service ? ` for ${nice(service.name)}${staff ? ` with ${staff.short}` : ''}${appt ? ` (${fmtDate(appt.start, settings.timezone)})` : ''}` : '';
    const body2 = `Rating ${score}/5 from ${client.first} ${client.last ? `${client.last[0]}.` : ''}${what}. Any reply they send shows in Texts.`.replace(/\s+\./g, '.');
    for (const o of owners) await sendOrQueue(store, settings, o.phone!, body2, 'alert');
  }
  return reply ?? { score };
}
