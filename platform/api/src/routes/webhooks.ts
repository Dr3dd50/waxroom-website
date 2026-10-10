// Calls from Twilio (a client texted back) and Stripe (payment and
// subscription updates).
import { Hono } from 'hono';
import type { Store } from '../store/store';
import type { Client } from '../types';
import { config } from '../config';
import { handleInbound } from '../services/notify';
import { validTwilioSignature } from '../services/sms';
import { payments } from '../services/payments';

export function webhookRoutes(store: Store) {
  const r = new Hono();

  r.post('/twilio', async (c) => {
    const form = Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
    const url = `${config.siteUrl}/api/webhooks/twilio`;
    if (!validTwilioSignature(url, form, c.req.header('x-twilio-signature') ?? '')) return c.text('bad signature', 403);
    await handleInbound(store, form.From, form.Body ?? '');
    // replies are sent through the API, so answer Twilio with an empty TwiML document
    return c.body('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  });

  r.post('/stripe', async (c) => {
    if (!payments.live() || !config.stripe.webhookSecret) return c.text('stripe not configured', 400);
    let event;
    try {
      event = payments.webhookEvent(await c.req.text(), c.req.header('stripe-signature') ?? '');
    } catch {
      return c.text('bad signature', 400);
    }
    // Memberships: keep each member's status and billing period in step with Stripe.
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted') {
      const obj = event.data.object as { subscription?: string; id?: string; period_start?: number };
      const subId = event.type === 'customer.subscription.deleted' ? obj.id : obj.subscription;
      const client = (await store.list<Client>('clients')).find((x) => x.membership?.subscriptionId === subId);
      if (client?.membership) {
        if (event.type === 'invoice.paid') {
          client.membership.status = 'active';
          client.membership.periodStart = new Date((obj.period_start ?? Date.now() / 1000) * 1000).toISOString();
        } else if (event.type === 'invoice.payment_failed') client.membership.status = 'past_due';
        else client.membership.status = 'cancelled';
        await store.put('clients', client);
      }
    }
    return c.json({ received: true });
  });

  return r;
}
