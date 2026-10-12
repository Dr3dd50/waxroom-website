import { useRef } from 'react';
import { SERVICE_PAGES, groupForPage, groupPath, servicePath, type ServicePage as Page } from '../content/services';
import { business } from '../data';
import { Visit } from '../sections/Visit';
import {
  ExploreMore,
  FaqSection,
  Film,
  Highlights,
  LandingHero,
  OffersSection,
  PriceRows,
  PricesSection,
  ReviewsSection,
  useLandingMotion,
} from './serviceParts';

export function ServicePage({ page }: { page: Page }) {
  const root = useRef<HTMLDivElement>(null);
  const services = business.categories.filter((c) => page.categories.includes(c.name)).flatMap((c) => c.services);
  const group = groupForPage(page.slug);
  const others = SERVICE_PAGES.filter((p) => p.slug !== page.slug);
  useLandingMotion(root);

  return (
    <div ref={root}>
      <LandingHero
        name={page.name}
        crumbs={[...(group.landing ? [{ label: group.label, href: groupPath(group) }] : []), { label: page.navLabel }]}
        flips={page.flips}
        intro={page.intro}
      />

      <Film video={page.slug} label={`Doodle animation: ${page.name}`} gallery={page.slug} />

      <Highlights items={page.highlights} />

      <PricesSection>
        <PriceRows services={services} />
      </PricesSection>

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

      <ReviewsSection match={page.reviewMatch} label={page.navLabel} />

      <OffersSection memberships={page.memberships} packages={page.packages} categories={page.categories} />

      <FaqSection faqs={page.faqs} />

      <ExploreMore links={others.map((p) => ({ href: servicePath(p), label: p.name }))} />

      <Visit />
    </div>
  );
}
