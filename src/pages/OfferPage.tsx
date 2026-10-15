// /offers/<slug>/: one offer on its own page, for ads and sharing. What you get comes
// first, then the price and (only where the offer bank has one) the sum behind it,
// who it's for, what's in it, the visit, and the fine print.
import { useEffect, useRef, useState } from 'react';
import ritualData from '../data/rituals.json';
import { business, duration, money } from '../data';
import { api } from '../lib/api';
import { bookLink, membershipLink, packageLink } from '../lib/booking';
import { GoogleRating } from '../components/ReviewCard';
import { Sparkles } from '../components/Sparkles';
import { LIVE_OFFERS, membershipOf, needsOurBooking, offerPath, pageFor, partsOf, type Offer } from '../content/offers';
import { findServicePage, servicePath, type Faq } from '../content/services';
import { Visit } from '../sections/Visit';
import { ExploreMore, FaqSection, ReviewsSection, nice, useLandingMotion } from './serviceParts';

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const TAG = { ritual: 'New client ritual', membership: 'Membership', package: 'Package' } as const;
/** The steam, described the same wherever it's part of an offer. */
const STEAM_TEXT = 'A quiet, seated session over a warm infusion of premium-grade herbs: a private hour to pause, breathe and reset.';
/** Danielle takes clients from ads for Jet Plasma, BioRePeel and lashes only, so other offers' pages don't lead with reviews naming her. */
const DANIELLE_PAGES = new Set(['skin-treatments', 'lash-extensions']);
/** Kept as a pass-through so call sites stay unchanged. */
const nb = (s: string) => s;

/** Where the button goes: the ritual's booking, or joining/buying the membership or package. */
function ctaFor(o: Offer) {
  if (o.kind === 'ritual') return { label: `Book the ${o.name}`, link: bookLink({ service: o.name }) };
  if (o.kind === 'membership') return { label: `Join ${o.name}`, link: membershipLink(o.name, membershipOf(o)?.url ?? business.membershipsUrl) };
  return { label: `Get ${o.name}`, link: packageLink(o.name) };
}

/** The sum, only where the bank carries one: a ritual's value, or a saving. */
function mathLine(o: Offer) {
  if (o.kind === 'ritual' && o.value) return o.arithmetic ? `A ${dollars(o.value)} value (${o.arithmetic})` : `Valued at ${dollars(o.value)}`;
  if (o.saving) return `Save ${dollars(o.saving)} ${o.savingBasis ?? ''}${o.arithmetic ? ` (${o.arithmetic.replace(/ x /g, ' × ').replace(/ - /g, ' − ')})` : ''}`.trim();
  return null;
}

export function OfferPage({ offer: o }: { offer: Offer }) {
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);
  // a ritual GlossGenius doesn't have can only be booked once our own booking is open
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!needsOurBooking(o)) return;
    api<{ booking: 'open' | 'closed' }>('/public/config').then((c) => setHidden(c.booking !== 'open'), () => setHidden(true));
  }, [o]);

  const page = pageFor(o);
  const steamPage = findServicePage('yoni-steam');
  const ritual = ritualData.rituals.find((r) => r.key === o.key);
  const label = ritual?.label ?? o.service ?? o.name;
  const cta = ctaFor(o);
  const math = mathLine(o);
  const parts = partsOf(o).filter((p) => p.service);
  const membership = membershipOf(o);

  if (hidden)
    return (
      <section className="hero">
        <div className="hero__inner">
          <h1 className="display">
            Opening <em>soon.</em>
          </h1>
          <p className="hero__intro">This offer can be booked here soon. In the meantime, see what’s on the menu.</p>
          <a className="btn btn--honey" href="/book/">
            See the menu
          </a>
        </div>
      </section>
    );

  // who it's for, and the terms, in the bank's own words and figures
  const terms: string[] =
    o.kind === 'ritual'
      ? [
          `For your first ${label} with us. If you’ve had a ${label} here before, book the ${label} itself.`,
          ...(o.deposit ? [`${dollars(o.deposit)} deposit when you book; it comes off your total.`] : []),
          'Your Yoni Steam is the full hour, at the same visit.',
        ]
      : o.kind === 'membership'
        ? [`${dollars(o.price)} a month, billed to your card.`, 'For clients who come in every month.', 'Book your visits as usual; your membership is applied when you check out.']
        : [`${dollars(o.price)}, paid once.`, 'For clients who come back for these services.', 'Book each visit as usual; it comes off your package when you check out.'];

  const steps =
    o.kind === 'ritual'
      ? [
          { title: 'Book', body: `Pick a time for the ${o.name}${o.deposit ? ` and pay the ${dollars(o.deposit)} deposit` : ''}.` },
          { title: `Your ${label}`, body: page.expect[1]?.body ?? page.intro },
          { title: 'Your Yoni Steam', body: steamPage?.expect[1]?.body ?? 'An hour of warm herbal steam, private and unhurried.' },
        ]
      : page.expect;

  const before = [...new Set([...(page.before ?? []), ...(o.kind === 'ritual' || /steam/i.test(o.includes) ? (steamPage?.before ?? []) : [])])];

  const faqs: Faq[] = [
    ...(o.kind === 'ritual'
      ? [
          { q: `Who is the ${o.name} for?`, a: `Anyone new to ${label} at The Wax Room. It’s priced for your first one; if you’ve had a ${label} with us before, book the ${label} itself.` },
          ...(o.deposit ? [{ q: 'Is there a deposit?', a: `Yes, ${dollars(o.deposit)} when you book. It comes off your total at your visit.` }] : []),
          { q: 'Is the Yoni Steam a medical treatment?', a: 'No. We offer it as a relaxation and self-care ritual, not as a treatment for any condition. Please see your healthcare provider for medical concerns.' },
        ]
      : o.kind === 'membership'
        ? [{ q: `How is ${o.name} billed?`, a: `${dollars(o.price)} a month, charged to the card you join with.` }]
        : [{ q: `When do I pay for ${o.name}?`, a: `Once, up front: ${dollars(o.price)}. Each visit then comes off your package when you check out.` }]),
    ...page.faqs.slice(0, 3),
  ];

  const others = LIVE_OFFERS.filter((x) => x.key !== o.key);

  return (
    <div ref={root}>
      <section className="hero hero--service hero--offer" id="top">
        <Sparkles density={0.00003} />
        <div className="hero__inner">
          <nav className="crumbs hero__reveal" aria-label="Breadcrumb">
            <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#memberships">Offers</a> <span aria-hidden="true">/</span>{' '}
            <span aria-current="page">{o.name}</span>
          </nav>
          <p className="eyebrow hero__reveal">{TAG[o.kind]} · Midlothian, VA</p>
          <h1 className="hero__title hero__reveal offer__title">{o.name}</h1>
          <p className="hero__intro hero__reveal offer__lead">{nb(o.includes)}.</p>
          <div className="offer__price hero__reveal">
            <span className="offer__amt">{dollars(o.price)}</span>
            {o.billing ? <small>/month</small> : null}
            {o.kind === 'ritual' && o.value ? <s>{dollars(o.value)}</s> : null}
            {math ? <p className="offer__math">{math}</p> : null}
          </div>
          <div className="hero__ctas hero__reveal">
            <a className="btn btn--honey" {...cta.link}>
              {cta.label}
            </a>
            <a className="btn btn--ghost" href="#included">
              What’s included
            </a>
          </div>
          <div className="hero__reveal">
            <GoogleRating compact />
          </div>
        </div>
      </section>

      <section className="svc-section svc-section--paper" id="included">
        <div className="container">
          <p className="eyebrow">What’s included</p>
          <ul className="price-list price-list--open">
            {parts.map(({ service: s, quantity }) => (
              <li className="price" key={s!.name}>
                <div className="price__row">
                  <h3 className="price__name">
                    {quantity > 1 ? `${quantity} × ` : ''}
                    {nice(s!.name)}
                  </h3>
                  <span className="price__dots" aria-hidden="true" />
                  <span className="price__meta">{duration(s!.duration)}</span>
                  <span className="price__amt">{money(s!.price)}</span>
                </div>
                <div className="price__desc">
                  {s!.description ? (
                    s!.description
                      .split(/\n+/)
                      .filter((p) => !/valued at|\$\d/.test(p))
                      .map((p, i) => <p key={i}>{p}</p>)
                  ) : /steam/i.test(s!.name) ? (
                    <p>{STEAM_TEXT}</p>
                  ) : null}
                </div>
              </li>
            ))}
            {o.kind === 'ritual' ? (
              <li className="price">
                <div className="price__row">
                  <h3 className="price__name">{nb('Yoni Steam')}</h3>
                  <span className="price__dots" aria-hidden="true" />
                  <span className="price__meta">1 hr</span>
                  <span className="price__amt">Complimentary</span>
                </div>
                <div className="price__desc">
                  <p>{STEAM_TEXT}</p>
                </div>
              </li>
            ) : null}
            {membership ? (
              <li className="price">
                <div className="price__row">
                  <h3 className="price__name">{o.name}</h3>
                  <span className="price__dots" aria-hidden="true" />
                  <span className="price__meta">monthly</span>
                  <span className="price__amt">{dollars(o.price)}/mo</span>
                </div>
                <div className="price__desc">
                  {membership.description
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                </div>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="svc-section">
        <div className="container care reveal-group">
          <article className="care__card care__card--honey reveal">
            <p className="eyebrow">Who it’s for</p>
            <ul>
              {terms.map((t) => (
                <li key={t}>{nb(t)}</li>
              ))}
            </ul>
          </article>
          <article className="care__card reveal">
            <p className="eyebrow">Before your visit</p>
            <ul>
              {before.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="svc-section svc-section--dark">
        <div className="container steps-wrap">
          <div>
            <p className="eyebrow eyebrow--light">How it works</p>
            <h2 className="display">
              What to <em>expect.</em>
            </h2>
          </div>
          <div className="steps">
            <span className="steps__line" aria-hidden="true">
              <i />
            </span>
            <ol>
              {steps.map((s, i) => (
                <li className="step" key={s.title}>
                  <span className="step__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{nb(s.title)}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="offer__again">
            <a className="btn btn--honey" {...cta.link}>
              {cta.label}
            </a>
          </div>
        </div>
      </section>

      <ReviewsSection match={page.reviewMatch} label={page.navLabel} exclude={DANIELLE_PAGES.has(page.slug) ? undefined : /danielle/i} />

      <FaqSection faqs={faqs} />

      <ExploreMore
        links={[{ href: servicePath(page), label: page.name }, ...others.map((x) => ({ href: offerPath(x), label: `${x.name} · ${TAG[x.kind].toLowerCase()}` }))]}
      />

      <Visit />
    </div>
  );
}
