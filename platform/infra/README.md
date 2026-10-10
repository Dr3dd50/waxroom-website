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

`staff.waxroomrichmond.com` is new, so it can go live at any time.

## 3. Switching booking from GlossGenius to ours

When Twilio's business-texting registration is approved and Stripe is set up:

1. Fill the keys into the `AppKeys` secret (Secrets Manager → the secret → Edit):
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.
2. In Stripe, add a webhook to the `StripeWebhook` output URL for
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`.
   In Twilio, set the Messaging Service's incoming-message webhook to the
   `TwilioWebhook` output URL.
3. Import clients and upcoming appointments from GlossGenius
   (`npm run import:glossgenius -- --clients … --appointments …` with
   `TABLE_NAME` set to the table).
4. `npm run build:native && npx cdk deploy -c booking=native -c attachDomains=true …`:
   every Book button now uses our booking. To go back, deploy `npm run build` again.

Until then every deploy uses the GlossGenius version: the stack refuses a
`dist/` built with our booking unless `-c booking=native` is passed.
