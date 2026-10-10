// Pulls the live service menu, memberships, packages, team and hours from the
// GlossGenius booking site via Apify and writes src/data/business.json.
//
//   APIFY_TOKEN=... node scripts/sync-glossgenius.mjs
//   node scripts/sync-glossgenius.mjs --input saved-dataset.json   # reuse a saved Apify run
//
// GlossGenius server-renders everything into the page's __NEXT_DATA__ blob, so a
// single page crawl with scripts kept is enough to get the whole catalog.

import { datasetFromArgsOr, writeJson } from './lib/apify.mjs';

const SITE = 'https://waxroomrichmond.glossgenius.com';
const OUT = new URL('../src/data/business.json', import.meta.url).pathname;

// Display order on the new site. Anything not listed is appended after.
const CATEGORY_ORDER = [
  'Intimate Waxing',
  'Body and Facial Waxing',
  'Brow Art',
  'Lash Art',
  'Skin Therapy',
  'Yoni Steam',
  'Hair Restoration',
  'Bio scans',
];
// Small or uncategorised items folded into a main category.
const CATEGORY_MERGE = { 'Body Work': 'Body and Facial Waxing', None: 'Body and Facial Waxing', '': 'Body and Facial Waxing' };
// One-off, dated events that shouldn't live on the permanent menu.
const CATEGORY_SKIP = new Set(['College Tours']);
// Staff accounts that aren't people, or that the owner asked to keep off the site.
const TEAM_SKIP = new Set(['College Tours', 'Shae Haskins']);

// Lengths the owner has confirmed where GlossGenius's setting is wrong (minutes).
const DURATION_FIX = { 'Luxury Wig Installation': 60 };

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const cents = (p) => (p ? p.value / 100 : null);
const isDefaultImage = (url) => !url || /\/default\//.test(url);

function nextData(items) {
  for (const item of items) {
    const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(item.html || '');
    if (m) return JSON.parse(m[1]).props.serverContext;
  }
  throw new Error('No __NEXT_DATA__ found in the crawled pages.');
}

const items = await datasetFromArgsOr('apify/website-content-crawler', {
  startUrls: [{ url: `${SITE}/services` }],
  crawlerType: 'cheerio',
  maxCrawlPages: 1,
  saveHtml: true,
  saveMarkdown: false,
  htmlTransformer: 'none',
  removeElementsCssSelector: '',
  proxyConfiguration: { useApifyProxy: true },
});

const ctx = nextData(items);
const user = ctx.publicUser;
const prefs = user.preferences;

// Services are attached per staff member; union them by guid.
const services = new Map();
for (const member of user.users) for (const s of member.services ?? []) services.set(s.guid, s);

const byCategory = new Map();
for (const s of services.values()) {
  const raw = s.category_name ?? 'None';
  if (CATEGORY_SKIP.has(raw)) continue;
  const cat = CATEGORY_MERGE[raw] ?? raw;
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(s);
}

const order = (name) => {
  const i = CATEGORY_ORDER.indexOf(name);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

const categories = [...byCategory.entries()]
  .sort(([a], [b]) => order(a) - order(b))
  .map(([name, list]) => ({
    name,
    slug: slugify(name),
    services: list
      .sort((a, b) => (a.ordering ?? 999) - (b.ordering ?? 999))
      .map((s) => ({
        name: s.name,
        price: Number(s.price),
        priceVaries: s.price_varies,
        duration: DURATION_FIX[s.name] ?? s.total_duration,
        description: (s.description || '').trim(),
        image: isDefaultImage(s.image) ? null : s.image,
        deposit: s.deposit_amount ? Number(s.deposit_amount) : null,
        depositNewClientsOnly: !!s.deposit_for_new_clients_only,
      })),
  }));

const business = {
  syncedAt: new Date().toISOString(),
  source: SITE,
  name: user.business_name,
  phone: user.business_phone,
  email: user.business_email,
  address: user.business_address,
  lat: user.business_address_latitude,
  lng: user.business_address_longitude,
  instagram: user.instagram_url ? `https://instagram.com/${user.instagram_url.replace(/^@/, '')}` : null,
  facebook: user.facebook_url,
  bookingUrl: `${SITE}/booking-flow`,
  giftCardsUrl: `${SITE}/shop/gift-cards`,
  membershipsUrl: `${SITE}/shop/memberships`,
  packagesUrl: `${SITE}/shop/packages`,
  coverImage: user.cover_image_original,
  brand: { primary: prefs.brand_color_override_primary?.colors ?? [], secondary: prefs.brand_color_override_secondary },
  hours: DAYS.map((day) => {
    const h = prefs.business_hours[day];
    return { day, open: h.working ? h.start : null, close: h.working ? h.end : null };
  }),
  cancellationPolicy: prefs.cancellation_policy,
  categories,
  memberships: ctx.memberships
    .filter((m) => m.is_publicly_visible && !m.deleted_at)
    .map((m) => ({ name: m.name, price: cents(m.price), period: m.renewal_frequency === 'P1M' ? 'month' : m.renewal_frequency, description: m.description, url: `${SITE}/shop/memberships/${m.token}` })),
  packages: ctx.packages
    .filter((p) => p.is_publicly_visible && !p.deleted_at)
    .map((p) => ({
      name: p.name,
      price: cents(p.price),
      description: p.description.trim(),
      items: p.items.map((i) => ({ name: i.name, quantity: i.quantity, value: cents(i.original_price) })),
    })),
  team: user.users
    .filter((u) => u.online_visible !== false && !TEAM_SKIP.has(`${u.first_name} ${u.last_name}`.trim()))
    .map((u) => ({
      name: `${u.first_name} ${u.last_name}`.trim(),
      avatar: u.default_avatar || isDefaultImage(u.avatar_original) ? null : u.avatar_original,
    })),
};

await writeJson(OUT, business);
console.log(`${categories.reduce((n, c) => n + c.services.length, 0)} services in ${categories.length} categories`);
