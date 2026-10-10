import { useRef, useState } from 'react';
import { pageForCategory, servicePath } from '../content/services';
import { business, duration, money, type Category } from '../data';
import { gsap, scrollToHash, useGSAP } from '../lib/motion';

const TAGLINES: Record<string, string> = {
  'intimate-waxing': 'Smooth, quick, and totally judgment-free.',
  'body-and-facial-waxing': 'Lip to toe, done in minutes.',
  'brow-art': 'Shaped, tinted, laminated.',
  'lash-art': 'Full sets and fills that last.',
  'skin-therapy': 'Jet Plasma, BioRePeel and the vajacial.',
  'yoni-steam': 'Pause, breathe, restore.',
  'hair-restoration': 'Plasma regrowth and luxury wig installs.',
  'bio-scans': 'Know what your body needs.',
};

const fromPrice = (c: Category) => Math.min(...c.services.map((s) => s.price));
const coverImage = (c: Category) => c.services.find((s) => s.image)?.image ?? null;
const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

export function Menu() {
  const [active, setActive] = useState(business.categories[0].slug);
  const open = (slug: string) => {
    setActive(slug);
    scrollToHash('#prices');
  };
  return (
    <>
      <CategoryRail onOpen={open} />
      <PriceList active={active} setActive={setActive} />
    </>
  );
}

/** Pinned section that scrolls sideways through every service category. */
function CategoryRail({ onOpen }: { onOpen: (slug: string) => void }) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const el = track.current!;
        const distance = () => el.scrollWidth - window.innerWidth;
        const slide = gsap.to(el, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: root.current,
            pin: true,
            scrub: 0.8,
            start: 'top top',
            end: () => `+=${distance()}`,
            invalidateOnRefresh: true,
          },
        });
        // Parallax the photos inside each card against the sideways motion.
        gsap.utils.toArray<HTMLElement>('.cat__img img').forEach((img) => {
          gsap.fromTo(
            img,
            { xPercent: -12 },
            {
              xPercent: 12,
              ease: 'none',
              scrollTrigger: { trigger: img.parentElement, containerAnimation: slide, start: 'left right', end: 'right left', scrub: true },
            },
          );
        });
        gsap.to('.rail__progress i', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${distance()}`, scrub: true },
        });
      });
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.rail__head > *', {
          y: 40,
          opacity: 0,
          stagger: 0.1,
          duration: 1,
          ease: 'expo.out',
          scrollTrigger: { trigger: root.current, start: 'top 75%' },
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="rail" id="menu" ref={root}>
      <div className="rail__track" ref={track}>
        <header className="rail__head">
          <p className="eyebrow">The menu</p>
          <h2 className="display">
            {business.categories.reduce((n, c) => n + c.services.length, 0)} ways to
            <em> feel like you again.</em>
          </h2>
          <p className="muted">Scroll through the categories, or jump straight to the full price list.</p>
          <a
            href="#prices"
            className="link-arrow"
            onClick={(e) => {
              e.preventDefault();
              scrollToHash('#prices');
            }}
          >
            Full price list
          </a>
        </header>
        {business.categories.map((c, i) => {
          const img = coverImage(c);
          const page = pageForCategory(c.name);
          return (
            <article className="cat" key={c.slug}>
              <div className="cat__img">
                {img ? <img src={img} alt="" loading="lazy" /> : <span className="cat__mono">{c.name[0]}</span>}
              </div>
              <div className="cat__body">
                <span className="cat__num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{c.name}</h3>
                <p className="muted">{TAGLINES[c.slug] ?? ''}</p>
                <ul>
                  {c.services.slice(0, 4).map((s) => (
                    <li key={s.name}>
                      <span>{nice(s.name)}</span>
                      <span>{money(s.price)}</span>
                    </li>
                  ))}
                </ul>
                <div className="cat__foot">
                  <span>From {money(fromPrice(c))}</span>
                  {page ? (
                    <a className="link-arrow" href={servicePath(page)}>
                      Explore
                    </a>
                  ) : (
                    <button className="link-arrow" onClick={() => onOpen(c.slug)}>
                      Prices
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="rail__progress" aria-hidden="true">
        <i />
      </div>
    </section>
  );
}

function PriceList({ active, setActive }: { active: string; setActive: (s: string) => void }) {
  const cat = business.categories.find((c) => c.slug === active) ?? business.categories[0];
  const list = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.from('.price', { y: 18, opacity: 0, stagger: 0.04, duration: 0.6, ease: 'power3.out' });
    },
    { scope: list, dependencies: [active] },
  );

  return (
    <section className="prices" id="prices">
      <div className="container">
        <div className="prices__head">
          <h2 className="display">
            Price <em>list</em>
          </h2>
          <a className="btn btn--dark" href={business.bookingUrl} target="_blank" rel="noopener">
            Book online
          </a>
        </div>
        <div className="tabs" role="tablist" aria-label="Service categories">
          {business.categories.map((c) => (
            <button
              key={c.slug}
              role="tab"
              id={`tab-${c.slug}`}
              aria-selected={c.slug === active}
              aria-controls="price-panel"
              className="tab"
              onClick={() => setActive(c.slug)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <ul className="price-list" id="price-panel" role="tabpanel" aria-labelledby={`tab-${cat.slug}`} ref={list}>
          {cat.services.map((s) => (
            <li className="price" key={s.name}>
              <details>
                <summary>
                  <span className="price__name">{nice(s.name)}</span>
                  <span className="price__dots" aria-hidden="true" />
                  <span className="price__meta">{duration(s.duration)}</span>
                  <span className="price__amt">
                    {money(s.price)}
                    {s.priceVaries ? '+' : ''}
                  </span>
                </summary>
                <div className="price__desc">
                  {s.description ? <p>{s.description}</p> : null}
                  {s.deposit ? (
                    <p className="price__note">
                      {money(s.deposit)} deposit{s.depositNewClientsOnly ? ' for new clients' : ''}
                    </p>
                  ) : null}
                  <a href={business.bookingUrl} target="_blank" rel="noopener" className="link-arrow">
                    Book {nice(s.name)}
                  </a>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
