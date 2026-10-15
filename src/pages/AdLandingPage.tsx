// /lp/<slug>/: where a Meta ad lands (content/adLandingPages.ts).
//
// The service page's parts in a booking-first order for someone who has never heard
// of us: what the treatment fixes, real results, the treatments with prices and a
// Book button on each, what to expect, care notes, reviews, questions, where we are.
// No site menu (App renders AdHeader instead of Nav). Every Book button opens the
// treatment's own GlossGenius calendar, and those links carry data-book-service, so
// lib/tracking reports each tap to Meta and PostHog as a booking started.
import { useRef } from 'react';
import galleryJson from '../data/gallery.json';
import { GoogleRating } from '../components/ReviewCard';
import { Sparkles } from '../components/Sparkles';
import type { AdLandingPage as Ad } from '../content/adLandingPages';
import type { ServicePage } from '../content/services';
import { business } from '../data';
import { bookLink } from '../lib/booking';
import { Visit } from '../sections/Visit';
import { CareSection, ExpectSection, FaqSection, Film, PriceRows, PricesSection, ReviewsSection, useLandingMotion } from './serviceParts';

type Post = { id: string; type: 'image' | 'video' | 'carousel'; caption: string; alt: string | null; image: string; width: number | null; height: number | null };
const posts = (galleryJson as { posts: Post[] }).posts;

export function AdLandingPage({ ad, page }: { ad: Ad; page: ServicePage }) {
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);
  const services = business.categories.flatMap((c) => c.services).filter((s) => ad.serviceMatch.test(s.name));
  const results = posts.filter((p) => ad.serviceMatch.test(p.caption)).slice(0, 6);

  return (
    <div ref={root}>
      <section className="hero hero--service" id="top">
        <Sparkles density={0.00003} />
        <div className="hero__inner">
          <p className="eyebrow hero__reveal">{ad.label} · Midlothian, VA</p>
          <h1 className="hero__title hero__reveal">
            {ad.headline[0]} <em>{ad.headline[1]}</em>
          </h1>
          <p className="hero__intro hero__reveal">{ad.intro}</p>
          <div className="hero__ctas hero__reveal">
            <a className="btn btn--honey" {...bookLink({ service: ad.primaryService })}>
              Book your {ad.primaryService}
            </a>
            <a className="btn btn--ghost" href="#prices">
              Treatments & prices
            </a>
          </div>
          <div className="hero__reveal">
            <GoogleRating compact />
          </div>
        </div>
      </section>

      <Film video={page.slug} label={`Doodle animation: ${page.name}`} />

      {results.length > 0 ? (
        <section className="svc-section svc-section--paper">
          <div className="container">
            <h2 className="display">
              Real <em>results.</em>
            </h2>
            <div className="gal__grid">
              {results.map((p) => (
                <figure key={p.id} className="gal-card">
                  <span className="gal-card__media" style={{ aspectRatio: p.width && p.height ? `${p.width} / ${Math.min(p.height, p.width * 1.4)}` : '4 / 5' }}>
                    <img src={p.image} alt={p.alt ?? ''} loading="lazy" />
                  </span>
                  {p.caption ? <figcaption className="gal-card__caption">{p.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <PricesSection>
        <PriceRows services={services} />
      </PricesSection>

      <ExpectSection steps={page.expect} />

      <CareSection before={page.before} after={page.after} />

      <ReviewsSection match={ad.reviewMatch} label={ad.label} />

      <FaqSection faqs={page.faqs} />

      <Visit />
    </div>
  );
}
