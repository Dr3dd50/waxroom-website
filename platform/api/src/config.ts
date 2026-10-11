// Runtime configuration, from environment variables. Anything missing falls
// back to a safe local-development value; Stripe and Twilio stay simulated
// until their keys are set.

import { fileURLToPath } from 'node:url';
import tracking from '../../../src/data/tracking.json';

const env = process.env;

export const config = {
  /** Where the website and dashboard live (links in texts point here). */
  siteUrl: env.SITE_URL ?? 'http://localhost:5173',
  staffUrl: env.STAFF_URL ?? 'http://localhost:5174',
  tableName: env.TABLE_NAME, // set on AWS → DynamoDB
  dataFile: env.DATA_FILE ?? fileURLToPath(new URL('../.data/store.json', import.meta.url)),
  sessionSecret: env.SESSION_SECRET ?? 'local-dev-secret-change-me',
  secureCookies: env.NODE_ENV === 'production',
  /** Seed sample clients and appointments (local demos only). */
  demoData: env.DEMO_DATA !== 'false' && !env.TABLE_NAME,
  owner: {
    email: env.OWNER_EMAIL ?? 'waxroomrichmond@gmail.com',
    // on AWS this must come from the keys secret; the demo password is local-only
    password: env.OWNER_PASSWORD ?? (env.TABLE_NAME ? undefined : 'waxroom-demo'),
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  },
  /** Meta pixel + Conversions API. The pixel id is shared with the website (src/data/tracking.json). */
  meta: {
    pixelId: env.META_PIXEL_ID || tracking.metaPixelId || undefined,
    token: env.META_CAPI_ACCESS_TOKEN,
    // only while testing in Events Manager → Test events; remove it afterwards
    testCode: env.META_TEST_EVENT_CODE,
  },
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    from: env.TWILIO_FROM,
  },
};

export const stripeLive = () => !!config.stripe.secretKey;
export const twilioLive = () => !!(config.twilio.accountSid && config.twilio.authToken && (config.twilio.messagingServiceSid || config.twilio.from));
