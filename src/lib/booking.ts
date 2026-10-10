// Two versions of the site share this code. The live one sends every Book
// button to GlossGenius. The native one (VITE_BOOKING=native) books on our
// own pages (/book/, /join/), with Stripe and texts, once Twilio's onboarding
// is done. Flip the build flag to switch; nothing else changes.
import { business } from '../data';

export const NATIVE = import.meta.env.VITE_BOOKING === 'native';

type LinkProps = { href: string; target?: string; rel?: string };
const external = (href: string): LinkProps => ({ href, target: '_blank', rel: 'noopener' });

/** Book button: a service name preselects it in our flow. */
export const bookLink = (serviceName?: string): LinkProps =>
  NATIVE ? { href: `/book/${serviceName ? `?service=${encodeURIComponent(serviceName)}` : ''}` } : external(business.bookingUrl);

export const membershipLink = (name: string, glossGeniusUrl: string): LinkProps =>
  NATIVE ? { href: `/join/?membership=${encodeURIComponent(name)}` } : external(glossGeniusUrl);

export const packageLink = (name: string): LinkProps => (NATIVE ? { href: `/join/?package=${encodeURIComponent(name)}` } : external(business.packagesUrl));
