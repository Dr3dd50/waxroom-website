// Landing page for a service group that spans several pages or categories
// (/services/waxing/, /services/wellness/): what the group covers, a door into
// each of its service pages, and every price in the group in one place.
import { useRef } from 'react';
import { SERVICE_GROUPS, findServicePage, groupHref, serviceAnchor, servicePath, type ServiceGroup } from '../content/services';
import { business, duration, money } from '../data';
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
  nice,
  useLandingMotion,
} from './serviceParts';

const categoriesNamed = (names: string[]) => business.categories.filter((c) => names.includes(c.name));

export function GroupPage({ group }: { group: ServiceGroup }) {
  const root = useRef<HTMLDivElement>(null);
  const landing = group.landing!;
  const pages = group.pages.map((slug) => findServicePage(slug)!);
  const extras = categoriesNamed(group.extraCategories ?? []);
  const unique = (xs: string[]) => [...new Set(xs)];
  useLandingMotion(root);

  return (
    <div ref={root}>
      <LandingHero name={group.label} crumbs={[{ label: group.label }]} flips={landing.flips} intro={landing.intro} />

      <Film video={group.video} label={`Doodle animation: ${group.label}`} gallery={group.key} />

      <section className="svc-section">
        <div className="container">
          <p className="eyebrow">Choose your service</p>
          <h2 className="display group-doors__title">
            Find your <em>service.</em>
          </h2>
          <div className="group-doors reveal-group">
            {pages.map((p) => {
              const services = categoriesNamed(p.categories).flatMap((c) => c.services);
              return (
                <a className="group-door reveal" key={p.slug} href={servicePath(p)}>
                  <span className="group-door__meta">
                    {services.length} {services.length === 1 ? 'service' : 'services'} · from {money(Math.min(...services.map((s) => s.price)))}
                  </span>
                  <h3>{p.name}</h3>
                  <p>{p.tagline}</p>
                  {services.length > 1 ? (
                    <p className="group-door__list">{services.slice(0, 5).map((s) => nice(s.name)).join(' · ')}</p>
                  ) : null}
                  <span className="group-door__go">
                    Explore {p.navLabel.toLowerCase()} <span aria-hidden="true">→</span>
                  </span>
                </a>
              );
            })}
            {extras.flatMap((c) =>
              c.services.map((s) => (
                <a className="group-door reveal" key={s.name} href={`#${serviceAnchor(s.name)}`}>
                  <span className="group-door__meta">
                    {duration(s.duration)} · {money(s.price)}
                  </span>
                  <h3>{nice(s.name)}</h3>
                  {s.description ? <p>{s.description}</p> : null}
                  <span className="group-door__go">
                    See details <span aria-hidden="true">→</span>
                  </span>
                </a>
              )),
            )}
          </div>
        </div>
      </section>

      <Highlights items={landing.highlights} />

      <PricesSection>
        {pages.map((p) => (
          <div className="price-group" key={p.slug}>
            <div className="price-group__head">
              <h3>{p.name}</h3>
              <a className="link-arrow" href={servicePath(p)}>
                About {p.navLabel.toLowerCase()}
              </a>
            </div>
            <PriceRows services={categoriesNamed(p.categories).flatMap((c) => c.services)} />
          </div>
        ))}
        {extras.map((c) => (
          <div className="price-group" key={c.name}>
            <div className="price-group__head">
              <h3>{nice(c.name)}</h3>
            </div>
            <PriceRows services={c.services} />
          </div>
        ))}
      </PricesSection>

      <ReviewsSection match={landing.reviewMatch} label={group.label} />

      <OffersSection
        memberships={unique([...pages.flatMap((p) => p.memberships), ...(landing.memberships ?? [])])}
        packages={unique(pages.flatMap((p) => p.packages))}
      />

      <FaqSection faqs={landing.faqs} />

      <ExploreMore
        links={SERVICE_GROUPS.filter((g) => g.key !== group.key).map((g) => ({ href: groupHref(g), label: g.label }))}
      />

      <Visit />
    </div>
  );
}
