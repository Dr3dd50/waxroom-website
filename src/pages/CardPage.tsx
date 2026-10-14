// /card/?t=…: the link the studio texts a client who booked by phone or walked in,
// to put a card on file through Stripe's own form. Nobody at the studio sees it.
import { useEffect, useState } from 'react';
import { CardForm, type CardSetup } from '../components/CardForm';
import { api } from '../lib/api';
import type { Config } from './BookPage';

export function CardPage() {
  const token = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('t') ?? '';
  const [who, setWho] = useState<{ first: string; card: string | null } | null>(null);
  const [setup, setSetup] = useState<CardSetup | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return setError('This link is missing its code. Use the link from your text.');
    Promise.all([api<{ first: string; card: string | null }>(`/public/card/${token}`), api<Config>('/public/config')])
      .then(async ([w, c]) => {
        setWho(w);
        setKey(c.stripePublishableKey);
        setSetup(await api<CardSetup>(`/public/card/${token}/start`, {}));
      })
      .catch((e) => setError((e as Error).message));
  }, [token]);

  return (
    <section className="book">
      <div className="container manage">
        <p className="eyebrow">Card on file</p>
        {error ? <p className="form-error">{error}</p> : null}
        {!who && !error ? <p className="muted">Loading…</p> : null}
        {who && saved ? (
          <>
            <h1 className="display book__title">
              All set, <em>{who.first}.</em>
            </h1>
            <p className="lead">{saved} is on file for your appointments. Nothing has been charged.</p>
          </>
        ) : null}
        {who && !saved ? (
          <>
            <h1 className="display book__title">
              Add your card, <em>{who.first}.</em>
            </h1>
            <p className="lead">
              We keep a card on file to hold your appointments{who.card ? `, replacing ${who.card}` : ''}. It’s saved securely with Stripe; nothing is charged now.
            </p>
            {setup ? (
              <CardForm
                setup={setup}
                publishableKey={key}
                submitLabel="Save card"
                onSaved={async (extra) => {
                  const r = await api<{ card: string }>(`/public/card/${token}/confirm`, { setupId: setup.setupId, ...extra });
                  setSaved(r.card);
                }}
              />
            ) : !error ? (
              <p className="muted">Loading the card form…</p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
