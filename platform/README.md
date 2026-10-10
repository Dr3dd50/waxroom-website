# The Wax Room platform

Our own booking, payments, texting and staff dashboard, replacing GlossGenius.
The public website (repo root) stays a static site; this folder holds what sits
behind it.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Catalog seed | `seed/catalog.json` | Everything GlossGenius publishes, ported by `scripts/port-glossgenius.mjs` |
| Dashboard | `employee.waxroomrichmond.com` | Owner and employee logins: calendars, clients, services, memberships, referrals, texts |
| Booking | on the website | Pick service → staff → time → details → card on file (Stripe) |
| API | AWS | Appointments, availability, clients, catalog, referrals, webhooks |
| Payments | Stripe | Card on file, deposits, checkout, no-show fees, membership subscriptions, referral credit |
| Texts | Twilio | Confirmations, reminders, rebooking nudges, marketing campaigns (opt-in only) |

Hosting is AWS, alongside the CloudFront distribution that already serves the
domain: the dashboard as its own static site on the `employee` subdomain, the
API as Lambda functions behind API Gateway, Postgres for data, Cognito for
owner/employee logins, EventBridge Scheduler for timed texts.

## What the port covers (public GlossGenius data)

- **Business and policies.** Contact details, hours, timezone. Cancellation: within 24 h = 50% fee, no-show = 100%. A card is always required. Deposits apply to new clients only. Clients can hold up to 3 future bookings. Default tip is 20%. Waitlist is on, buy-now-pay-later is on, birthday emails are on, and an intake form is required.
- **Texts and emails.** Confirmation goes 72 h before, the reminder 24 h before, and a rebooking nudge 6 weeks after.
- **Staff and who performs what.** All 42 services, with price, price-varies flag, durations (including processing time), deposits, descriptions and the staff assigned to each.
- **Memberships and packages.** All 6 memberships, with what each includes per month, and all 3 packages, which expire after 1 year.

## What the port can't see (needs a GlossGenius export or the owner)

- Client list, notes and intake answers
- Upcoming and past appointments
- Who holds an active membership, their billing dates, and remaining package/membership visits
- Staff working hours (only the business hours are public)
- Saved cards: card details can't move from GlossGenius's processor to Stripe, so members and clients re-enter a card once (we prompt them by text at cutover)

## Questions for the owner (found in the port)

1. **Wig installs can't be booked online.** Luxury Wig Installation and the consultation are assigned only to Chicago Chew, who isn't bookable online. Who should take them?
2. **Luxe Lash Pass** includes one each of the 1-, 2-, 3- and 4-week fill every month. Is it meant to be *one fill of any kind* per month?
3. **The Steam Society** lists the yoni steam's regular price as $50; the menu price is $30. Which is right?
4. **Bio Scan membership** allows 31 scans a month (daily). Is that right?
5. **Gift cards.** Selling gift cards is switched off in GlossGenius, but the website links to it. Sell gift cards in the new system, or hide the link?
6. **Old records.** "VCU College Tour" (a one-off event), plus former staff "College Tours" and "Shae Haskins", are still in GlossGenius. Leave them out of the new system?

## Dashboard prototype

`dashboard/` is a clickable prototype of the staff dashboard (sample clients and
appointments, the real ported catalog). Owners see everything; employees see
their own calendar and clients.

    npm run dashboard          # dev server on :5174
    npm run build:dashboard    # → dist-dashboard/, deployable to employee.waxroomrichmond.com
