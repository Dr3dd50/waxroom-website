// The offers, copied from the content repo's offer bank so the website, the booking
// catalog and the ads all say the same thing.
//
//   node scripts/sync-rituals.mjs [path/to/waxroom-content/factory/offers.json]
//
// Writes src/data/rituals.json: every live offer in the new_client_ritual family,
// with its base service matched to the booking catalog (platform/seed/catalog.json)
// for the category, length and GlossGenius name. Prices are cents.
// Writes src/data/offers.json: every live offer (rituals, memberships, packages),
// in the bank's approved words, for the offer landing pages (/offers/<slug>/).
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

// Every live offer, in the bank's approved words. Its shape says what it is: a ritual
// (one-off, for someone new to the service, with a value as arithmetic), a membership
// (billed monthly, with a saving when one is stated) or a package (paid once, with a
// saving against buying the parts). Only figures the bank carries are copied: a page
// shows the sum only where the bank has one.
const offers = [];
for (const [key, o] of Object.entries(bank.offers)) {
  if (o.status !== 'live') continue;
  const kind = o.family === 'new_client_ritual' ? 'ritual' : o.billing ? 'membership' : 'package';
  offers.push({
    key,
    slug: key.replace(/_/g, '-'),
    kind,
    name: o.name,
    price: cents(o.price),
    ...(o.value ? { value: cents(o.value) } : {}),
    ...(o.saving ? { saving: cents(o.saving), savingBasis: o.saving_basis } : {}),
    ...(o.billing ? { billing: o.billing } : {}),
    ...(o.arithmetic ? { arithmetic: o.arithmetic } : {}),
    ...(o.deposit ? { deposit: cents(o.deposit) } : {}),
    includes: o.includes,
    ...(o.eligibility ? { eligibility: o.eligibility } : {}),
    ...(o.audience ? { audience: o.audience } : {}),
    ...(kind === 'ritual' ? { service: find(o.service).name } : {}),
  });
}
writeFileSync(
  resolve(root, 'src/data/offers.json'),
  JSON.stringify({ _source: 'waxroom-content factory/offers.json, by scripts/sync-rituals.mjs. Edit the offer bank there, then re-run.', offers }, null, 2) + '\n',
);
console.log(`${offers.length} offers → src/data/offers.json`);
