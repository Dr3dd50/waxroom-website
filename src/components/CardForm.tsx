// Saving a card: Stripe's own card field when Stripe is connected; until then a
// labelled practice form, so the booking flow can be tried end to end.
//
// After the card is saved, a payment taken right away (a deposit, a package, the
// first month of a membership) can come back asking the client to approve it with
// their bank. `onSaved` then returns what to approve and what to do after it; the form
// shows the bank's step, and if that fails, offers to try the approval again.
import { useEffect, useRef, useState } from 'react';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import type { NeedsApproval } from '../lib/api';

export type CardSetup = { simulated: boolean; setupId: string; clientSecret: string | null };
export type Approval = { approve: NeedsApproval; after: () => Promise<void> };

export function CardForm({
  setup,
  publishableKey,
  submitLabel,
  note,
  onSaved,
}: {
  setup: CardSetup;
  publishableKey: string | null;
  submitLabel: string;
  note?: string;
  onSaved: (extra: { simulatedCard?: { number: string } }) => Promise<void | Approval>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stripe = useRef<Stripe | null>(null);
  const elements = useRef<StripeElements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [num, setNum] = useState('4242 4242 4242 4242');
  // a payment waiting on the bank's approval (the card itself is already saved)
  const [pending, setPending] = useState<Approval | null>(null);
  const live = !setup.simulated && !!publishableKey && !!setup.clientSecret;

  useEffect(() => {
    if (!live) return;
    let gone = false;
    import('@stripe/stripe-js').then(async ({ loadStripe }) => {
      const s = await loadStripe(publishableKey!);
      if (!s || gone || !box.current) return;
      stripe.current = s;
      elements.current = s.elements({
        clientSecret: setup.clientSecret!,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#d78306', fontFamily: 'Archivo, system-ui, sans-serif', borderRadius: '12px' } },
      });
      elements.current.create('payment', { layout: 'tabs' }).mount(box.current);
    });
    return () => {
      gone = true;
    };
  }, [live, publishableKey, setup.clientSecret]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let next = pending;
      if (!next) {
        let r: Approval | undefined;
        if (live) {
          const s = await stripe.current!.confirmSetup({ elements: elements.current!, redirect: 'if_required' });
          if (s.error) throw new Error(s.error.message);
          r = (await onSaved({})) ?? undefined;
        } else {
          if (num.replace(/\D/g, '').length < 15) throw new Error('Enter a card number.');
          r = (await onSaved({ simulatedCard: { number: num } })) ?? undefined;
        }
        if (!r) return;
        next = r;
        setPending(r);
      }
      // the bank's own approval screen (practice mode: approved straight away)
      if (live) {
        const a = await stripe.current!.confirmCardPayment(next.approve.clientSecret, { payment_method: next.approve.paymentMethodId });
        if (a.error) throw new Error(`${a.error.message ?? 'Your bank didn’t approve the payment.'} You can try the approval again.`);
      }
      await next.after();
      setPending(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cardform" onSubmit={submit}>
      {pending ? <p className="cardform__note">Your card is saved. Your bank asked you to approve this payment.</p> : null}
      {live ? (
        <div ref={box} className="cardform__stripe" hidden={!!pending} />
      ) : (
        <div className="cardform__practice" hidden={!!pending}>
          <p className="cardform__flag">Practice mode: Stripe isn’t connected yet, so nothing is charged.</p>
          <label className="field">
            Card number
            <input inputMode="numeric" autoComplete="cc-number" value={num} onChange={(e) => setNum(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              Expires
              <input placeholder="12 / 29" defaultValue="12 / 29" autoComplete="cc-exp" />
            </label>
            <label className="field">
              CVC
              <input placeholder="123" defaultValue="123" inputMode="numeric" autoComplete="cc-csc" />
            </label>
          </div>
        </div>
      )}
      {note ? <p className="cardform__note">{note}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn--honey btn--wide" disabled={busy}>
        {busy ? 'One moment…' : pending ? 'Approve the payment' : submitLabel}
      </button>
    </form>
  );
}
