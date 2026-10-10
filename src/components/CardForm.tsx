// Saving a card: Stripe's own card field when Stripe is connected; until then a
// labelled practice form, so the booking flow can be tried end to end.
import { useEffect, useRef, useState } from 'react';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

export type CardSetup = { simulated: boolean; setupId: string; clientSecret: string | null };

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
  onSaved: (extra: { simulatedCard?: { number: string } }) => Promise<void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stripe = useRef<Stripe | null>(null);
  const elements = useRef<StripeElements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [num, setNum] = useState('4242 4242 4242 4242');
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
      if (live) {
        const r = await stripe.current!.confirmSetup({ elements: elements.current!, redirect: 'if_required' });
        if (r.error) throw new Error(r.error.message);
        await onSaved({});
      } else {
        if (num.replace(/\D/g, '').length < 15) throw new Error('Enter a card number.');
        await onSaved({ simulatedCard: { number: num } });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cardform" onSubmit={submit}>
      {live ? (
        <div ref={box} className="cardform__stripe" />
      ) : (
        <div className="cardform__practice">
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
        {busy ? 'One moment…' : submitLabel}
      </button>
    </form>
  );
}
