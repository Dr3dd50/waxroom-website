import { useEffect, useState } from 'react';
import { SERVICE_GROUPS, groupHref, groupServices } from '../content/services';
import { business, reviews } from '../data';
import { scrollToHash } from '../lib/motion';

const LEFT = [
  ['/services/skin-treatments/', 'Skin'],
  ['#memberships', 'Memberships'],
] as const;
const RIGHT = [
  ['/gallery/', 'Gallery'],
  ['#reviews', 'Reviews'],
  ['#visit', 'Visit'],
] as const;

// Short, punchy lines from real 5-star Google reviews for the strip above the nav.
const firstSentence = (t: string) => t.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? t;
const SNIPPETS = reviews.reviews
  .map((r) => ({ id: r.id, name: r.name, quote: firstSentence(r.text).trim() }))
  .filter((r) => r.quote.length >= 28 && r.quote.length <= 110)
  .slice(0, 14);

function ReviewStrip() {
  return (
    <a className="strip" href={reviews.profileUrl} target="_blank" rel="noopener" aria-label={`Rated ${reviews.rating} from ${reviews.count} Google reviews`}>
      <span className="strip__score">
        <span className="stars" aria-hidden="true">★</span> {reviews.rating} · {reviews.count} Google reviews
      </span>
      <span className="strip__viewport" aria-hidden="true">
        <span className="strip__track">
          {[...SNIPPETS, ...SNIPPETS].map((s, i) => (
            <span className="strip__item" key={`${s.id}-${i}`}>
              <span className="stars">★★★★★</span> “{s.quote}” <b>{s.name}</b>
            </span>
          ))}
        </span>
      </span>
    </a>
  );
}

const nice = (n: string) => (n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : n);
const GROUPS = SERVICE_GROUPS.map((g) => ({ ...g, href: groupHref(g), services: groupServices(g, business.categories) }));

/** Services ▾ — groups on the left (by problem); the hovered group's named services on the right. */
function ServicesMenu({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const g = GROUPS[group];
  return (
    <div
      className={`dropdown ${open ? 'dropdown--open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button className="dropdown__btn" aria-expanded={open} aria-controls="services-menu" onClick={() => setOpen((o) => !o)}>
        Services
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <div className="dropdown__panel mega" id="services-menu">
        <ul className="mega__groups">
          {GROUPS.map((x, i) => (
            <li key={x.key}>
              <a
                href={x.href}
                className={i === group ? 'is-active' : ''}
                onMouseEnter={() => setGroup(i)}
                onFocus={() => setGroup(i)}
                onClick={onNavigate}
              >
                <b>{x.label}</b>
                <small>{x.problem}</small>
              </a>
            </li>
          ))}
          <li>
            <a className="mega__all" href="/#prices" onClick={onNavigate}>
              Full price list →
            </a>
          </li>
        </ul>
        <div className="mega__services">
          <p className="mega__title">
            {g.label} <span>· {g.services.length} services</span>
          </p>
          <ul>
            {g.services.map((sv) => (
              <li key={sv.name}>
                <a href={sv.href} onClick={onNavigate}>
                  <span>{nice(sv.name)}</span>
                  <small>${sv.price}{sv.priceVaries ? '+' : ''}</small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Nav({ isHome }: { isHome: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.55);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // "#section" links scroll in place on the home page and navigate to "/#section" elsewhere.
  const go = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setOpen(false);
    if (!href.startsWith('#')) return;
    if (!isHome) return;
    e.preventDefault();
    scrollToHash(href);
    history.replaceState(null, '', href);
  };
  const resolveHref = (href: string) => (href.startsWith('#') && !isHome ? `/${href}` : href);

  const link = ([href, label]: readonly [string, string]) => (
    <a key={href} href={resolveHref(href)} onClick={(e) => go(e, href)}>
      {label}
    </a>
  );

  return (
    <header className={`header ${scrolled || !isHome ? 'header--scrolled' : ''} ${open ? 'header--open' : ''}`}>
      <ReviewStrip />
      <div className="nav">
        <button className="nav__toggle" aria-expanded={open} aria-controls="nav-links" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          <span />
          <span />
        </button>
        <nav className="nav__side nav__side--left" aria-label="Main">
          <ServicesMenu onNavigate={() => setOpen(false)} />
          {LEFT.map(link)}
        </nav>
        <a href={isHome ? '#top' : '/'} className="nav__logo" onClick={(e) => go(e, '#top')} aria-label="The Wax Room home">
          <img src="/logo.png" alt="" width={424} height={360} />
        </a>
        <div className="nav__side nav__side--right">
          <nav aria-label="More">{RIGHT.map(link)}</nav>
          <a className="btn btn--dark nav__book" href={business.bookingUrl} target="_blank" rel="noopener">
            Book now
          </a>
        </div>
        <nav className="nav__drawer" id="nav-links" aria-label="Mobile">
          {isHome ? null : (
            <a href="/" className="nav__drawer-home">
              Home
            </a>
          )}
          {GROUPS.map((x) => (
            <details key={x.key} className="drawer-group">
              <summary>{x.label}</summary>
              <div className="drawer-group__list">
                {x.services.map((sv) => (
                  <a key={sv.name} href={sv.href} onClick={() => setOpen(false)}>
                    {nice(sv.name)}
                  </a>
                ))}
                <a className="drawer-group__all" href={x.href} onClick={() => setOpen(false)}>
                  All about {x.label.toLowerCase()} →
                </a>
              </div>
            </details>
          ))}
          {[['#memberships', 'Memberships'] as const, ...RIGHT].map(link)}
        </nav>
      </div>
    </header>
  );
}
