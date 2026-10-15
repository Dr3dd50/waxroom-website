import { useRef } from 'react';
import { SERVICE_PAGES, groupForPage, groupPath, servicePath, type ServicePage as Page } from '../content/services';
import { business } from '../data';
import { Visit } from '../sections/Visit';
import {
  CareSection,
  ExpectSection,
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

      <ExpectSection steps={page.expect} />

      <CareSection before={page.before} after={page.after} />

      <ReviewsSection match={page.reviewMatch} label={page.navLabel} />

      <OffersSection memberships={page.memberships} packages={page.packages} categories={page.categories} />

      <FaqSection faqs={page.faqs} />

      <ExploreMore links={others.map((p) => ({ href: servicePath(p), label: p.name }))} />

      <Visit />
    </div>
  );
}
