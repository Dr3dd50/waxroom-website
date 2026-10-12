// Calls from Twilio (a client texted back) and Stripe (payment and
// subscription updates).
import { Hono } from 'hono';
import type { Store } from '../store/store';
import type { Appointment, Client, Membership, Package, Payment } from '../types';
import { config } from '../config';
import { handleInbound } from '../services/notify';
import { validTwilioSignature } from '../services/sms';
import { payments } from '../services/payments';
import { completeDeposit } from '../services/appointments';
import { grantPackage } from '../services/clients';
import { nowIso, rid } from '../lib/util';

type StripeObject = {
  id?: string;
  object?: string;
  status?: string;
  amount?: number;
  amount_paid?: number;
  period_start?: number;
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } } } | null;
  metadata?: Record<string, string>;
};

/** The subscription an invoice belongs to. Newer Stripe API versions moved it under `parent`. */
const subscriptionOf = (o: StripeObject) => {
  const s = o.subscription ?? o.parent?.subscription_details?.subscription;
  return typeof s === 'string' ? s : s?.id;
};

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
    await handleStripeEvent(store, event.type, event.data.object as StripeObject);
    return c.json({ received: true });
  });

  return r;
}

/**
 * Keep our records in step with Stripe. Each case is safe to receive twice, and
 * covers what the booking page would have finished had the client's browser stayed
 * open after approving a payment with their bank.
 */
export async function handleStripeEvent(store: Store, type: string, obj: StripeObject) {
  // Memberships: each member's status and billing period, and a payment line per month.
  if (type === 'invoice.paid' || type === 'invoice.payment_failed' || type === 'customer.subscription.deleted') {
    const subId = type === 'customer.subscription.deleted' ? obj.id : subscriptionOf(obj);
    const client = subId ? (await store.list<Client>('clients')).find((x) => x.membership?.subscriptionId === subId) : undefined;
    if (!client?.membership) return;
    if (type === 'invoice.paid') {
      client.membership.status = 'active';
      client.membership.periodStart = new Date((obj.period_start ?? Date.now() / 1000) * 1000).toISOString();
      const m = await store.get<Membership>('memberships', client.membership.membershipId);
      // the first month was recorded under its invoice id when they joined; renewals are new invoices
      if (obj.id && !(await store.list<Payment>('payments')).some((p) => p.providerId === obj.id))
        await store.put('payments', { id: `${nowIso()}_${rid(4)}`, at: nowIso(), clientId: client.id, kind: 'membership', amount: obj.amount_paid ?? m?.price ?? 0, tip: 0, method: 'card', status: 'paid', providerId: obj.id, simulated: false });
    } else if (type === 'invoice.payment_failed') client.membership.status = 'past_due';
    else client.membership.status = 'cancelled';
    await store.put('clients', client);
    return;
  }

  if (type === 'payment_intent.succeeded' && obj.id) {
    const meta = obj.metadata ?? {};
    // A deposit the client approved: finish the booking. If the time was already
    // released (they took too long), give the money back.
    if (meta.kind === 'deposit' && meta.appointmentId) {
      // (a move gives the appointment a new id, so look for the payment, not the id)
      const appt =
        (await store.get<Appointment>('appointments', meta.appointmentId)) ??
        (await store.range<Appointment>('appointments', new Date(Date.now() - 86400000).toISOString(), '9999')).find((a) => a.deposit?.paymentId === obj.id);
      if (appt?.deposit?.status === 'pending' && appt.deposit.paymentId === obj.id) await completeDeposit(store, appt);
      else if (!appt) await payments.refund(obj.id);
      return;
    }
    if (meta.kind === 'package' && meta.packageId && meta.clientId) {
      const p = await store.get<Package>('packages', meta.packageId);
      const client = await store.get<Client>('clients', meta.clientId);
      if (p && client && obj.amount === p.price) await grantPackage(store, client, p, obj.id, false);
    }
  }
}
