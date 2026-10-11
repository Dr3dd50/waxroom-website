// AWS entry points: the API (behind CloudFront at /api/*) and the 15-minute
// scheduled run that sends timed texts and retries Meta events that failed.
// Keys (Stripe, Twilio, Meta, the session secret) live in Secrets Manager and
// are loaded once per cold start, before the app reads its configuration.
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

async function boot() {
  if (process.env.APP_SECRET_ARN) {
    const r = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.APP_SECRET_ARN }));
    for (const [k, v] of Object.entries(JSON.parse(r.SecretString ?? '{}') as Record<string, string>)) if (v) process.env[k] = v;
  }
  const { makeApp, makeStore } = await import('./app');
  const { runDueTexts } = await import('./services/notify');
  const { retryMetaEvents } = await import('./services/meta');
  const { handle } = await import('hono/aws-lambda');
  const store = await makeStore();
  return { handler: handle(makeApp(store)), tick: async () => ({ texts: await runDueTexts(store), meta: await retryMetaEvents(store) }) };
}
const ready = boot();

export const api = async (event: unknown, context: unknown) => (await ready).handler(event as never, context as never);
export const tick = async () => (await ready).tick();
