// The ad landing pages (src/content/adLandingPages.ts) sell real treatments from the
// live menu and must stay out of search. These are the ways that silently breaks: a
// renamed treatment on GlossGenius leaves an ad page with nothing to book, and a
// page in the sitemap or without noindex competes with the service pages.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AD_LANDING_PAGES, adLandingPath } from '../../src/content/adLandingPages.ts';
import { findServicePage } from '../../src/content/services.ts';

const root = new URL('../../', import.meta.url);
const business = JSON.parse(readFileSync(new URL('src/data/business.json', root), 'utf8'));
const services = business.categories.flatMap((c) => c.services);

for (const ad of AD_LANDING_PAGES) {
  test(`${ad.slug}: borrows a real service page and books real treatments`, () => {
    assert.ok(findServicePage(ad.page), `no service page "${ad.page}"`);
    const featured = services.filter((s) => ad.serviceMatch.test(s.name));
    assert.ok(featured.length > 0, 'serviceMatch finds nothing on the live menu');
    for (const s of featured) assert.ok(s.token, `${s.name} has no GlossGenius token, so its Book button would not open a calendar`);
    const primary = services.find((s) => s.name === ad.primaryService);
    assert.ok(primary, `primaryService "${ad.primaryService}" is not on the live menu`);
    assert.ok(ad.serviceMatch.test(primary.name), 'primaryService is not one of the featured treatments');
  });

  test(`${ad.slug}: link preview fits`, () => {
    assert.match(ad.slug, /^[a-z0-9-]+$/);
    assert.ok(ad.seoTitle.length <= 60, `${ad.seoTitle.length} chars`);
    assert.ok(ad.metaDescription.length <= 160, `${ad.metaDescription.length} chars`);
  });

  // Needs a build (npm run build); skipped without one.
  test(`${ad.slug}: built page is noindex and not in the sitemap`, { skip: !existsSync(new URL('dist/sitemap.xml', root)) }, () => {
    const html = readFileSync(new URL(`dist${adLandingPath(ad)}index.html`, root), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.equal(readFileSync(new URL('dist/sitemap.xml', root), 'utf8').includes('/lp/'), false);
  });
}
