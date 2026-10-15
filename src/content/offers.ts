// The offers, one landing page each at /offers/<slug>/ (src/pages/OfferPage.tsx).
// The words and figures are the content repo's approved offer bank, copied into
// src/data/offers.json by scripts/sync-rituals.mjs; the service details around
// them come from GlossGenius (src/data/business.json) and the service pages.
//
// A page exists only while its offer can be booked: in the live (GlossGenius) build
// that's what GlossGenius sells, which is every membership and package and the
// Brazilian New Client Ritual; in the native build, everything.
import offerData from '../data/offers.json';
import { business, findService } from '../data';
import { NATIVE, onGlossGenius } from '../lib/booking';
import { SERVICE_PAGES, type ServicePage } from './services';

export type Offer = (typeof offerData.offers)[number] & {
  kind: 'ritual' | 'membership' | 'package';
  value?: number;
  saving?: number;
  savingBasis?: string;
  billing?: string;
  arithmetic?: string;
  deposit?: number;
  eligibility?: string;
  audience?: string;
  service?: string;
};

export const OFFERS = offerData.offers as Offer[];

/** Offer pages call the steam a V-steam, whatever the menu calls it. */
export const vSteam = (s: string) =>
  s.replace(/\b(a |an )?yoni[ -]steam(s?)\b/gi, (_m, art: string | undefined, plural: string) => `${art ? 'a ' : ''}V-steam${plural}`);
export const offerPath = (o: Offer) => `/offers/${o.slug}/`;

/** Can this offer be booked from this build of the site? */
export function offerInThisBuild(o: Offer) {
  if (NATIVE) return true;
  if (o.kind === 'ritual') return onGlossGenius(o.name);
  if (o.kind === 'membership') return business.memberships.some((m) => m.name === o.name);
  return business.packages.some((p) => p.name === o.name);
}
/** Bookable only once our own booking is open (a ritual GlossGenius doesn't have). */
export const needsOurBooking = (o: Offer) => o.kind === 'ritual' && !onGlossGenius(o.name);

export const LIVE_OFFERS = OFFERS.filter(offerInThisBuild);
export const findOffer = (slug: string) => LIVE_OFFERS.find((o) => o.slug === slug);

/** The service page an offer belongs with: its service's page, or the page that lists it. */
export function pageFor(o: Offer): ServicePage {
  const svc = o.service ? findService(o.service) : undefined;
  const category = svc && business.categories.find((c) => c.services.includes(svc))?.name;
  return (
    (category && SERVICE_PAGES.find((p) => p.categories.includes(category))) ||
    SERVICE_PAGES.find((p) => p.memberships.includes(o.name) || p.packages.includes(o.name)) ||
    SERVICE_PAGES[0]
  );
}

/** The menu services a ritual or package is made of (memberships are a cadence, not a list). */
export function partsOf(o: Offer) {
  if (o.kind === 'ritual') return [{ service: findService(o.service!), quantity: 1 }];
  if (o.kind === 'package') {
    const p = business.packages.find((x) => x.name === o.name);
    return (p?.items ?? []).map((i) => ({ service: findService(i.name), quantity: i.quantity }));
  }
  return [];
}

export const membershipOf = (o: Offer) => business.memberships.find((m) => m.name === o.name);
