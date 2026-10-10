// Ports everything The Wax Room's GlossGenius booking site publishes into one
// normalised catalog, the seed for our own booking system and dashboard:
// business details and policies, staff and who performs what, every service,
// memberships with their included services, and packages.
//
//   APIFY_TOKEN=... node scripts/port-glossgenius.mjs
//   node scripts/port-glossgenius.mjs --input saved-dataset.json
//
// Money is in cents and durations in minutes. Nothing is filtered or merged
// here (unlike the website's sync-glossgenius.mjs): this is the full record.
// Client lists, appointments, active memberships and balances are not public;
// they come from a GlossGenius export (see platform/README.md).

import { fileURLToPath } from 'node:url';
import { datasetFromArgsOr, writeJson } from './lib/apify.mjs';

const SITE = 'https://waxroomrichmond.glossgenius.com';
const OUT = fileURLToPath(new URL('../platform/seed/catalog.json', import.meta.url));

const cents = (s) => (s == null || s === '' ? null : Math.round(Number(s) * 100));
const money = (p) => (p ? p.value : null);
const isDefaultImage = (url) => !url || /\/default\//.test(url);
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

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
const html = items.map((i) => i.html || '').find((h) => h.includes('__NEXT_DATA__'));
if (!html) throw new Error('No __NEXT_DATA__ found in the crawled page.');
const ctx = JSON.parse(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]).props.serverContext;
const user = ctx.publicUser;
const prefs = user.preferences;

// Services are listed per staff member; collect each once, with who performs it.
const services = new Map();
for (const member of user.users) {
  for (const s of member.services ?? []) {
    if (!services.has(s.guid)) services.set(s.guid, { s, staff: [] });
    services.get(s.guid).staff.push(member.guid);
  }
}

const checked = (schedule) => (schedule?.options ?? []).filter((o) => o.checked).map(({ unit, value }) => ({ unit, value }));

const catalog = {
  portedAt: new Date().toISOString(),
  source: SITE,
  business: {
    name: user.business_name,
    phone: user.business_phone,
    email: user.business_email,
    address: user.business_address,
    lat: user.business_address_latitude,
    lng: user.business_address_longitude,
    timezone: prefs.timezone,
    about: user.about,
    social: { instagram: user.instagram_url, facebook: user.facebook_url, website: user.website_url },
    hours: prefs.business_hours,
    googleReviewUrl: prefs.review_with_google_url,
  },
  policies: {
    cancellationPolicy: prefs.cancellation_policy,
    cancellationWindowHours: prefs.cancellation_window,
    cancellationFeePercent: prefs.cancellation_fee,
    allowOnlineCancellations: prefs.allow_online_cancellations,
    cardRequired: prefs.credit_card_preference,
    futureBookingsLimit: prefs.enable_future_bookings_limit ? prefs.future_bookings_limit : null,
    defaultGratuityPercent: prefs.default_gratuity_percentage,
    waitlist: prefs.waitlist_registration_enabled,
    buyNowPayLater: prefs.allow_bnpl_payment_method,
    giftCardsForSale: prefs.gift_card_purchase_enabled,
    birthdayEmails: prefs.send_birthday_emails,
    birthdayPromotion: prefs.birthday_promotion,
    requireIntakeForm: prefs.require_form_completion,
    intakeFormUrl: prefs.form_url,
  },
  notifications: {
    confirmationBefore: checked(prefs.client_confirmation_notif_schedule),
    reminderBefore: checked(prefs.client_appt_reminder_notif_schedule),
    rebookingAfter: checked(prefs.client_rebooking_reminder_notif_schedule),
  },
  staff: user.users.map((m) => ({
    id: m.guid,
    name: m.full_name,
    bookable: m.available_for_booking,
    shownOnline: m.online_visible,
    about: m.about,
    avatar: m.default_avatar ? null : m.avatar_medium,
  })),
  services: [...services.values()]
    .sort((a, b) => (a.s.category_name ?? '').localeCompare(b.s.category_name ?? '') || a.s.ordering - b.s.ordering)
    .map(({ s, staff }) => ({
      // memberships and packages refer to services by this token
      id: s.token,
      name: s.name,
      category: s.category_name,
      order: s.ordering,
      price: cents(s.price),
      priceVaries: s.price_varies,
      priceHidden: s.price_hidden,
      duration: s.total_duration,
      durations: { start: s.start_duration, processing: s.processing_duration, end: s.end_duration },
      deposit: cents(s.deposit_amount),
      depositNewClientsOnly: s.deposit_for_new_clients_only,
      description: s.description,
      image: isDefaultImage(s.image) ? null : s.image,
      options: s.options,
      modifierGroups: s.modifier_groups,
      staff,
      createdAt: s.created_at,
    })),
  memberships: ctx.memberships.map((m) => ({
    id: m.token,
    name: m.name,
    description: m.description,
    price: money(m.price),
    renews: m.renewal_frequency,
    renewalLimit: m.renewal_limit_enabled ? m.renewal_limit : null,
    public: m.is_publicly_visible,
    image: m.image?.type === 'DEFAULT' ? null : m.image?.image_url,
    includes: m.benefits.flatMap((b) =>
      b.type === 'PACKAGE'
        ? b.package.items.map((i) => ({
            service: i.name,
            serviceId: i.catalog_item_token,
            quantity: i.quantity,
            allocatedPrice: money(i.price),
            regularPrice: money(i.original_price),
            carriesOver: b.is_carried_over,
          }))
        : [{ benefit: b.type, detail: b }],
    ),
    createdAt: iso(m.created_at),
  })),
  packages: ctx.packages.map((p) => ({
    id: p.token,
    name: p.name,
    price: money(p.price),
    expires: p.expiration_duration || null,
    public: p.is_publicly_visible,
    terms: p.terms?.content || null,
    items: p.items.map((i) => ({ service: i.name, serviceId: i.catalog_item_token, quantity: i.quantity, allocatedPrice: money(i.price) })),
  })),
};

await writeJson(OUT, catalog);
console.log(
  `${catalog.services.length} services, ${catalog.memberships.length} memberships, ${catalog.packages.length} packages, ${catalog.staff.length} staff`,
);
