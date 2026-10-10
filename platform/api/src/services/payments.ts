// Card payments. With STRIPE_SECRET_KEY set this is Stripe: a customer per
// client, a saved card (SetupIntent) when they book, off-session charges for
// deposits, checkouts and policy fees, and subscriptions for memberships.
// Without a key every call is simulated, so the whole flow can be tried locally.
import Stripe from 'stripe';
import { config, stripeLive } from '../config';
import type { Card, Client, Membership } from '../types';
import { rid } from '../lib/util';

let stripe: Stripe | null = null;
const api = () => (stripe ??= new Stripe(config.stripe.secretKey!));

export type ChargeResult = { ok: boolean; id: string; simulated: boolean; error?: string };

export const payments = {
  live: stripeLive,
  publishableKey: () => config.stripe.publishableKey ?? null,

  async ensureCustomer(c: Client) {
    if (!stripeLive()) return c.customerId ?? `cus_sim_${rid()}`;
    if (c.customerId) return c.customerId;
    const cus = await api().customers.create({ name: `${c.first} ${c.last}`, email: c.email || undefined, phone: c.phone, metadata: { clientId: c.id } });
    return cus.id;
  },

  /** Start saving a card. Returns what the booking page needs to show the card form. */
  async startCardSetup(customerId: string) {
    if (!stripeLive()) return { simulated: true as const, setupId: `seti_sim_${rid()}`, clientSecret: null };
    const si = await api().setupIntents.create({ customer: customerId, usage: 'off_session', automatic_payment_methods: { enabled: true } });
    return { simulated: false as const, setupId: si.id, clientSecret: si.client_secret };
  },

  /** After the card form completes: read back the saved card. */
  async finishCardSetup(setupId: string, simulatedCard?: { number: string }): Promise<Card> {
    if (!stripeLive()) {
      const digits = (simulatedCard?.number ?? '4242424242424242').replace(/\D/g, '');
      const brand = digits.startsWith('3') ? 'Amex' : digits.startsWith('5') ? 'Mastercard' : 'Visa';
      return { brand, last4: digits.slice(-4) || '4242', paymentMethodId: `pm_sim_${rid()}` };
    }
    const si = await api().setupIntents.retrieve(setupId, { expand: ['payment_method'] });
    if (si.status !== 'succeeded') throw new Error('The card wasn’t saved. Please try again.');
    const pm = si.payment_method as Stripe.PaymentMethod;
    return { brand: cap(pm.card?.brand ?? 'card'), last4: pm.card?.last4 ?? '••••', paymentMethodId: pm.id };
  },

  /** Charge the saved card without the client present (deposits, checkouts, fees). */
  async charge(customerId: string, card: Card | undefined, amount: number, description: string, metadata: Record<string, string>): Promise<ChargeResult> {
    if (amount <= 0) return { ok: true, id: 'none', simulated: !stripeLive() };
    if (!card) return { ok: false, id: '', simulated: !stripeLive(), error: 'No card on file' };
    if (!stripeLive()) return { ok: true, id: `pi_sim_${rid()}`, simulated: true };
    try {
      const pi = await api().paymentIntents.create({
        amount,
        currency: 'usd',
        customer: customerId,
        payment_method: card.paymentMethodId,
        off_session: true,
        confirm: true,
        description,
        metadata,
      });
      return { ok: pi.status === 'succeeded', id: pi.id, simulated: false, error: pi.status === 'succeeded' ? undefined : pi.status };
    } catch (e) {
      return { ok: false, id: '', simulated: false, error: (e as Error).message };
    }
  },

  /** Start a monthly membership on the saved card. */
  async subscribe(customerId: string, card: Card, m: Membership): Promise<{ id: string; priceId?: string }> {
    if (!stripeLive()) return { id: `sub_sim_${rid()}` };
    let priceId = m.stripePriceId;
    if (!priceId) {
      const price = await api().prices.create({ currency: 'usd', unit_amount: m.price, recurring: { interval: 'month' }, product_data: { name: m.name, metadata: { membershipId: m.id } } });
      priceId = price.id;
    }
    const sub = await api().subscriptions.create({ customer: customerId, items: [{ price: priceId }], default_payment_method: card.paymentMethodId, metadata: { membershipId: m.id } });
    return { id: sub.id, priceId };
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
