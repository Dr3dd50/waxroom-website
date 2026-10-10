# The Wax Room platform

Our own booking, payments, texting and staff dashboard, replacing GlossGenius.
The public website (repo root) stays a static site; this folder holds what sits
behind it.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Catalog seed | `seed/catalog.json` | Everything GlossGenius publishes, ported by `scripts/port-glossgenius.mjs` |
| Dashboard | `staff.waxroomrichmond.com` | Owner and employee logins: calendars, availability, clients; the owner also manages services, offers, referrals, texts, payments and settings |
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

Answered: Chicago takes wig installs and is bookable online here (it's switched
off on her GlossGenius profile); the yoni steam's regular price is $30; no gift
cards; GlossGenius has the right hours; old event and former-staff records are
left out.

Still open:

1. **Luxe Lash Pass** is set up as one of each fill (1, 2, 3 and 4 week) every
   month for $125. One fill a month would cost more than paying normally (the
   4-week fill is $100), but its description promises “saving up to $50 every
   month”. How many fills does it include, and which?
2. **Luxury Wig Installation** is set to 10 minutes in GlossGenius. How long
   should it be booked for?
3. **Bio Scan membership** allows 31 scans a month (daily). Is that right?

## Running it locally

    npm run dev:all    # API :8787, website :5173 (our booking), dashboard :5174

Sample clients and appointments are generated on first run (`platform/api/.data`;
delete it to start fresh). Owner sign-in: waxroomrichmond@gmail.com / waxroom-demo;
employees nyeesha@demo.local and chicago@demo.local, same password.
Stripe and Twilio stay simulated until their keys are set.

## Who can do what

- **Owner (Danielle):** everything, including the day's totals, payments, and
  every change to services, memberships, packages, referral amounts, text
  templates, offers, booking rules, hours and the team.
- **Employees:** their own calendar and the clients they've seen; booking,
  checking in, checking out, moving, cancelling and no-shows on their own
  appointments; their own working hours and time off. No totals, prices,
  offers, referrals, services or settings.

## Two versions of the website

`npm run build` keeps every Book button on GlossGenius (live now).
`npm run build:native` switches to our own booking, memberships and referral
links once Twilio's registration and Stripe are ready. Deploying is in
`platform/infra/README.md`.

    npm run dashboard          # dev server on :5174
    npm run build:dashboard    # → dist-dashboard/, deployed to staff.waxroomrichmond.com
