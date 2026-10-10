// Staff sign-in: email + password (scrypt), then a signed, HTTP-only session
// cookie. Owners can do everything; employees see their own calendar and clients.
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config';
import type { Store } from './store/store';
import type { Staff } from './types';
import { HttpError } from './lib/util';

const COOKIE = 'wr_staff';
const DAYS = 14;

export function checkPassword(hash: string | undefined, pw: string) {
  if (!hash) return false;
  const [salt, key] = hash.split(':');
  const got = scryptSync(pw, salt, 32);
  return timingSafeEqual(got, Buffer.from(key, 'hex'));
}

const sign = (payload: string) => createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');

export function startSession(c: Context, staff: Staff) {
  const exp = Date.now() + DAYS * 86400000;
  const payload = `${staff.id}.${exp}`;
  setCookie(c, COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: DAYS * 86400,
  });
}

export const endSession = (c: Context) => deleteCookie(c, COOKIE, { path: '/' });

export async function currentStaff(c: Context, store: Store) {
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;
  const [id, exp, sig] = raw.split('.');
  if (!id || !exp || !sig || sign(`${id}.${exp}`) !== sig || Number(exp) < Date.now()) return null;
  const staff = await store.get<Staff>('staff', id);
  return staff?.active ? staff : null;
}

export type Env = { Variables: { staff: Staff } };

export const requireStaff = (store: Store) => async (c: Context<Env>, next: Next) => {
  const staff = await currentStaff(c, store);
  if (!staff) throw new HttpError(401, 'Please sign in.');
  c.set('staff', staff);
  await next();
};

export const requireOwner = async (c: Context<Env>, next: Next) => {
  if (c.get('staff').role !== 'owner') throw new HttpError(403, 'Only the owner can do that.');
  await next();
};
