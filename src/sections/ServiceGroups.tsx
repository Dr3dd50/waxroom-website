// Home-page services, grouped by the problem they solve: one doodle tile per group,
// each opening into every named service, built to pull visitors into /services/ pages.
import { useRef } from 'react';
import { CodeVideo } from '../components/CodeVideo';
import { SERVICE_GROUPS, findServicePage, groupHref, groupServices } from '../content/services';
import { business, duration, money } from '../data';
import { gsap, useGSAP } from '../lib/motion';

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
function ServiceDropdown({ g }: { g: Group }) {
  return (
    <details className="svc-drop">
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

export function ServiceGroups() {
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
    <section className="sc-bento" id="menu" ref={root}>
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
        <p className="sc-bento__all">
          <a className="link-arrow" href="#prices">
            Or see every service and price
          </a>
        </p>
      </div>
    </section>
  );
}
