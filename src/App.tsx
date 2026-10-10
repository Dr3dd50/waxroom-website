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
import { NATIVE } from './lib/booking';
import { business } from './data';
import { GalleryPage } from './pages/GalleryPage';
import { headFor, resolve } from './routes';
import { gsap, handleHashLinks, ScrollTrigger, scrollToHash, startSmoothScroll } from './lib/motion';

export default function App({ path }: { path: string }) {
  const route = resolve(path);

  useEffect(() => {
    document.title = headFor(route).title;
    startSmoothScroll();
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
    <>
      <div className="progress" aria-hidden="true" />
      <Nav isHome={route.kind === 'home'} />
      <main>
        {route.kind === 'home' ? <Home /> : null}
        {route.kind === 'service' ? <ServicePage page={route.page} /> : null}
        {route.kind === 'group' ? <GroupPage group={route.group} /> : null}
        {route.kind === 'gallery' ? <GalleryPage /> : null}
        {route.kind === 'book' ? NATIVE ? <BookPage /> : <ForwardToGlossGenius /> : null}
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
      <Footer bookBar={!['book', 'manage', 'join'].includes(route.kind)} />
    </>
  );
}

/** Until our own booking is switched on, /book/ hands over to GlossGenius. */
function ForwardToGlossGenius() {
  useEffect(() => {
    location.replace(business.bookingUrl);
  }, []);
  return (
    <section className="hero">
      <div className="hero__inner">
        <p>
          <a className="btn btn--honey" href={business.bookingUrl}>
            Continue to booking
          </a>
        </p>
      </div>
    </section>
  );
}
