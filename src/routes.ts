import { SERVICE_PAGES, findServicePage, servicePath, type ServicePage } from './content/services';

export const SITE_URL = 'https://www.waxroomrichmond.com';

export type Route =
  | { kind: 'home' }
  | { kind: 'service'; page: ServicePage }
  | { kind: 'gallery' }
  | { kind: 'notFound' };

export function resolve(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  if (path === '/gallery') return { kind: 'gallery' };
  const m = /^\/services\/([a-z0-9-]+)$/.exec(path);
  const page = m && findServicePage(m[1]);
  return page ? { kind: 'service', page } : { kind: 'notFound' };
}

/** Every path that gets a pre-rendered HTML file. */
export const PRERENDER_PATHS = ['/', ...SERVICE_PAGES.map(servicePath), '/gallery/'];

export function headFor(route: Route) {
  if (route.kind === 'service') {
    return {
      title: route.page.seoTitle,
      description: route.page.metaDescription,
      canonical: `${SITE_URL}${servicePath(route.page)}`,
    };
  }
  if (route.kind === 'gallery') {
    return {
      title: 'Gallery: Real Results | The Wax Room, Midlothian VA',
      description: 'Before-and-afters and client moments from The Wax Room: Brazilian waxing, Jet Plasma, BioRePeel, brows and more. Follow @waxroomrichmond.',
      canonical: `${SITE_URL}/gallery/`,
    };
  }
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
