import { NATIVE } from './lib/booking';
import { SERVICE_GROUPS, SERVICE_PAGES, findGroupLanding, findServicePage, groupPath, servicePath, type ServiceGroup, type ServicePage } from './content/services';

export const SITE_URL = 'https://www.waxroomrichmond.com';

export type Route =
  | { kind: 'home' }
  | { kind: 'service'; page: ServicePage }
  | { kind: 'group'; group: ServiceGroup }
  | { kind: 'gallery' }
  | { kind: 'book' }
  | { kind: 'manage' }
  | { kind: 'join' }
  | { kind: 'referral' }
  | { kind: 'notFound' };

export function resolve(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  if (path === '/gallery') return { kind: 'gallery' };
  // Booking pages: ours in the native build; /book forwards to GlossGenius otherwise.
  if (path === '/book') return { kind: 'book' };
  if (NATIVE && path === '/booking') return { kind: 'manage' };
  if (NATIVE && path === '/join') return { kind: 'join' };
  if (NATIVE && /^\/r\/[A-Za-z0-9]+$/.test(path)) return { kind: 'referral' };
  const m = /^\/services\/([a-z0-9-]+)$/.exec(path);
  const group = m && findGroupLanding(m[1]);
  if (group) return { kind: 'group', group };
  const page = m && findServicePage(m[1]);
  return page ? { kind: 'service', page } : { kind: 'notFound' };
}

/** Every path that gets a pre-rendered HTML file. */
/** Pages search engines should list. */
export const SITEMAP_PATHS = ['/', ...SERVICE_GROUPS.filter((g) => g.landing).map(groupPath), ...SERVICE_PAGES.map(servicePath), '/gallery/'];
/** Every path that gets a pre-rendered HTML file (/r/ serves every referral link). */
export const PRERENDER_PATHS = [...SITEMAP_PATHS, '/book/', ...(NATIVE ? ['/booking/', '/join/', '/r/'] : [])];

export function headFor(route: Route) {
  if (route.kind === 'service') {
    return {
      title: route.page.seoTitle,
      description: route.page.metaDescription,
      canonical: `${SITE_URL}${servicePath(route.page)}`,
    };
  }
  if (route.kind === 'group') {
    return {
      title: route.group.landing!.seoTitle,
      description: route.group.landing!.metaDescription,
      canonical: `${SITE_URL}${groupPath(route.group)}`,
    };
  }
  if (route.kind === 'gallery') {
    return {
      title: 'Gallery: Real Results | The Wax Room, Midlothian VA',
      description: 'Before-and-afters and client moments from The Wax Room: Brazilian waxing, Jet Plasma, BioRePeel, brows and more. Follow @waxroomrichmond.',
      canonical: `${SITE_URL}/gallery/`,
    };
  }
  if (route.kind === 'book') return { title: 'Book Online | The Wax Room, Midlothian VA', description: 'Book waxing, brows, lashes, Jet Plasma and more at The Wax Room in Midlothian, VA.', canonical: `${SITE_URL}/book/` };
  if (route.kind === 'manage') return { title: 'Your Booking | The Wax Room', description: 'View, change or cancel your appointment.', canonical: `${SITE_URL}/booking/` };
  if (route.kind === 'join') return { title: 'Memberships & Packages | The Wax Room', description: 'Join a monthly membership or buy a package at The Wax Room.', canonical: `${SITE_URL}/join/` };
  if (route.kind === 'referral') return { title: 'A Gift From a Friend | The Wax Room', description: 'Money off your first visit to The Wax Room in Midlothian, VA.', canonical: `${SITE_URL}/` };
  if (route.kind === 'notFound') {
    return { title: 'Page not found | The Wax Room', description: 'This page doesn’t exist.', canonical: SITE_URL + '/' };
  }
  return {
    title: 'The Wax Room | Waxing, Lashes, Brows & Skin in Midlothian, VA',
    description:
      'The Wax Room in Midlothian, VA: Brazilian and body waxing, lash extensions, brow lamination, Jet Plasma facials, BioRePeel and yoni steam. Book online.',
    canonical: SITE_URL + '/',
  };
}
