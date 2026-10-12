import { useEffect } from 'react';
import { Nav } from './components/Nav';
import { Footer } from './sections/Footer';
import { Home } from './pages/Home';
import { ServicePage } from './pages/ServicePage';
import { GroupPage } from './pages/GroupPage';
import { BookPage } from './pages/BookPage';
import { ManagePage } from './pages/ManagePage';
import { JoinPage } from './pages/JoinPage';
import { ReferralPage } from './pages/ReferralPage';
import { BookContext, type BookTarget } from './lib/booking';
import { groupForPage } from './content/services';
import { GalleryPage } from './pages/GalleryPage';
import { headFor, resolve } from './routes';
import { gsap, handleHashLinks, ScrollTrigger, scrollToHash, startSmoothScroll } from './lib/motion';
import { startTracking, trackView } from './lib/tracking';

export default function App({ path }: { path: string }) {
  const route = resolve(path);
  // A plain Book button opens the menu on this page's umbrella.
  const here: BookTarget =
    route.kind === 'group' ? { group: route.group.key } : route.kind === 'service' ? { group: groupForPage(route.page.slug).key, page: route.page.slug } : {};

  useEffect(() => {
    document.title = headFor(route).title;
    startSmoothScroll();
    startTracking();
    if (route.kind === 'group') trackView(route.group.label, 'umbrella');
    if (route.kind === 'service') trackView(route.page.name, groupForPage(route.page.slug).label);
    const stopHashLinks = handleHashLinks();
    // Honey progress bar along the top edge.
    const bar = gsap.to('.progress', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
    });
    // Arriving from another page with a #section: scroll there once laid out.
    if (location.hash) window.setTimeout(() => scrollToHash(location.hash), 300);
    // Images loading late change section heights; re-measure pins.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    return () => {
      stopHashLinks();
      bar.scrollTrigger?.kill();
      bar.kill();
      window.removeEventListener('load', refresh);
    };
    // Each page is its own document load, so this runs once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BookContext.Provider value={here}>
      <div className="progress" aria-hidden="true" />
      <Nav isHome={route.kind === 'home'} />
      <main>
        {route.kind === 'home' ? <Home /> : null}
        {route.kind === 'service' ? <ServicePage page={route.page} /> : null}
        {route.kind === 'group' ? <GroupPage group={route.group} /> : null}
        {route.kind === 'gallery' ? <GalleryPage /> : null}
        {route.kind === 'book' ? <BookPage /> : null}
        {route.kind === 'manage' ? <ManagePage /> : null}
        {route.kind === 'join' ? <JoinPage /> : null}
        {route.kind === 'referral' ? <ReferralPage /> : null}
        {route.kind === 'notFound' ? (
          <section className="hero">
            <div className="hero__inner">
              <h1 className="display">
                Page not <em>found.</em>
              </h1>
              <p>
                <a className="link-arrow" href="/">
                  Back to The Wax Room
                </a>
              </p>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </BookContext.Provider>
  );
}
