// Three candidate ways to present the services on the home page, grouped by the
// problem they solve, each group opening into every named service. Built to pull
// visitors into the /services/ pages. The owner picks one; the others get deleted.
import { useRef, useState } from 'react';
import { CodeVideo } from '../components/CodeVideo';
import { SERVICE_GROUPS, findServicePage, groupHref, groupServices } from '../content/services';
import { business, duration, money } from '../data';
import { gsap, ScrollTrigger, useGSAP } from '../lib/motion';

const nice = (n: string) => (n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : n);

const GROUPS = SERVICE_GROUPS.map((g, i) => {
  const services = groupServices(g, business.categories);
  return {
    ...g,
    n: String(i + 1).padStart(2, '0'),
    href: groupHref(g),
    intro: findServicePage(g.pages[0])!.intro,
    services,
    from: Math.min(...services.map((s) => s.price)),
  };
});
type Group = (typeof GROUPS)[number];

/** The dropdown of named services inside a group. */
function ServiceDropdown({ g, open, onToggle }: { g: Group; open?: boolean; onToggle?: (open: boolean) => void }) {
  return (
    <details className="svc-drop" open={open} onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>
          {g.services.length} {g.label.toLowerCase()} services
        </span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </summary>
      <ul>
        {g.services.map((s) => (
          <li key={s.name}>
            <a href={s.href}>
              <span>{nice(s.name)}</span>
              <small>
                {duration(s.duration)} · {money(s.price)}
                {s.priceVaries ? '+' : ''}
              </small>
            </a>
          </li>
        ))}
      </ul>
      <a className="link-arrow svc-drop__more" href={g.href}>
        All about {g.label.toLowerCase()}
      </a>
    </details>
  );
}

/** Option A: an editorial index of problems. Hover floats the doodle; click opens the services. */
export function ShowcaseList() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  // The floating doodle only previews a closed row's title; it never covers an open list.
  const showing = active !== null && !openRows.has(active) ? active : null;
  const toggleRow = (i: number, isOpen: boolean) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(i);
      else next.delete(i);
      return next;
    });

  useGSAP(
    () => {
      const preview = root.current!.querySelector<HTMLElement>('.sc-list__preview')!;
      const x = gsap.quickTo(preview, 'x', { duration: 0.5, ease: 'power3' });
      const y = gsap.quickTo(preview, 'y', { duration: 0.5, ease: 'power3' });
      const move = (e: PointerEvent) => {
        const r = root.current!.getBoundingClientRect();
        x(e.clientX - r.left);
        y(e.clientY - r.top);
      };
      root.current!.addEventListener('pointermove', move);
      gsap.from('.sc-list__item', {
        y: 40,
        opacity: 0,
        stagger: 0.06,
        duration: 0.9,
        ease: 'expo.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%' },
      });
      return () => root.current?.removeEventListener('pointermove', move);
    },
    { scope: root },
  );

  return (
    <section className="sc-list" ref={root}>
      <div className="container">
        <div className="sc-head">
          <p className="eyebrow">What can we help with?</p>
          <h2 className="display">
            Start with <em>the problem.</em>
          </h2>
        </div>
        <ol className="sc-list__rows">
          {GROUPS.map((g, i) => (
            <li key={g.key} className="sc-list__item">
              <details className="sc-list__details" onToggle={(e) => toggleRow(i, (e.currentTarget as HTMLDetailsElement).open)}>
                <summary className="sc-list__row" onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
                  <span className="sc-list__n">{g.n}</span>
                  <span className="sc-list__thumb" aria-hidden="true">
                    <CodeVideo slug={g.video} label="" />
                  </span>
                  <span className="sc-list__name">
                    {g.label}
                    <small>{g.problem}</small>
                  </span>
                  <span className="sc-list__from">
                    {g.services.length} services · from {money(g.from)}
                  </span>
                  <span className="sc-list__toggle" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="sc-list__panel">
                  <ul>
                    {g.services.map((s) => (
                      <li key={s.name}>
                        <a href={s.href}>
                          <span>{nice(s.name)}</span>
                          <small>
                            {money(s.price)}
                            {s.priceVaries ? '+' : ''}
                          </small>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <a className="btn btn--dark" href={g.href}>
                    All about {g.label.toLowerCase()}
                  </a>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>
      <div className={`sc-list__preview ${showing !== null ? 'is-on' : ''}`} aria-hidden="true">
        {GROUPS.map((g, i) => (
          <div key={g.key} className={`sc-list__clip ${showing === i ? 'is-active' : ''}`}>
            <CodeVideo slug={g.video} label="" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Option B: a bento grid, one doodle tile per problem, each with its services dropdown. */
export function ShowcaseBento() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.from('.sc-tile', {
        y: 60,
        opacity: 0,
        stagger: 0.07,
        duration: 1,
        ease: 'expo.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%' },
      });
    },
    { scope: root },
  );
  return (
    <section className="sc-bento" ref={root}>
      <div className="container">
        <div className="sc-head">
          <p className="eyebrow">What can we help with?</p>
          <h2 className="display">
            Pick your <em>glow-up.</em>
          </h2>
        </div>
        <div className="sc-bento__grid">
          {GROUPS.map((g) => (
            <article key={g.key} className={`sc-tile sc-tile--${g.key}`}>
              <a className="sc-tile__media" href={g.href} tabIndex={-1} aria-hidden="true">
                <CodeVideo slug={g.video} label="" />
              </a>
              <div className="sc-tile__body">
                <a className="sc-tile__name" href={g.href}>
                  {g.label}
                </a>
                <span className="sc-tile__tag">{g.problem}</span>
                <ServiceDropdown g={g} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Option C: a sticky doodle frame that changes as you scroll through each problem. */
export function ShowcaseStory() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>('.sc-story__item').forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: (self) => self.isActive && setActive(i),
        });
        gsap.from(el.querySelectorAll('.reveal'), {
          y: 30,
          opacity: 0,
          stagger: 0.08,
          duration: 0.9,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 70%' },
        });
      });
    },
    { scope: root },
  );
  return (
    <section className="sc-story" ref={root}>
      <div className="container">
        <div className="sc-head">
          <p className="eyebrow">What can we help with?</p>
          <h2 className="display">
            Tell us what’s <em>bugging you.</em>
          </h2>
        </div>
        <div className="sc-story__grid">
          <div className="sc-story__stage" aria-hidden="true">
            <div className="sc-story__frame">
              {GROUPS.map((g, i) => (
                <div key={g.key} className={`sc-story__clip ${active === i ? 'is-active' : ''}`}>
                  <CodeVideo slug={g.video} label="" />
                </div>
              ))}
            </div>
            <ol className="sc-story__dots">
              {GROUPS.map((g, i) => (
                <li key={g.key} className={active === i ? 'is-active' : ''} />
              ))}
            </ol>
          </div>
          <div className="sc-story__list">
            {GROUPS.map((g) => (
              <article className="sc-story__item" key={g.key}>
                <div className="sc-story__mobile-media" aria-hidden="true">
                  <CodeVideo slug={g.video} label="" />
                </div>
                <span className="sc-story__n reveal">
                  {g.n} · {g.problem}
                </span>
                <h3 className="reveal">{g.label}</h3>
                <p className="reveal">{g.intro}</p>
                <div className="reveal">
                  <ServiceDropdown g={g} />
                </div>
                <div className="sc-story__cta reveal">
                  <a className="btn btn--dark" href={g.href}>
                    All about {g.label.toLowerCase()}
                  </a>
                  <span className="muted">from {money(g.from)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
