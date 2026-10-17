// Card payments. With STRIPE_SECRET_KEY set this is Stripe: a customer per
// client, a saved card (SetupIntent) when they book, charges to that card for
// deposits, checkouts and policy fees, and subscriptions for memberships.
// Without a key every call is simulated, so the whole flow can be tried locally.
//
// A charge made while the client is on the booking page can come back asking the
// client to approve it with their bank (3-D Secure). Then `needsAuth` carries what
// the page needs to show that step, and the server checks the result afterwards.
import Stripe from 'stripe';
import { config, stripeLive } from '../config';
import type { Card, Client, Membership } from '../types';
import { HttpError, rid } from '../lib/util';

let stripe: Stripe | null = null;
// Nothing reaches Stripe until the switch from GlossGenius, even with keys in place.
// Kept up to date by getSettings, which every booking, payment and checkout reads first.
let allowed = false;
// fetch rather than node's http module: the same client runs on Lambda and in tests
const api = () => {
  if (!allowed) throw new HttpError(409, 'Payments start when you switch over from GlossGenius.');
  return (stripe ??= new Stripe(config.stripe.secretKey!, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 }));
};
/** On AWS, practice payments are never accepted: without Stripe keys, nothing can be paid for. */
const practiceOk = () => {
  if (config.tableName) throw new HttpError(503, 'Payments aren’t set up yet. Please call or text us to book.');
};

export type NeedsAuth = { clientSecret: string; paymentMethodId: string };
export type ChargeResult = { ok: boolean; id: string; simulated: boolean; error?: string; needsAuth?: NeedsAuth };

/** A simulated card ending 3184 (Stripe's own test number for it) asks for approval, so that step can be tried locally. */
const simAsksApproval = (card?: Card) => card?.paymentMethodId.startsWith('pm_sim_') && card.last4 === '3184';

export const payments = {
  live: stripeLive,
  allow(on: boolean) {
    allowed = on;
  },
  publishableKey: () => config.stripe.publishableKey ?? null,

  async ensureCustomer(c: Client) {
    if (!stripeLive()) return (practiceOk(), c.customerId ?? `cus_sim_${rid()}`);
    if (c.customerId && !c.customerId.startsWith('cus_sim_')) return c.customerId;
    const cus = await api().customers.create({ name: `${c.first} ${c.last}`, email: c.email || undefined, phone: c.phone || undefined, metadata: { clientId: c.id } });
    return cus.id;
  },

  /** Start saving a card. Returns what the booking page needs to show the card form. */
  async startCardSetup(customerId: string) {
    if (!stripeLive()) return (practiceOk(), { simulated: true as const, setupId: `seti_sim_${rid()}`, clientSecret: null });
    // cards only: they're what can be charged later for fees and checkout
    const si = await api().setupIntents.create({ customer: customerId, usage: 'off_session', payment_method_types: ['card'] });
    return { simulated: false as const, setupId: si.id, clientSecret: si.client_secret };
  },

  /** After the card form completes: read back the saved card. */
  async finishCardSetup(setupId: string, simulatedCard?: { number: string }): Promise<Card> {
    if (!stripeLive()) {
      practiceOk();
      const digits = (simulatedCard?.number ?? '4242424242424242').replace(/\D/g, '');
      const brand = digits.startsWith('3') ? 'Amex' : digits.startsWith('5') ? 'Mastercard' : 'Visa';
      return { brand, last4: digits.slice(-4) || '4242', paymentMethodId: `pm_sim_${rid()}` };
    }
    const si = await api().setupIntents.retrieve(setupId, { expand: ['payment_method'] });
    if (si.status !== 'succeeded') throw new HttpError(402, 'The card wasn’t saved. Please try again.');
    const pm = si.payment_method as Stripe.PaymentMethod;
    return { brand: cap(pm.card?.brand ?? 'card'), last4: pm.card?.last4 ?? '••••', paymentMethodId: pm.id };
  },

  /**
   * Charge the saved card. `clientPresent` when the client is on the page and can
   * approve a payment their bank flags; otherwise (fees, checkout at the desk) a
   * flagged payment is simply declined.
   */
  async charge(customerId: string, card: Card | undefined, amount: number, description: string, metadata: Record<string, string>, clientPresent = false): Promise<ChargeResult> {
    if (amount <= 0) return { ok: true, id: 'none', simulated: !stripeLive() };
    if (!card) return { ok: false, id: '', simulated: !stripeLive(), error: 'No card on file' };
    if (!stripeLive()) {
      practiceOk();
      const id = `pi_sim_${rid()}`;
      if (simAsksApproval(card)) {
        if (!clientPresent) return { ok: false, id, simulated: true, error: 'The bank asked the cardholder to approve this payment' };
        return { ok: false, id, simulated: true, error: 'authentication_required', needsAuth: { clientSecret: `${id}_secret_sim`, paymentMethodId: card.paymentMethodId } };
      }
      return { ok: true, id, simulated: true };
    }
    try {
      const pi = await api().paymentIntents.create({ amount, currency: 'usd', customer: customerId, payment_method: card.paymentMethodId, off_session: true, confirm: true, description, metadata });
      return { ok: pi.status === 'succeeded', id: pi.id, simulated: false, error: pi.status === 'succeeded' ? undefined : pi.status };
    } catch (e) {
      const err = e as Stripe.errors.StripeError & { raw?: { payment_intent?: Stripe.PaymentIntent } };
      const pi = err.raw?.payment_intent;
      if (err.code === 'authentication_required' && pi?.client_secret) {
        if (!clientPresent) return { ok: false, id: pi.id, simulated: false, error: 'The bank asked the cardholder to approve this payment' };
        return { ok: false, id: pi.id, simulated: false, error: 'authentication_required', needsAuth: { clientSecret: pi.client_secret, paymentMethodId: card.paymentMethodId } };
      }
      return { ok: false, id: pi?.id ?? '', simulated: false, error: err.message };
    }
  },

  /** After the client approved a payment on the page: did it go through, and for what? */
  async paymentStatus(id: string): Promise<{ succeeded: boolean; amount: number; customer: string | null; metadata: Record<string, string> }> {
    if (!stripeLive()) return (practiceOk(), { succeeded: id.startsWith('pi_sim_'), amount: -1, customer: null, metadata: {} });
    // live: only Stripe's own answer counts; an id it doesn't know is simply not paid
    if (!/^pi_[A-Za-z0-9]+$/.test(id)) return { succeeded: false, amount: 0, customer: null, metadata: {} };
    const pi = await api().paymentIntents.retrieve(id).catch(() => null);
    if (!pi) return { succeeded: false, amount: 0, customer: null, metadata: {} };
    return { succeeded: pi.status === 'succeeded', amount: pi.amount, customer: typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? null), metadata: pi.metadata };
  },

  /** Give up on a payment the client never approved, so it can't go through later. */
  async cancelPayment(id: string) {
    if (!stripeLive() || !id || id.startsWith('pi_sim_')) return;
    try {
      await api().paymentIntents.cancel(id);
    } catch {
      /* already succeeded or cancelled: the webhook deals with a late success */
    }
  },

  /** Refund a payment: all of it, or `amount` cents of it. */
  async refund(id: string, amount?: number) {
    if (!stripeLive() || !id || id.startsWith('pi_sim_')) return;
    try {
      await api().refunds.create({ payment_intent: id, ...(amount ? { amount } : {}) });
    } catch (e) {
      // Stripe can send the same event again: a second refund is already done
      if ((e as Stripe.errors.StripeError).code !== 'charge_already_refunded') throw e;
    }
  },

  /**
   * Start a monthly membership on the saved card. The first month is charged now:
   * `active` when it went through, `needsAuth` when the bank wants the client's
   * approval, `error` (and nothing left behind) when it was declined.
   */
  async subscribe(customerId: string, card: Card, m: Membership, clientPresent = false): Promise<{ id: string; priceId?: string; invoiceId?: string; active: boolean; needsAuth?: NeedsAuth; error?: string }> {
    if (!stripeLive()) {
      practiceOk();
      const id = `sub_sim_${rid()}`;
      if (simAsksApproval(card)) {
        if (!clientPresent) return { id, active: false, error: 'The bank asked the cardholder to approve this payment' };
        return { id, active: false, needsAuth: { clientSecret: `pi_sim_${rid()}_secret_sim`, paymentMethodId: card.paymentMethodId } };
      }
      return { id, active: true };
    }
    let priceId = m.stripePriceId;
    if (!priceId) {
      const price = await api().prices.create({ currency: 'usd', unit_amount: m.price, recurring: { interval: 'month' }, product_data: { name: m.name, metadata: { membershipId: m.id } } });
      priceId = price.id;
    }
    const sub = await api().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: card.paymentMethodId,
      payment_behavior: 'allow_incomplete',
      off_session: !clientPresent,
      metadata: { membershipId: m.id },
      expand: ['latest_invoice.payment_intent'],
    });
    const invoice = sub.latest_invoice as (Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null }) | null;
    const pi = invoice?.payment_intent ?? null;
    if (sub.status === 'active' || sub.status === 'trialing') return { id: sub.id, priceId, invoiceId: invoice?.id, active: true };
    if (clientPresent && pi?.status === 'requires_action' && pi.client_secret)
      return { id: sub.id, priceId, invoiceId: invoice?.id, active: false, needsAuth: { clientSecret: pi.client_secret, paymentMethodId: card.paymentMethodId } };
    await api().subscriptions.cancel(sub.id).catch(() => {});
    return { id: sub.id, priceId, active: false, error: pi?.last_payment_error?.message ?? 'The card was declined' };
  },

  /** A membership whose first payment needed the client's approval: is it running now? */
  async subscriptionActive(id: string) {
    if (!stripeLive()) return (practiceOk(), { active: id.startsWith('sub_sim_'), invoiceId: undefined as string | undefined });
    const sub = await api().subscriptions.retrieve(id).catch(() => null);
    if (!sub) return { active: false, invoiceId: undefined };
    return { active: sub.status === 'active' || sub.status === 'trialing', invoiceId: typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id };
  },

  async cancelSubscription(id: string) {
    if (!stripeLive() || id.startsWith('sub_sim_')) return;
    await api().subscriptions.cancel(id);
  },

  webhookEvent(body: string, signature: string) {
    return api().webhooks.constructEvent(body, signature, config.stripe.webhookSecret!);
  },
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
