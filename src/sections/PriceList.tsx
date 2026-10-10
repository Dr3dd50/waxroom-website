import { useRef, useState } from 'react';
import { business, duration, money } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { bookLink } from '../lib/booking';
import { SERVICE_GROUPS, groupCategories } from '../content/services';

const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

/** Every service and price, one category at a time. */
export function PriceList() {
  const [active, setActive] = useState(business.categories[0].slug);
  const cat = business.categories.find((c) => c.slug === active) ?? business.categories[0];
  const list = useRef<HTMLUListElement>(null);
  // the Book button opens the menu on the umbrella of the tab that's showing
  const group = SERVICE_GROUPS.find((g) => groupCategories(g).includes(cat.name))?.key;

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
          <a className="btn btn--dark" {...bookLink({ group })}>
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
                  <a {...bookLink({ service: s.name })} className="link-arrow">
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
