// Weekly rank tracking for The Wax Room via DataForSEO.
//
// For every keyword in seo/config.json it searches Google Maps from each point
// of the configured grids around the studio (a "geo-grid"), and runs an
// ordinary Google search from the studio for the organic keywords. Writes the
// run to seo/data/rankings/<date>.json and a readable report to seo/RANKINGS.md.
// Run on a schedule by .github/workflows/seo-rankings.yml.
//
//   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... node scripts/seo/rankings.mjs
//   node scripts/seo/rankings.mjs --dry-run        # count the requests and estimate the cost
//   node scripts/seo/rankings.mjs --grids core     # only some grids

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NO_RESULTS, mapLimit, post, spentSoFar } from './lib/dataforseo.mjs';
import { gridPoints, isUs, mapsCompetitors, mapsRank, organicSummary, renderReport, summarizeGrid } from './lib/rankings.mjs';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const readJson = async (p) => JSON.parse(await readFile(root(p), 'utf8'));

const PRICE_PER_SERP = 0.002; // Live mode; Maps bills per 100 listings, organic per 10 results
const ORGANIC_RADIUS = 10000; // location_coordinate radius for organic searches (DataForSEO allows 199-199999)

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const gridsArg = args.includes('--grids') ? args[args.indexOf('--grids') + 1].split(',') : null;

const config = await readJson('seo/config.json');
const business = await readJson('src/data/business.json');
const { placeId } = await readJson('src/data/reviews.json');
const cfg = config.rankings;
const studio = { lat: business.lat, lng: business.lng };
const us = { placeId, domain: config.domain, cid: null };

const grids = cfg.grids
  .filter((g) => !gridsArg || gridsArg.includes(g.name))
  .map((g) => ({ ...g, points: gridPoints(studio, g.size, g.spacingKm) }));
if (gridsArg && grids.length !== gridsArg.length) throw new Error(`Unknown grid in --grids ${gridsArg}; config has ${cfg.grids.map((g) => g.name)}.`);

const mapsJobs = grids.flatMap((g) => cfg.mapsKeywords.flatMap((keyword) => g.points.map((point) => ({ grid: g.name, keyword, point }))));
const organicJobs = cfg.organicKeywords;
const estimate =
  mapsJobs.length * PRICE_PER_SERP * Math.ceil(cfg.mapsDepth / 100) + organicJobs.length * PRICE_PER_SERP * Math.ceil(cfg.organicDepth / 10);
console.log(`${mapsJobs.length} Maps searches + ${organicJobs.length} Google searches, about $${estimate.toFixed(2)}.`);
if (dryRun) process.exit(0);

const search = async (path, task) => {
  try {
    return (await post(path, task))[0]?.items ?? [];
  } catch (err) {
    if (err.code === NO_RESULTS) return [];
    throw err;
  }
};

let done = 0;
const mapsItems = await mapLimit(mapsJobs, 10, async (job) => {
  const items = await search('/serp/google/maps/live/advanced', {
    keyword: job.keyword,
    location_coordinate: `${job.point.lat},${job.point.lng},${cfg.zoom}`,
    language_code: 'en',
    depth: cfg.mapsDepth,
  });
  if (++done % 50 === 0) console.log(`  ${done}/${mapsJobs.length} Maps searches`);
  return items;
});

// Our CID, from any Maps result that matched on place ID, lets the organic map pack (which has no place ID) match too.
us.cid = mapsItems.flat().find((i) => i.type === 'maps_search' && i.place_id === us.placeId)?.cid ?? null;

const organic = await mapLimit(organicJobs, 5, async (keyword) => {
  const items = await search('/serp/google/organic/live/advanced', {
    keyword,
    location_coordinate: `${studio.lat},${studio.lng},${ORGANIC_RADIUS}`,
    language_code: 'en',
    depth: cfg.organicDepth,
  });
  return { keyword, ...organicSummary(items, us) };
});

const date = new Date().toISOString().slice(0, 10);
const run = {
  date,
  cost: spentSoFar(),
  config: { mapsDepth: cfg.mapsDepth, organicDepth: cfg.organicDepth, zoom: cfg.zoom },
  us,
  grids: grids.map((g) => {
    const center = (g.points.length - 1) / 2;
    return {
      name: g.name,
      label: g.label,
      size: g.size,
      spacingKm: g.spacingKm,
      points: g.points,
      keywords: cfg.mapsKeywords.map((keyword) => {
        const results = mapsJobs.map((job, i) => ({ job, items: mapsItems[i] })).filter(({ job }) => job.grid === g.name && job.keyword === keyword);
        const ranks = results.map(({ items }) => mapsRank(items, us));
        return {
          keyword,
          ranks,
          summary: summarizeGrid(ranks, cfg.mapsDepth),
          rankAtStudio: ranks[center],
          competitors: mapsCompetitors(results[center].items, us),
          // Listings that matched us only by website: worth knowing if the place ID ever changes.
          domainOnlyMatches: results.filter(({ items }) => items.some((i) => i.type === 'maps_search' && isUs(i, us) && i.place_id !== us.placeId)).length,
        };
      }),
    };
  }),
  organic,
};

const dir = root('seo/data/rankings');
await mkdir(dir, { recursive: true });
const earlier = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${date}.json`).sort();
const previous = earlier.length ? JSON.parse(await readFile(`${dir}/${earlier.at(-1)}`, 'utf8')) : null;

await writeFile(`${dir}/${date}.json`, JSON.stringify(run, null, 2) + '\n');
await writeFile(root('seo/RANKINGS.md'), renderReport(run, previous));
console.log(`wrote seo/data/rankings/${date}.json and seo/RANKINGS.md (spent $${run.cost.toFixed(3)})`);
