import { useEffect, useRef, useState } from 'react';
import { CodeVideo } from '../components/CodeVideo';
import { FlipWord } from '../components/FlipWord';
import { GoogleRating, ReviewCard } from '../components/ReviewCard';
import { Sparkles } from '../components/Sparkles';
import { SERVICE_PAGES, serviceAnchor, servicePath, type ServicePage as Page } from '../content/services';
import { business, duration, money, reviews } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { Visit } from '../sections/Visit';

const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

function ServiceHero({ page }: { page: Page }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (page.flips.length < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setI((n) => (n + 1) % page.flips.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [page.flips.length]);
  const [noun, verb] = page.flips[i];

  return (
    <section className="hero hero--service" id="top">
      <Sparkles density={0.00003} />
      <div className="hero__inner">
        <nav className="crumbs hero__reveal" aria-label="Breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#menu">Services</a> <span aria-hidden="true">/</span>{' '}
          <span aria-current="page">{page.navLabel}</span>
        </nav>
        <p className="eyebrow hero__reveal">{page.name} · Midlothian, VA</p>
        <h1 className="hero__title hero__reveal">
          <span className="sr-only">{page.name} in Midlothian, VA</span>
          <span className="hero__static" aria-hidden="true">
            Get your{' '}
          </span>
          <span className="hero__flips" aria-hidden="true">
            <FlipWord word={noun} /> <FlipWord word={verb} delay={150} />
          </span>
        </h1>
        <p className="hero__intro hero__reveal">{page.intro}</p>
        <div className="hero__ctas hero__reveal">
          <a className="btn btn--honey" href={business.bookingUrl} target="_blank" rel="noopener">
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

export function ServicePage({ page }: { page: Page }) {
  const root = useRef<HTMLDivElement>(null);
  const services = business.categories.filter((c) => page.categories.includes(c.name)).flatMap((c) => c.services);

  const matched = reviews.reviews.filter((r) => page.reviewMatch.test(r.text));
  const shownReviews = (matched.length >= 3 ? matched : [...matched, ...reviews.reviews.filter((r) => !matched.includes(r))]).slice(0, 6);
  const memberships = business.memberships.filter((m) => page.memberships.includes(m.name));
  const packages = business.packages.filter((p) => page.packages.includes(p.name));
  const others = SERVICE_PAGES.filter((p) => p.slug !== page.slug);

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
        gsap.fromTo('.steps__line i', { scaleY: 0 }, {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: { trigger: '.steps', start: 'top 70%', end: 'bottom 60%', scrub: true },
        });
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

  return (
    <div ref={root}>
      <ServiceHero page={page} />

      <section className="svc-film">
        <div className="container">
          <div className="svc-film__frame">
            <CodeVideo slug={page.slug} label={`Doodle animation: ${page.name}`} />
          </div>
          <div className="svc-film__cta">
            <a className="btn btn--dark" href={`/gallery/#${page.slug}`}>
              See real results in the gallery
            </a>
          </div>
        </div>
      </section>

      <section className="svc-section">
        <div className="container">
          <p className="eyebrow">Why clients love it</p>
          <div className="highlights reveal-group">
            {page.highlights.map((h, i) => (
              <article className="highlight reveal" key={h.title}>
                <span className="highlight__n">{String(i + 1).padStart(2, '0')}</span>
                <h2>{h.title}</h2>
                <p>{h.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="svc-section svc-section--paper" id="prices">
        <div className="container">
          <div className="prices__head">
            <h2 className="display">
              Services <em>& prices</em>
            </h2>
            <a className="btn btn--dark" href={business.bookingUrl} target="_blank" rel="noopener">
              Book online
            </a>
          </div>
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
        </div>
      </section>

      <section className="svc-section svc-section--dark">
        <div className="container steps-wrap">
          <div>
            <p className="eyebrow eyebrow--light">Your appointment</p>
            <h2 className="display">
              What to <em>expect.</em>
            </h2>
          </div>
          <div className="steps">
            <span className="steps__line" aria-hidden="true">
              <i />
            </span>
            <ol>
              {page.expect.map((s, i) => (
                <li className="step" key={s.title}>
                  <span className="step__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="svc-section">
        <div className="container care reveal-group">
          <article className="care__card reveal">
            <p className="eyebrow">Before your visit</p>
            <ul>
              {page.before.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
          <article className="care__card care__card--honey reveal">
            <p className="eyebrow">Aftercare</p>
            <ul>
              {page.after.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="svc-section svc-section--paper" id="reviews">
        <div className="container">
          <div className="svc-reviews__head">
            <h2 className="display">
              {matched.length >= 3 ? (
                <>
                  What clients say about <em>{page.navLabel.toLowerCase()}.</em>
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
            {shownReviews.map((r) => (
              <div className="reveal" key={r.id}>
                <ReviewCard r={r} highlight={matched.includes(r) ? page.reviewMatch : undefined} />
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

      {memberships.length || packages.length ? (
        <section className="svc-section">
          <div className="container">
            <p className="eyebrow">Save with a membership or package</p>
            <div className="cards cards--light reveal-group">
              {memberships.map((m) => (
                <a className="card reveal" key={m.name} href={m.url} target="_blank" rel="noopener">
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
                <a className="card card--pkg reveal" key={p.name} href={business.packagesUrl} target="_blank" rel="noopener">
                  <span className="card__tag">Package</span>
                  <h3>{p.name}</h3>
                  <p>{p.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(' + ')}</p>
                  <p className="card__price">{money(p.price ?? 0)}</p>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="svc-section svc-section--paper">
        <div className="container faq-wrap">
          <h2 className="display">
            Good <em>questions.</em>
          </h2>
          <div className="faqs">
            {page.faqs.map((f) => (
              <details className="faq" key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="svc-section">
        <div className="container">
          <p className="eyebrow">Explore more</p>
          <ul className="others">
            {others.map((p) => (
              <li key={p.slug}>
                <a href={servicePath(p)}>
                  <span>{p.name}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Visit />
    </div>
  );
}
