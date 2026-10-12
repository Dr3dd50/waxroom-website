// GlossGenius stays the booking system until the owner switches over (dashboard →
// Settings → Switch from GlossGenius). Until then nothing here books, texts or
// charges: every such path checks `requireSwitched`, and texts and Stripe also
// refuse on their own (sms.ts, payments.ts) in case a path is ever missed.
//
// One system takes bookings at any time, so nothing can be booked twice across
// the two; inside ours, `withStaffLock` makes the check-then-write of a booking
// one step, so two people can't take the same time at the same moment.
import type { Store } from '../store/store';
import type { Settings } from '../types';
import { HttpError } from '../lib/util';
import { zoned } from '../lib/time';
import { getSettings } from './availability';

export const switched = (s: Settings) => !!s.switchover?.done;

/** Refuse with the reason when the switchover hasn't happened. */
export async function requireSwitched(store: Store, what = 'Bookings, texts and payments here') {
  if (!switched(await getSettings(store))) throw new HttpError(409, `${what} start when you switch over from GlossGenius (Settings → Switch from GlossGenius).`);
}

/**
 * Run `fn` holding the booking lock for one person's day. Locks expire on their
 * own after a few seconds, so a crash mid-booking can't leave a day stuck.
 */
export async function withStaffLock<T>(store: Store, staffId: string, startIso: string, fn: () => Promise<T>): Promise<T> {
  const id = `${staffId}|${zoned(startIso).day}`;
  for (let attempt = 0; ; attempt++) {
    if (await store.claim('locks', id, 10_000)) break;
    if (attempt >= 20) throw new HttpError(409, 'Someone is booking that time right now. Please try again in a moment.');
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    return await fn();
  } finally {
    await store.delete('locks', id);
  }
}
