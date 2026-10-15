// Meta ad landing pages, /lp/<slug>/ (2026-10-15).
//
// A service page re-cut for someone who saw an ad and has never heard of us: the
// hero names what the treatment fixes, there is no site menu to wander off through,
// and every button books. Only the hero and link-preview copy live here. The
// treatments, prices, what-to-expect, care notes and FAQs come from the service page
// named by `page` (content/services.ts) and the live GlossGenius menu, so a claim or
// a price is written once.
//
// Not for search: prerendered with <meta name="robots" content="noindex, nofollow">
// and left out of sitemap.xml, so these never compete with the service pages that
// rank for the same treatments.

export type AdLandingPage = {
  /** URL segment at /lp/<slug>/. Put it in the ad's destination URL. */
  slug: string;
  /** The service page (content/services.ts) whose copy fills the page below the hero. */
  page: string;
  /** Short name for headings and analytics. */
  label: string;
  seoTitle: string;
  metaDescription: string;
  /** Hero headline: plain words, then the emphasised ending. */
  headline: [plain: string, emphasis: string];
  intro: string;
  /** Which treatments this page sells, matched by name across every GlossGenius category. */
  serviceMatch: RegExp;
  /** The treatment the main Book button opens. */
  primaryService: string;
  /** Reviews whose text matches are shown first. */
  reviewMatch: RegExp;
};

export const AD_LANDING_PAGES: AdLandingPage[] = [
  {
    slug: 'jet-plasma',
    page: 'skin-treatments',
    label: 'Jet Plasma',
    seoTitle: 'Jet Plasma Skin Tightening in Midlothian, VA | The Wax Room',
    metaDescription:
      'Jet Plasma stimulates collagen to tighten skin and smooth fine lines, acne scars and dark spots. Non-invasive, no numbing, no downtime. Book in Midlothian, VA.',
    headline: ['Tighter, smoother skin.', 'No downtime.'],
    intro:
      'Fine lines, acne scars, dark spots, puffy eyes. Jet Plasma uses plasma energy to wake up your skin’s own collagen, so it tightens and smooths from within. Non-invasive, no numbing, and you go straight back to your day.',
    serviceMatch: /jet plasma/i,
    primaryService: 'Jet Plasma Facial',
    reviewMatch: /plasma/i,
  },
];

export const findAdLanding = (slug: string) => AD_LANDING_PAGES.find((p) => p.slug === slug);
export const adLandingPath = (p: AdLandingPage) => `/lp/${p.slug}/`;
