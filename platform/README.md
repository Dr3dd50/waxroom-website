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
| Texts | Twilio | Confirmations, reminders, calendar links, book-again texts (per service, switched on by the owner), team texts for bookings, moves and cancellations, marketing campaigns (opt-in only) |
| Video editor | `editor/` | Raw phone video in, a post-ready Reel out: retakes, "um"s and pauses cut, captions, sound. Every staff login, under Video editor |

Hosting is AWS, alongside the CloudFront distribution that already serves the
domain: the dashboard as its own static site on the `employee` subdomain, the
API as Lambda functions behind API Gateway, Postgres for data, Cognito for
owner/employee logins, EventBridge Scheduler for timed texts.

## What the port covers (public GlossGenius data)

- **Business and policies.** Contact details, hours, timezone. Cancellation: within 24 h = 50% fee, no-show = 100%. A card is always required. Deposits apply to new clients only. Clients can hold up to 3 future bookings. Default tip is 20%. Waitlist is on, buy-now-pay-later is on, birthday emails are on, and an intake form is required.
- **Texts and emails.** By default the confirmation request goes 72 h before and the reminder 24 h before; the owner sets both, the quiet hours, and which services get a book-again text and when, in Settings → Client texts. A couple of hours after checkout clients are asked to rate the visit 1–5 (Settings → Ratings and reviews): everyone who answers gets the same once-per-client thank-you and the Google review link, whatever the score (Google forbids rewarding reviews or asking only happy clients), and a low score sends the owner a private text.
- **Staff and who performs what.** All 42 services, with price, price-varies flag, durations (including processing time), deposits, descriptions and the staff assigned to each.
- **Memberships and packages.** All 6 memberships, with what each includes per month, and all 3 packages, which expire after 1 year.

## What the port can't see (needs a GlossGenius export or the owner)

- Client list, notes and intake answers
- Upcoming and past appointments
- Who holds an active membership, their billing dates, and remaining package/membership visits
- Staff working hours (only the business hours are public)
- Saved cards: card details can't move from GlossGenius's processor to Stripe, so members and clients re-enter a card once (we prompt them by text at cutover)

## Questions for the owner (found in the port)

Answered: the Luxe Lash Pass is four 1-week fills a month (the only plan
that matches “saving up to $50”: 4 × $45 = $180 for $125); Chicago takes wig installs (booked for 1 hour) and is bookable online here (it's switched
off on her GlossGenius profile); the yoni steam's regular price is $30; no gift
cards; GlossGenius has the right hours; old event and former-staff records are
left out.

Still open:

1. **Bio Scan membership** allows 31 scans a month (daily). Is that right?

## Running it locally

    npm run dev:all    # API :8787, website :5173 (GlossGenius booking, as live), :5175 (our booking), dashboard :5174

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

## Switching from GlossGenius

GlossGenius stays the only booking system until the owner switches over
(dashboard → Settings → Switch from GlossGenius). Before that, nothing here books,
texts or charges, and the website sends people to GlossGenius; the dashboard shows
the imported GlossGenius calendar and clients. The switch needs GlossGenius online
booking turned off and a fresh import, so one system is taking bookings at any
moment and no time can be sold twice. Inside our system, each booking's
availability check and write run under a per-person lock.

The owner decides whether employees see client phone numbers and emails
(Settings → Team texts and privacy). Hidden is the default. Team texts never
include client numbers either way.

## Two versions of the website

`npm run build` keeps every Book button on GlossGenius (live now).
`npm run build:native` switches to our own booking, memberships and referral
links once Twilio's registration and Stripe are ready. Deploying is in
`platform/infra/README.md`.

    npm run dashboard          # dev server on :5174
    npm run build:dashboard    # → dist-dashboard/, deployed to staff.waxroomrichmond.com

## Video editor

Dashboard → Video editor, for the owner and every employee (employees see their own
videos, the owner sees everyone's). Upload a talking-to-camera video of up to 10 minutes and it
comes back as a 1080x1920 MP4, plus an `.srt` caption file:

- **Cut**: false starts and retakes out (the last good take of each line stays), along with
  restart chatter ("okay, again"), "um"s and long pauses. Each cut lands on the voice's own edges
  with a short crossfade, and a 1.0/1.1 punch-in hides the jump.
- **Captions**: three words at a time in Archivo Black, the spoken word in honey, kept off the
  face and clear of the app buttons.
- **Sound**: real recorded effects (Mixkit), set against the speaker's voice. Off, Subtle (a
  whoosh at the open, a pop on prices and numbers) or Lively (plus whooshes on the punch-ins).
  There's an optional music bed 20 dB under the voice.
- **Checks**: loudness, peaks, pauses left, captions on the face. A failed check shows on the video.

It's a server rebuild of [ghost-editor](https://github.com/kurbaitaev/ghost-editor) (MIT).
`editor/THIRD_PARTY.md` maps each step to the ghost-editor script it comes from, and lists the
licences.

Locally, run `sh platform/editor/setup.sh` once (it needs Python 3 and ffmpeg). It installs
faster-whisper and OpenCV and downloads the sound kit and face model; the first edit then
downloads the speech model. `python3 platform/editor/edit.py <video> <out-dir>` edits a file by
hand, and `python3 platform/editor/test_edit.py` tests it. On AWS the editor is a container Lambda
(see `infra/README.md`).
