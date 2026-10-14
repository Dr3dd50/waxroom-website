import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridPoints, mapsCompetitors, mapsRank, organicSummary, renderGrid, renderReport, summarizeGrid } from './lib/rankings.mjs';

const studio = { lat: 37.438937, lng: -77.6020993 };
const us = { placeId: 'ChIJus', domain: 'waxroomrichmond.com', cid: '123' };
const listing = (rank, extra = {}) => ({ type: 'maps_search', rank_group: rank, title: `Salon ${rank}`, place_id: `p${rank}`, cid: `c${rank}`, ...extra });

test('gridPoints puts the studio in the middle, north on top, spacing in km', () => {
  const pts = gridPoints(studio, 5, 2.4);
  assert.equal(pts.length, 25);
  assert.deepEqual([pts[12].lat, pts[12].lng], [studio.lat, studio.lng]);
  assert.ok(pts[0].lat > studio.lat && pts[0].lng < studio.lng, 'row 0, col 0 is north-west');
  assert.ok(pts[24].lat < studio.lat && pts[24].lng > studio.lng, 'last point is south-east');
  // 2 steps of 2.4 km north is 4.8 km, about 0.0434 degrees of latitude.
  assert.ok(Math.abs(pts[2].lat - studio.lat - 4.8 / 110.574) < 1e-6);
  // East-west steps are wider in degrees than north-south ones at this latitude.
  assert.ok(pts[13].lng - studio.lng > pts[7].lat - studio.lat);
});

test('gridPoints refuses an even size, which would have no centre point', () => {
  assert.throws(() => gridPoints(studio, 4, 1), /odd/);
});

test('mapsRank matches us by place ID, CID or website, and ignores other result types', () => {
  assert.equal(mapsRank([listing(1), listing(2, { place_id: 'ChIJus' })], us), 2);
  assert.equal(mapsRank([listing(1), listing(3, { cid: '123' })], us), 3);
  assert.equal(mapsRank([listing(1), listing(4, { domain: 'www.WaxRoomRichmond.com' })], us), 4);
  assert.equal(mapsRank([{ type: 'paid', domain: 'waxroomrichmond.com', rank_group: 1 }, listing(1)], us), null);
  assert.equal(mapsRank([listing(1), listing(2)], us), null);
  assert.equal(mapsRank(null, us), null);
});

test('mapsCompetitors lists who is above us, or the top listings when we are absent', () => {
  const items = [listing(1, { rating: { value: 4.9, votes_count: 80 } }), listing(2), listing(3, { place_id: 'ChIJus' }), listing(4)];
  assert.deepEqual(mapsCompetitors(items, us).map((c) => c.rank), [1, 2]);
  assert.deepEqual(mapsCompetitors(items, us)[0], { title: 'Salon 1', rank: 1, rating: 4.9, reviews: 80, category: null });
  assert.deepEqual(mapsCompetitors([listing(1), listing(2), listing(3), listing(4)], us).map((c) => c.rank), [1, 2, 3]);
  assert.deepEqual(mapsCompetitors([listing(1, { place_id: 'ChIJus' }), listing(2)], us), []);
});

test('organicSummary finds our organic rank and map pack spot', () => {
  const items = [
    { type: 'local_pack', rank_group: 1, cid: 'c9' },
    { type: 'local_pack', rank_group: 2, cid: '123' },
    { type: 'ai_overview' },
    { type: 'organic', rank_group: 1, domain: 'www.fresha.com', url: 'https://www.fresha.com/x' },
    { type: 'organic', rank_group: 2, domain: 'www.waxroomrichmond.com', url: 'https://www.waxroomrichmond.com/services/brazilian-waxing/' },
  ];
  assert.deepEqual(organicSummary(items, us), {
    organicRank: 2,
    organicUrl: 'https://www.waxroomrichmond.com/services/brazilian-waxing/',
    hasLocalPack: true,
    localPackRank: 2,
    hasAiOverview: true,
    topDomains: ['fresha.com', 'waxroomrichmond.com'],
  });
  assert.deepEqual(organicSummary([], us), { organicRank: null, organicUrl: null, hasLocalPack: false, localPackRank: null, hasAiOverview: false, topDomains: [] });
});

test('summarizeGrid counts a missing point as depth + 1', () => {
  assert.deepEqual(summarizeGrid([1, 2, null, 5], 20), { points: 4, found: 3, top3: 2, avgRank: 7.3 });
});

test('renderGrid draws rows north to south', () => {
  assert.equal(renderGrid([1, 2, 3, null, 5, 6, 7, 8, 12], 3), '  1  2  3\n --  5  6\n  7  8 12');
});

test('renderReport shows movement against the previous run', () => {
  const run = (avgRank, organicRank) => ({
    date: '2026-10-19',
    cost: 1.4,
    config: { mapsDepth: 20, organicDepth: 20, zoom: '13z' },
    grids: [{ name: 'core', label: 'Midlothian', size: 1, keywords: [{ keyword: 'brazilian wax', ranks: [avgRank], summary: { points: 1, found: 1, top3: 1, avgRank }, rankAtStudio: avgRank, competitors: [] }] }],
    organic: [{ keyword: 'brazilian wax midlothian va', organicRank, hasLocalPack: true, localPackRank: null, hasAiOverview: false, topDomains: ['fresha.com'] }],
  });
  const md = renderReport(run(2, 4), run(5, 3));
  assert.match(md, /\| brazilian wax \| 2 \(▲ 3\) \| 1\/1 \| 1\/1 \|/);
  assert.match(md, /\| brazilian wax midlothian va \| 4 \(▼ 1\) \| not in pack \| no \| fresha.com \|/);
  assert.doesNotMatch(renderReport(run(2, null), null), /▲|▼/);
  assert.match(renderReport(run(2, null), null), /not in top 20/);
});
