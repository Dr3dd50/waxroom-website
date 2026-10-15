// Two versions of the site share this code. The live one books through
// GlossGenius; the native one (VITE_BOOKING=native) books on our own pages
// (/book/, /join/), with Stripe and texts, once Twilio's onboarding is done.
// Flip the build flag to switch; nothing else changes.
//
// Either way a Book button opens our menu at /book/ on the umbrella of the page
// it's on, and a chosen service goes straight to picking a time: our own step in
// the native build, that service's calendar on GlossGenius in the live one.
import { createContext, useContext } from 'react';
import { business } from '../data';

export const NATIVE = import.meta.env.VITE_BOOKING === 'native';

export type LinkProps = { href: string; target?: string; rel?: string; 'data-book-service'?: string };
const external = (href: string): LinkProps => ({ href, target: '_blank', rel: 'noopener' });

/** What a Book button is for: a group (umbrella), the service page it's on, or one service. */
export type BookTarget = { group?: string; page?: string; service?: string };

const TOKENS = new Map(business.categories.flatMap((c) => c.services.map((s) => [s.name.toLowerCase(), s.token] as const)));

/** Whether a service (by name) can be booked on GlossGenius, the live booking system until the switch. */
export const onGlossGenius = (name: string) => TOKENS.has(name.toLowerCase());

/** GlossGenius, opened on one service's calendar. */
export const glossGeniusService = (token: string) => `${new URL(business.bookingUrl).origin}/book?service_token=${encodeURIComponent(token)}`;

export function bookLink(t: BookTarget = {}): LinkProps {
  if (t.service) {
    if (NATIVE) return { href: `/book/?service=${encodeURIComponent(t.service)}` };
    const token = TOKENS.get(t.service.toLowerCase());
    // tagged so the tap is reported to Meta as starting a booking (lib/tracking)
    if (token) return { href: glossGeniusService(token), 'data-book-service': t.service };
  }
  const q = new URLSearchParams();
  if (t.group) q.set('group', t.group);
  if (t.page) q.set('page', t.page);
  return { href: `/book/${q.size ? `?${q}` : ''}` };
}

/** The page's own umbrella, so a plain Book button on it opens that part of the menu. */
export const BookContext = createContext<BookTarget>({});
export function useBookLink() {
  const here = useContext(BookContext);
  return (t?: BookTarget) => bookLink(t ?? here);
}

export const membershipLink = (name: string, glossGeniusUrl: string): LinkProps =>
  NATIVE ? { href: `/join/?membership=${encodeURIComponent(name)}` } : external(glossGeniusUrl);

export const packageLink = (name: string): LinkProps => (NATIVE ? { href: `/join/?package=${encodeURIComponent(name)}` } : external(business.packagesUrl));
