// The New Client Rituals, copied from the content repo's offer bank so the website,
// the booking catalog and the ads all say the same thing.
//
//   node scripts/sync-rituals.mjs [path/to/waxroom-content/factory/offers.json]
//
// Writes src/data/rituals.json: every live offer in the new_client_ritual family,
// with its base service matched to the booking catalog (platform/seed/catalog.json)
// for the category, length and GlossGenius name. Prices are cents.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = process.argv[2] ?? resolve(root, '../waxroom-content/factory/offers.json');
const bank = JSON.parse(readFileSync(src, 'utf8'));
const catalog = JSON.parse(readFileSync(resolve(root, 'platform/seed/catalog.json'), 'utf8'));
const cents = (s) => Math.round(Number(String(s).replace(/[^0-9.]/g, '')) * 100);
const find = (name) => catalog.services.find((s) => s.name.toLowerCase() === String(name).toLowerCase());

const rituals = [];
for (const [key, o] of Object.entries(bank.offers)) {
  if (o.family !== 'new_client_ritual' || o.status !== 'live') continue;
  const base = find(o.service);
  if (!base) throw new Error(`${key}: no service called "${o.service}" in the booking catalog`);
  rituals.push({
    key,
    name: o.name,
    service: base.name,
    // how the offer names the service in a sentence ("Lash full set", "BioRePeel")
    label: String(o.includes).split(/ and a complimentary/i)[0].trim(),
    category: base.category,
    price: cents(o.price),
    value: cents(o.value),
    deposit: cents(o.deposit),
    arithmetic: o.arithmetic,
    includes: o.includes,
    eligibility: o.eligibility,
  });
}
const out = {
  _source: 'waxroom-content factory/offers.json, by scripts/sync-rituals.mjs. Edit the offer bank there, then re-run.',
  // the steam that comes with every ritual, added to the service's own length when it's booked
  steamMinutes: 60,
  rituals,
};
writeFileSync(resolve(root, 'src/data/rituals.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${rituals.length} rituals → src/data/rituals.json`);
