// Joining a membership or buying a package: details, card, done.
import { useEffect, useState } from 'react';
import { attribution, trackConversion } from '../lib/tracking';
import { CardForm, type CardSetup } from '../components/CardForm';
import { business } from '../data';
import { api, cents, needsApproval, type NeedsApproval } from '../lib/api';
import { DetailsForm } from './BookPage';

type Offer = { id: string; name: string; description?: string | null; price: number; includes?: { serviceId: string; quantity: number }[]; items?: { serviceId: string; quantity: number }[]; expiresMonths?: number | null };
type Catalog = { services: { id: string; name: string }[]; memberships: Offer[]; packages: Offer[] };

export function JoinPage() {
  const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const kind: 'membership' | 'package' = q.get('package') ? 'package' : 'membership';
  const wanted = (q.get(kind) ?? '').toLowerCase();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [pk, setPk] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [details, setDetails] = useState<{ clientId: string; setup: CardSetup } | null>(null);
  const [done, setDone] = useState<{ card: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Catalog>('/public/catalog').then(setCatalog, (e) => setError(e.message));
    api<{ stripePublishableKey: string | null; booking: 'open' | 'closed' }>('/public/config').then(
      (c) => {
        setPk(c.stripePublishableKey);
        setClosed(c.booking !== 'open');
      },
      () => setClosed(true),
    );
  }, []);

  const list = catalog ? (kind === 'membership' ? catalog.memberships : catalog.packages) : [];
  const offer = list.find((o) => o.name.toLowerCase() === wanted) ?? null;
  const name = (id: string) => catalog?.services.find((s) => s.id === id)?.name ?? 'Service';
  const base = kind === 'membership' ? 'memberships' : 'packages';

  // Until online booking here opens, memberships and packages are bought on GlossGenius.
  if (closed) {
    const gg = kind === 'membership' ? (business.memberships.find((m) => m.name.toLowerCase() === wanted)?.url ?? business.membershipsUrl) : business.packagesUrl;
    return (
      <section className="book">
        <div className="container book__grid book__grid--single">
          <div className="book__main">
            <p className="eyebrow">{kind === 'membership' ? 'Membership' : 'Package'}</p>
            <h1 className="display book__title">
              Join on <em>GlossGenius.</em>
            </h1>
            <p className="muted">Memberships and packages are sold through our GlossGenius page for now.</p>
            <a className="btn btn--honey" href={gg}>
              Continue to GlossGenius
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="book">
      <div className="container book__grid">
        <div className="book__main">
          <p className="eyebrow">{kind === 'membership' ? 'Membership' : 'Package'}</p>
          {error ? <p className="form-error">{error}</p> : null}
          {catalog && !offer ? (
            <>
              <h1 className="display book__title">
                Choose a <em>{kind}.</em>
              </h1>
              <div className="choice-grid">
                {list.map((o) => (
                  <a key={o.id} className="choice" href={`/join/?${kind}=${encodeURIComponent(o.name)}`}>
                    <strong>{o.name}</strong>
                    <span>
                      {cents(o.price)}
                      {kind === 'membership' ? ' a month' : ''}
                    </span>
                  </a>
                ))}
              </div>
            </>
          ) : null}
          {offer ? (
            <>
              <h1 className="display book__title">{done ? <em>Welcome!</em> : offer.name}</h1>
              {!details && !done ? <DetailsForm path={`/public/${base}/${offer.id}/start`} cta="Continue to card" onDone={setDetails} /> : null}
              {details && !done ? (
                <div className="book__step">
                  <h2>Payment</h2>
                  <CardForm
                    setup={details.setup}
                    publishableKey={pk}
                    submitLabel={kind === 'membership' ? `Join for ${cents(offer.price)} a month` : `Pay ${cents(offer.price)}`}
                    note={kind === 'membership' ? 'Billed monthly to this card. Cancel anytime by texting us before your next billing date.' : undefined}
                    onSaved={async (extra) => {
                      const a = attribution();
                      const finish = (r: { card: string }) => {
                        trackConversion(kind === 'membership' ? 'Subscribe' : 'Purchase', a, { content_name: offer.name, value: offer.price / 100, currency: 'USD' });
                        setDone(r);
                      };
                      const r = await api<{ card: string } | (NeedsApproval & { paymentId?: string })>(`/public/${base}/${offer.id}/confirm`, { clientId: details.clientId, setupId: details.setup.setupId, tracking: a, url: location.href, ...extra });
                      // the bank wants the client to approve the payment first
                      if (needsApproval(r))
                        return {
                          approve: r,
                          after: async () => finish(await api<{ card: string }>(`/public/${base}/${offer.id}/approved`, { clientId: details.clientId, paymentId: r.paymentId, tracking: a, url: location.href })),
                        };
                      finish(r as { card: string });
                    }}
                  />
                </div>
              ) : null}
              {done ? (
                <div className="book__step book__done">
                  <p>
                    {kind === 'membership'
                      ? `You’re a member. ${cents(offer.price)} is billed to ${done.card} each month, and your included visits come off automatically at checkout.`
                      : `Paid with ${done.card}. Your visits are on your account and come off automatically at checkout.`}
                  </p>
                  <a className="btn btn--honey" href="/book/">
                    Book a visit
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {offer ? (
          <aside className="book__summary">
            <h2>{offer.name}</h2>
            {offer.description ? <p className="muted">{offer.description}</p> : null}
            <p className="book__price">
              {cents(offer.price)}
              {kind === 'membership' ? <small> / month</small> : null}
            </p>
            <h3>{kind === 'membership' ? 'Each month includes' : 'Includes'}</h3>
            <ul className="incl">
              {(offer.includes ?? offer.items ?? []).map((i) => (
                <li key={i.serviceId}>
                  {i.quantity}× {name(i.serviceId)}
                </li>
              ))}
            </ul>
            {offer.expiresMonths ? <p className="muted small">Use within {offer.expiresMonths} months.</p> : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
