import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { findGroupLanding, findServicePage } from '../../src/content/services.ts';
import { buildKeywords, mergeVolumes, renderKeywordReport, unknownPages } from './lib/keywords.mjs';

const config = JSON.parse(await readFile(new URL('../../seo/config.json', import.meta.url), 'utf8'));

test('buildKeywords expands every term with every modifier, first group wins on duplicates', () => {
  const kws = buildKeywords({
    modifiers: ['', 'near me'],
    groups: [
      { page: 'brazilian-waxing', terms: ['Brazilian  Wax'] },
      { page: 'waxing', proposed: 'x', terms: ['brazilian wax', 'waxing'] },
    ],
  });
  assert.deepEqual(kws.map((k) => k.keyword), ['brazilian wax', 'brazilian wax near me', 'waxing', 'waxing near me']);
  assert.equal(kws[0].page, 'brazilian-waxing');
  assert.equal(kws[0].proposed, null);
  assert.equal(kws[2].proposed, 'x');
});

test('every page in seo/config.json is one the site serves', () => {
  const exists = (slug) => slug === 'home' || Boolean(findServicePage(slug) || findGroupLanding(slug));
  assert.deepEqual(unknownPages(config.keywords.groups, exists), []);
  assert.deepEqual(unknownPages([{ page: 'nope' }], exists), ['nope']);
});

test('the configured keyword list fits one Google Ads request and stays within its limits', () => {
  const kws = buildKeywords(config.keywords);
  assert.ok(kws.length <= 1000, `${kws.length} keywords`);
  for (const { keyword } of kws) {
    assert.ok(keyword.length <= 80 && keyword.split(' ').length <= 10, keyword);
    assert.match(keyword, /^[a-z0-9 ]+$/, `Google Ads rejects some symbols: ${keyword}`);
  }
});

test('mergeVolumes joins case-insensitively and keeps keywords Google dropped', () => {
  const rows = mergeVolumes(buildKeywords({ modifiers: [''], groups: [{ page: 'waxing', terms: ['waxing', 'wax studio'] }] }), [
    { keyword: 'Waxing', search_volume: 1900, cpc: 2.5, competition: 'HIGH' },
  ]);
  assert.deepEqual(rows.map((r) => [r.keyword, r.volume, r.cpc]), [['waxing', 1900, 2.5], ['wax studio', null, null]]);
});

test('renderKeywordReport totals per page, biggest first, and separates proposed pages', () => {
  const md = renderKeywordReport({
    date: '2026-10-19',
    location: 'Richmond-Petersburg VA',
    rows: [
      { keyword: 'waxing', page: 'waxing', proposed: null, volume: 100, cpc: 1, competition: 'LOW' },
      { keyword: 'jet plasma', page: 'skin-treatments', proposed: 'jet-plasma', volume: 300, cpc: null, competition: null },
      { keyword: 'plasma pen', page: 'skin-treatments', proposed: 'jet-plasma', volume: null, cpc: null, competition: null },
    ],
  });
  const table = md.split('## Searches per month by page')[1];
  assert.ok(table.indexOf('proposed /services/jet-plasma/') < table.indexOf('| waxing |'));
  assert.match(md, /\| skin-treatments → proposed \/services\/jet-plasma\/ \| 300 \| jet plasma \(300\) \|/);
  assert.match(md, /Plus 1 variants with no reported volume/);
});
