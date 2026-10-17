// Calls to our booking API: on the same domain at /api, or at VITE_API_URL when the
// site is hosted apart from it (www is served by the original website hosting, which
// has no /api, so the live build calls the staff domain's).
export const API_URL = `${import.meta.env.VITE_API_URL ?? ''}/api`;
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'We couldn’t reach the booking system. Check your connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong. Please try again.');
  return json as T;
}

export const cents = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
export const TZ = 'America/New_York';
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
export const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** What the server sends when the client's bank wants them to approve a payment (CardForm shows that step). */
export type NeedsApproval = { needsAuthentication: true; clientSecret: string; paymentMethodId: string };
export const needsApproval = (r: unknown): r is NeedsApproval => !!r && typeof r === 'object' && (r as NeedsApproval).needsAuthentication === true;
