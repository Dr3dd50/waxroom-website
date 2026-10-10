// Sections shared by the service landing pages and the group landing pages.
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { CodeVideo } from '../components/CodeVideo';
import { FlipWord } from '../components/FlipWord';
import { GoogleRating, ReviewCard } from '../components/ReviewCard';
import { Sparkles } from '../components/Sparkles';
import { serviceAnchor, type Faq } from '../content/services';
import { business, duration, money, reviews } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { bookLink, membershipLink, packageLink } from '../lib/booking';

export const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

type Service = (typeof business.categories)[number]['services'][number];

export function LandingHero({
  name,
  crumbs,
  flips,
  intro,
}: {
  name: string;
  crumbs: { label: string; href?: string }[];
  flips: [string, string][];
  intro: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (flips.length < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setI((n) => (n + 1) % flips.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [flips.length]);
  const [noun, verb] = flips[i];

  return (
    <section className="hero hero--service" id="top">
      <Sparkles density={0.00003} />
      <div className="hero__inner">
        <nav className="crumbs hero__reveal" aria-label="Breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#menu">Services</a>
          {crumbs.map((c) => (
            <span key={c.label}>
              {' '}
              <span aria-hidden="true">/</span>{' '}
              {c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
        <p className="eyebrow hero__reveal">{name} · Midlothian, VA</p>
        <h1 className="hero__title hero__reveal">
          <span className="sr-only">{name} in Midlothian, VA</span>
          <span className="hero__static" aria-hidden="true">
            Get your{' '}
          </span>
          <span className="hero__flips" aria-hidden="true">
            <FlipWord word={noun} /> <FlipWord word={verb} delay={150} />
          </span>
        </h1>
        <p className="hero__intro hero__reveal">{intro}</p>
        <div className="hero__ctas hero__reveal">
          <a className="btn btn--honey" {...bookLink()}>
            Book your appointment
          </a>
          <a className="btn btn--ghost" href="#prices">
            Services & prices
          </a>
        </div>
        <div className="hero__reveal">
          <GoogleRating compact />
        </div>
      </div>
    </section>
  );
}

export function Film({ video, label, gallery }: { video: string; label: string; gallery: string }) {
  return (
    <section className="svc-film">
      <div className="container">
        <div className="svc-film__frame">
          <CodeVideo slug={video} label={label} />
        </div>
        <div className="svc-film__cta">
          <a className="btn btn--dark" href={`/gallery/#${gallery}`}>
            See real results in the gallery
          </a>
        </div>
      </div>
    </section>
  );
}

export function Highlights({ items }: { items: { title: string; body: string }[] }) {
  return (
    <section className="svc-section">
      <div className="container">
        <p className="eyebrow">Why clients love it</p>
        <div className="highlights reveal-group">
          {items.map((h, i) => (
            <article className="highlight reveal" key={h.title}>
              <span className="highlight__n">{String(i + 1).padStart(2, '0')}</span>
              <h2>{h.title}</h2>
              <p>{h.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** One open price list; each row carries the anchor the menus link to. */
export function PriceRows({ services }: { services: Service[] }) {
  return (
    <ul className="price-list price-list--open">
      {services.map((s) => (
        <li className="price" key={s.name} id={serviceAnchor(s.name)}>
          <div className="price__row">
            <h3 className="price__name">{nice(s.name)}</h3>
            <span className="price__dots" aria-hidden="true" />
            <span className="price__meta">{duration(s.duration)}</span>
            <span className="price__amt">
              {money(s.price)}
              {s.priceVaries ? '+' : ''}
            </span>
          </div>
          {s.description || s.deposit ? (
            <div className="price__desc">
              {s.description
                ? s.description
                    .split(/\n+/)
                    .filter((p) => !/valued at|\$\d/.test(p))
                    .map((p, i) => <p key={i}>{p}</p>)
                : null}
              {s.deposit ? (
                <p className="price__note">
                  {money(s.deposit)} deposit{s.depositNewClientsOnly ? ' for new clients' : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PricesSection({ children }: { children: ReactNode }) {
  return (
    <section className="svc-section svc-section--paper" id="prices">
      <div className="container">
        <div className="prices__head">
          <h2 className="display">
            Services <em>& prices</em>
          </h2>
          <a className="btn btn--dark" {...bookLink()}>
            Book online
          </a>
        </div>
        {children}
      </div>
    </section>
  );
}

export function ReviewsSection({ match, label }: { match: RegExp; label: string }) {
  const matched = reviews.reviews.filter((r) => match.test(r.text));
  const shown = (matched.length >= 3 ? matched : [...matched, ...reviews.reviews.filter((r) => !matched.includes(r))]).slice(0, 6);
  return (
    <section className="svc-section svc-section--paper" id="reviews">
      <div className="container">
        <div className="svc-reviews__head">
          <h2 className="display">
            {matched.length >= 3 ? (
              <>
                What clients say about <em>{label.toLowerCase()}.</em>
              </>
            ) : (
              <>
                What clients <em>say.</em>
              </>
            )}
          </h2>
          <GoogleRating />
        </div>
        <div className="svc-reviews reveal-group">
          {shown.map((r) => (
            <div className="reveal" key={r.id}>
              <ReviewCard r={r} highlight={matched.includes(r) ? match : undefined} />
            </div>
          ))}
        </div>
        <p className="svc-reviews__more">
          <a className="link-arrow" href={reviews.profileUrl} target="_blank" rel="noopener">
            Read all {reviews.count} reviews on Google
          </a>
        </p>
      </div>
    </section>
  );
}

export function OffersSection({ memberships: mNames, packages: pNames }: { memberships: string[]; packages: string[] }) {
  const memberships = business.memberships.filter((m) => mNames.includes(m.name));
  const packages = business.packages.filter((p) => pNames.includes(p.name));
  if (!memberships.length && !packages.length) return null;
  return (
    <section className="svc-section">
      <div className="container">
        <p className="eyebrow">Save with a membership or package</p>
        <div className="cards cards--light reveal-group">
          {memberships.map((m) => (
            <a className="card reveal" key={m.name} {...membershipLink(m.name, m.url)}>
              <span className="card__tag">Membership</span>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <p className="card__price">
                {money(m.price ?? 0)}
                <small>/{m.period}</small>
              </p>
            </a>
          ))}
          {packages.map((p) => (
            <a className="card card--pkg reveal" key={p.name} {...packageLink(p.name)}>
              <span className="card__tag">Package</span>
              <h3>{p.name}</h3>
              <p>{p.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(' + ')}</p>
              <p className="card__price">{money(p.price ?? 0)}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section className="svc-section svc-section--paper">
      <div className="container faq-wrap">
        <h2 className="display">
          Good <em>questions.</em>
        </h2>
        <div className="faqs">
          {faqs.map((f) => (
            <details className="faq" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ExploreMore({ links }: { links: { href: string; label: string }[] }) {
  return (
    <section className="svc-section">
      <div className="container">
        <p className="eyebrow">Explore more</p>
        <ul className="others">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>
                <span>{l.label}</span>
                <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Scroll motion shared by the landing pages. */
export function useLandingMotion(root: RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero__reveal', { y: 30, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out' });
        gsap.fromTo(
          '.svc-film__frame',
          { scale: 0.9, rotate: -1.5 },
          {
            scale: 1,
            rotate: 0,
            ease: 'none',
            scrollTrigger: { trigger: '.svc-film', start: 'top 95%', end: 'top 35%', scrub: true },
          },
        );
        gsap.utils.toArray<HTMLElement>('.reveal-group').forEach((group) => {
          gsap.from(group.querySelectorAll('.reveal'), {
            y: 50,
            opacity: 0,
            stagger: 0.08,
            duration: 1,
            ease: 'expo.out',
            scrollTrigger: { trigger: group, start: 'top 80%' },
          });
        });
        // The timeline line draws itself as you scroll through the steps.
        if (document.querySelector('.steps')) {
          gsap.fromTo('.steps__line i', { scaleY: 0 }, {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: '.steps', start: 'top 70%', end: 'bottom 60%', scrub: true },
          });
        }
        gsap.utils.toArray<HTMLElement>('.step').forEach((step) => {
          gsap.from(step, {
            x: 40,
            opacity: 0.15,
            ease: 'none',
            scrollTrigger: { trigger: step, start: 'top 85%', end: 'top 55%', scrub: true },
          });
        });
      });
    },
    { scope: root },
  );
}
