// /text-opt-out/: stop the studio's texts without replying to one. Offers only, or every
// text (the same as replying STOP). The number gets one text saying it's done. Before the
// switch from GlossGenius this site can't reach our booking system, and the texts clients
// get are GlossGenius's, so the page says to reply STOP instead.
import { useState } from 'react';
import { business, phoneDisplay } from '../data';
import { api } from '../lib/api';
import { NATIVE } from '../lib/booking';

type Scope = 'offers' | 'all';

export function TextOptOutPage() {
  const [scope, setScope] = useState<Scope>('offers');
  const [done, setDone] = useState<Scope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get('phone') ?? '');
    setBusy(true);
    setError('');
    try {
      await api('/public/texts/opt-out', { phone, scope });
      setDone(scope);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="book">
      <div className="container manage optout">
        <p className="eyebrow">Text messages</p>
        {done ? (
          <>
            <h1 className="display book__title">
              Done. <em>You’re off the list.</em>
            </h1>
            <p className="lead">
              {done === 'all'
                ? 'You won’t get any more texts from The Wax Room, including appointment reminders. If that number is on file, it gets one text confirming it.'
                : 'You won’t get offers or news by text. Booking confirmations and reminders still come. If that number is on file, it gets one text confirming it.'}
            </p>
            <p className="muted">Changed your mind? Reply START to any text from us.</p>
          </>
        ) : (
          <>
            <h1 className="display book__title">
              Stop our <em>texts.</em>
            </h1>
            {NATIVE ? (
              <form className="book__step details" onSubmit={submit}>
                <p className="lead">You can also reply STOP to any text from us.</p>
                <label className="field">
                  Mobile number
                  <input name="phone" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(804) 555-0123" />
                </label>
                <fieldset className="optout__choices">
                  <legend>What should stop?</legend>
                  <label className="check">
                    <input type="radio" name="scope" checked={scope === 'offers'} onChange={() => setScope('offers')} /> Offers and news only. Keep my booking confirmations and
                    reminders.
                  </label>
                  <label className="check">
                    <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> All texts, including appointment reminders.
                  </label>
                </fieldset>
                {error ? (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button className="btn btn--honey" disabled={busy}>
                  {busy ? 'Stopping…' : 'Stop these texts'}
                </button>
              </form>
            ) : (
              <p className="lead">
                Reply STOP to any text from us and you won’t get any more. Questions? Call or text <a href={`tel:${business.phone}`}>{phoneDisplay(business.phone)}</a>.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
