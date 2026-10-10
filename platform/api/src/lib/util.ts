import { randomBytes } from 'node:crypto';

export const rid = (n = 6) => randomBytes(n).toString('base64url');
export const nowIso = () => new Date().toISOString();
export const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
export const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

/** US phone numbers to E.164 (+1XXXXXXXXXX); returns null when it can't be a US mobile. */
export function toE164(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}
export const prettyPhone = (e164: string) => {
  const d = e164.replace(/\D/g, '').slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
