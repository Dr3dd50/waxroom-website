// /r/CODE: a client's personal referral link. Remembers the code for booking.
import { useEffect, useState } from 'react';
import { api, cents } from '../lib/api';

export function ReferralPage() {
  const code = typeof location === 'undefined' ? '' : location.pathname.split('/').filter(Boolean)[1] ?? '';
  const [ref, setRef] = useState<{ code: string; from: string; friendGets: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ code: string; from: string; friendGets: number }>(`/public/referral/${encodeURIComponent(code)}`).then(
      (r) => {
        setRef(r);
        try {
          localStorage.setItem('wr_referral', JSON.stringify({ code: r.code, from: r.from, amount: r.friendGets }));
        } catch {
          /* private mode: the discount still applies if they book in this tab */
        }
      },
      (e) => setError(e.message),
    );
  }, [code]);

  return (
    <section className="book">
      <div className="container manage">
        {ref ? (
          <>
            <p className="eyebrow">A gift from {ref.from}</p>
            <h1 className="display book__title">
              {cents(ref.friendGets)} off your <em>first visit.</em>
            </h1>
            <p className="lead">
              {ref.from} thinks you’ll love The Wax Room. Book your first appointment and {cents(ref.friendGets)} comes off at checkout. {ref.from} gets a thank-you
              credit too.
            </p>
            <a className="btn btn--honey" href="/book/">
              Book your first visit
            </a>
          </>
        ) : null}
        {error ? (
          <>
            <h1 className="display book__title">
              Welcome to <em>The Wax Room.</em>
            </h1>
            <p className="lead">{error}</p>
            <a className="btn btn--honey" href="/book/">
              Book a visit
            </a>
          </>
        ) : null}
      </div>
    </section>
  );
}
