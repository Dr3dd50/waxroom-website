// Local development server: the API on :8787, with the timed texts checked
// every few minutes (on AWS a scheduled Lambda does this).
import { serve } from '@hono/node-server';
import { makeApp, makeStore } from './app';
import { runDueTexts } from './services/notify';
import { stripeLive, twilioLive } from './config';

const store = await makeStore();
const app = makeApp(store);
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`API on http://localhost:${port}/api  ·  payments: ${stripeLive() ? 'Stripe' : 'simulated'}  ·  texts: ${twilioLive() ? 'Twilio' : 'outbox (simulated)'}`);
});
const tick = () => runDueTexts(store).catch((e) => console.error('texts', e));
setInterval(tick, 5 * 60 * 1000);
tick();
