// Pulls the newest Google reviews for The Wax Room's Business Profile via Apify,
// keeps only 5-star reviews with written text, and writes src/data/reviews.json.
// Run on a schedule by .github/workflows/refresh-reviews.yml.
//
//   APIFY_TOKEN=... node scripts/fetch-reviews.mjs
//   node scripts/fetch-reviews.mjs --input saved-dataset.json   # reuse a saved Apify run

import { fileURLToPath } from 'node:url';
import { datasetFromArgsOr, writeJson } from './lib/apify.mjs';

const PLACE_ID = 'ChIJkdP2HwFusYkRlevzsf7f53Q'; // The Wax Room, 11162 Hull Street Rd, Midlothian VA
const MAX_REVIEWS = Number(process.env.MAX_REVIEWS || 300);
const MIN_TEXT_LENGTH = 40; // skip one-word reviews; they don't read well on the page
const KEEP = 200; // enough for every service page to find reviews that mention it
const OUT = fileURLToPath(new URL('../src/data/reviews.json', import.meta.url));

const items = await datasetFromArgsOr('compass/crawler-google-places', {
  startUrls: [{ url: `https://www.google.com/maps/search/?api=1&query=The%20Wax%20Room&query_place_id=${PLACE_ID}` }],
  maxCrawledPlacesPerSearch: 1,
  language: 'en',
  maxReviews: MAX_REVIEWS,
  reviewsSort: 'newest',
  scrapeReviewsPersonalData: true, // reviewer display names; we shorten them below
  maxImages: 0,
  includeWebResults: false,
});

const place = items.find((p) => p.placeId === PLACE_ID) ?? items[0];
if (!place) throw new Error('Apify returned no place for the Google Business Profile.');

// "Jane Doe" -> "Jane D."
const shortName = (name = '') => {
  const [first, ...rest] = name.trim().split(/\s+/);
  if (!first) return 'Google user';
  const given = first[0].toUpperCase() + first.slice(1);
  const last = rest.at(-1);
  return last ? `${given} ${last[0].toUpperCase()}.` : given;
};

const reviews = (place.reviews ?? [])
  .filter((r) => r.stars === 5 && (r.text ?? '').trim().length >= MIN_TEXT_LENGTH)
  .map((r) => ({
    id: r.reviewId,
    name: shortName(r.name),
    text: r.text.trim().replace(/\s*\n\s*/g, ' '),
    date: r.publishedAtDate,
  }))
  .slice(0, KEEP);

if (reviews.length === 0) {
  // Don't wipe the site's reviews because of a bad scrape.
  throw new Error('No 5-star reviews found; leaving src/data/reviews.json untouched.');
}

await writeJson(OUT, {
  placeId: place.placeId,
  rating: place.totalScore,
  count: place.reviewsCount,
  profileUrl: place.url,
  writeReviewUrl: `https://search.google.com/local/writereview?placeid=${place.placeId}`,
  reviews,
});
console.log(`${reviews.length} five-star reviews · ${place.totalScore}★ from ${place.reviewsCount} total`);
