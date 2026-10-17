# Deploying The Wax Room to AWS

Everything is defined in `stack.ts` (AWS CDK), deployed to `us-east-1`:

| Piece | AWS |
| --- | --- |
| Website (`www.waxroomrichmond.com`, bare domain redirects to www) | S3 + CloudFront |
| Staff dashboard (`staff.waxroomrichmond.com`) | S3 + CloudFront |
| API (`/api/*` on both) | Lambda function URL behind CloudFront |
| Data | DynamoDB (on-demand, point-in-time recovery, kept if the stack is removed) |
| Timed texts | EventBridge rule every 15 minutes → Lambda |
| Keys | Secrets Manager secret `AppKeys…` (session secret generated; Stripe and Twilio filled in later) |

## 1. First deploy (nothing public changes yet)

```sh
npm ci
npm run build              # website, GlossGenius version (what's live now)
npm run build:dashboard    # staff dashboard
npx cdk bootstrap          # once per AWS account
npx cdk deploy             # creates everything on *.cloudfront.net addresses
```

The outputs list the two CloudFront addresses and the keys secret. Before
signing in, put a strong password in the secret's `OWNER_PASSWORD` field
(Secrets Manager → the `AppKeys…` secret → Edit). Then sign in to the dashboard
as `waxroomrichmond@gmail.com` with it, and add the team under Settings → Team.

## 2. Put the real names on it (the cutover)

The current site's CloudFront distribution holds `waxroomrichmond.com` and
`www.waxroomrichmond.com`. CloudFront allows a name on one distribution at a
time, so:

1. Remove those two names from the old distribution (CloudFront console → the
   old distribution → Settings → Alternate domain names).
2. Deploy with the names attached. With the domain's Route 53 zone id the DNS
   records and certificate are handled automatically:
   ```sh
   npx cdk deploy -c attachDomains=true -c hostedZoneId=Z0123456789ABC
   ```
   Without Route 53, pass an existing us-east-1 certificate covering
   `waxroomrichmond.com`, `www.` and `staff.` with `-c certificateArn=…`, then
   point the three names at the new distributions at your DNS host.

`staff.waxroomrichmond.com` is new, so it can go live on its own at any time,
leaving the website and its names as they are. `cdk.json` has `"attachStaff": true`,
so a plain `npx cdk deploy` puts the name on the dashboard and keeps it there. The
domain's Route 53 zone is found in the account (or pass `-c hostedZoneId=…`).

If the DNS isn't in Route 53, deploy with `-c dnsElsewhere=true`: the deploy
waits while the certificate is checked, so add the validation record shown in
Certificate Manager (us-east-1) at your DNS host, then a CNAME from `staff` to
the staff distribution's `*.cloudfront.net` address. The full cutover above includes `staff.` too.

Done on Oct 17, 2026: `cdk.json` now has `"attachDomains": true` and `"booking": "native"`,
so every later deploy keeps www on this site with our own booking. Deploy with
`npm run deploy` (website, dashboard and API together); `npm run deploy:live`, for the
GlossGenius version, refuses to run.

## 3. Switching booking from GlossGenius to ours

Only one system takes bookings at a time, so nothing can be booked twice. Until
the owner switches over (dashboard → Settings → Switch from GlossGenius), nothing
here books, texts or charges: the website's Book, membership and package buttons
go to GlossGenius, the API refuses bookings from the website and the desk, no
text goes out, and Stripe isn't called even with its keys in place. Deploying the
native website build early changes nothing for clients.

Getting ready (any time before):

1. Fill the keys into the `AppKeys` secret (Secrets Manager → the secret → Edit):
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.
   Appointment messages can also go by email (Settings → Client texts and emails,
   off to start; the switch needs Twilio, or this with emails on): on
   waxroomrichmond@gmail.com turn on 2-Step Verification, make an app password
   (Google Account → Security → App passwords), and add it to the secret as a new key,
   `GMAIL_APP_PASSWORD` (Edit → Add row). Sending as another Gmail address: add
   `GMAIL_USER` too. Add these as new rows by hand:
   don't change the secret's template in `stack.ts`, which can make AWS generate a
   fresh secret and lose the keys already in it.
   The API reads them when it starts; to restart it now, run
   `aws lambda update-function-configuration --function-name <the WaxRoom-Api… function> --description "keys updated"`.
2. In Stripe (Developers → Webhooks → Add endpoint), send these events to the
   `StripeWebhook` output URL: `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`, `payment_intent.succeeded`. Its signing secret is
   `STRIPE_WEBHOOK_SECRET`. Any API version works.
   In Twilio, set the Messaging Service's incoming-message webhook (Messaging →
   Services → the service → Integration → Send a webhook) to the `TwilioWebhook`
   output URL, `https://staff.waxroomrichmond.com/api/webhooks/twilio`, method POST.
   It keeps working after www moves over.
   Then, on the same Messaging Service → Opt-Out Management (Advanced Opt-Out), set
   the replies Twilio sends for the keywords (the system doesn't send its own):
   - HELP: `The Wax Room, Midlothian VA: appointment texts, and offers if you opted in. Help: (804) 601-8106 or waxroomrichmond@gmail.com. Msg & data rates may apply. Reply STOP to opt out.`
   - STOP: `You're unsubscribed from The Wax Room texts and won't get more. Reply START to get appointment texts again.`
   - START: `You're back on appointment texts from The Wax Room. Reply HELP for help, STOP to opt out.`
3. Each team member's mobile number goes in Settings → Team, for their booking texts.
4. `npm run build:native && npx cdk deploy -c booking=native -c attachDomains=true …`.
5. Dashboard → Settings → Switch from GlossGenius: upload the GlossGenius clients
   and appointments exports, check them, import. Import again as often as you like.

The switch (all at once):

1. In GlossGenius, turn off online booking.
2. Export the appointments again and import them, so its last bookings are here.
   (The switch refuses an import older than 24 hours, and needs the Stripe and
   Twilio keys.)
3. Look over the calendar, tick the box and switch. Online booking, payments and
   texts all start at that moment, and no more GlossGenius imports are taken.
   Choose there whether appointments brought over from GlossGenius get our
   reminders; if so, turn off GlossGenius's reminders and rebooking emails first.

The same import runs from the command line:
`npm run import:glossgenius -- --clients … --appointments …` with `TABLE_NAME` set.

Going back (Settings → Switch from GlossGenius → Go back) stops everything here
again; bookings made here stay on this calendar and need adding to GlossGenius by
hand. Every deploy uses the GlossGenius version of the website unless
`-c booking=native` is passed: the stack refuses a `dist/` built with our booking otherwise.

## 4. Meta pixel and Conversions API

Off until a pixel id is set. What gets reported:

| Event | When | Sent from |
| --- | --- | --- |
| PageView | every page | browser |
| ViewContent | an umbrella or service page | browser |
| InitiateCheckout | a tap on a service that books on GlossGenius | browser + server, one event id |
| Schedule | a booking confirmed on our own booking (after the switch) | browser + server, one event id |
| Subscribe / Purchase | a membership / package bought on our site | browser + server, one event id |

Visitors whose browser sends Global Privacy Control, or who opt out from the
footer's "Your privacy choices", are never tracked (no pixel, no cookies, no
server copy). Email, phone and names leave only as SHA-256 hashes. A server
send that fails is kept and retried by the 15-minute scheduled run.

Setup (business.facebook.com, the business portfolio that owns the ad account):

1. **Find the right pixel.** Events Manager → Data sources. GlossGenius's
   booking pages fire pixel `493010155397281`; if that's in your Events
   Manager, it's yours: use it, so a visit to this site and the booking on
   GlossGenius land in one pixel. Otherwise use your own pixel.
2. Put its id in `src/data/tracking.json` (`metaPixelId`) and rebuild the site.
   Pixel ids aren't secret.
3. Give yourself **Full control** of the dataset (Settings → Users → People →
   you → Assign assets → Datasets), or the next step's link stays grey.
4. Events Manager → the pixel → **Settings → Conversions API → Set up direct
   integration → Generate access token**. Not the "Gateway" wizard and not a
   partner integration: both duplicate what this does.
5. Put the token in the `AppKeys` secret as `META_CAPI_ACCESS_TOKEN`
   (Secrets Manager → Edit; the console merges fields). While testing, also
   set `META_TEST_EVENT_CODE` to the code on the pixel's **Test events** tab
   (just the value, e.g. `TEST12345`).
6. In the pixel's Settings turn **off** "Track events automatically without
   code": it fires guessed events without event ids, which double-count.
7. Optional: Settings → Traffic permissions → allow list `waxroomrichmond.com`.
8. Check: with Test events open, tap a service to book on the site. Expect
   InitiateCheckout from **Browser and Server**, marked **Deduplicated**.
9. **Remove `META_TEST_EVENT_CODE`** from the secret. From here events count.
10. After about two weeks, read Event Match Quality in Events Manager.

