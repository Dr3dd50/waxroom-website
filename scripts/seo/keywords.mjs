// One-off keyword volume study for The Wax Room via DataForSEO (Google Ads data).
//
// Expands every term in seo/config.json with every area modifier ("brazilian
// wax", "brazilian wax near me", "brazilian wax midlothian va", ...), fetches
// average monthly searches for the Richmond area, and writes
// seo/data/keyword-volumes.json and seo/KEYWORDS.md. The report totals volume
// per page and per proposed page, which is how we decide which services earn a
// page of their own. One request per 1,000 keywords, $0.09 each.
//
//   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... node scripts/seo/keywords.mjs
//   node scripts/seo/keywords.mjs --dry-run     # list the keywords and pages, spend nothing

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { findGroupLanding, findServicePage } from '../../src/content/services.ts';
import { get, post, spentSoFar } from './lib/dataforseo.mjs';
import { buildKeywords, mergeVolumes, renderKeywordReport, unknownPages } from './lib/keywords.mjs';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const BATCH = 1000; // keywords per Google Ads task
const PRICE_PER_TASK = 0.09; // Live mode

const config = JSON.parse(await readFile(root('seo/config.json'), 'utf8')).keywords;

// Every page a keyword is assigned to must be one the router actually serves.
const missing = unknownPages(config.groups, (slug) => slug === 'home' || Boolean(findServicePage(slug) || findGroupLanding(slug)));
if (missing.length) throw new Error(`seo/config.json assigns keywords to pages the site does not have: ${missing.join(', ')}`);

const keywords = buildKeywords(config);
const batches = Math.ceil(keywords.length / BATCH);
console.log(`${keywords.length} keywords in ${batches} request(s), about $${(batches * PRICE_PER_TASK).toFixed(2)}.`);
if (process.argv.includes('--dry-run')) {
  for (const k of keywords) console.log(`  ${k.keyword}  ->  ${k.page}${k.proposed ? ` (proposed ${k.proposed})` : ''}`);
  process.exit(0);
}

// The locations list is free; check the configured location before paying for volumes.
const location = (await get('/keywords_data/google_ads/locations')).find((l) => l.location_code === config.locationCode);
if (!location) throw new Error(`location_code ${config.locationCode} is not a Google Ads location in DataForSEO; fix seo/config.json.`);
console.log(`Location: ${location.location_name} (${location.location_type})`);

const results = [];
for (let i = 0; i < keywords.length; i += BATCH) {
  const batch = keywords.slice(i, i + BATCH).map((k) => k.keyword);
  results.push(
    ...(await post('/keywords_data/google_ads/search_volume/live', {
      keywords: batch,
      location_code: config.locationCode,
      language_code: config.languageCode,
      // Google flags intimate-waxing terms as adult and drops them otherwise.
      include_adult_keywords: true,
    })),
  );
}

const rows = mergeVolumes(keywords, results);
const date = new Date().toISOString().slice(0, 10);
await mkdir(root('seo/data'), { recursive: true });
await writeFile(
  root('seo/data/keyword-volumes.json'),
  JSON.stringify({ date, location: location.location_name, locationCode: config.locationCode, cost: spentSoFar(), rows }, null, 2) + '\n',
);
await writeFile(root('seo/KEYWORDS.md'), renderKeywordReport({ date, location: location.location_name, rows }));
console.log(`wrote seo/data/keyword-volumes.json and seo/KEYWORDS.md (spent $${spentSoFar().toFixed(3)})`);
