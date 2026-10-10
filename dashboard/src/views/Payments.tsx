import { useEffect, useState } from 'react';
import { api } from '../api';
import { addDays, money, useBoot } from '../ctx';
import { PageHead, Pill, Stat } from '../ui';

type Pay = { id: string; at: string; clientName?: string; kind: string; amount: number; tip: number; method: string; status: string; simulated: boolean; staffId?: string; error?: string };
const KIND: Record<string, string> = { checkout: 'Checkout', deposit: 'Deposit', 'cancel-fee': 'Late-cancel fee', 'no-show-fee': 'No-show fee', membership: 'Membership', package: 'Package' };

export function PaymentsView() {
  const boot = useBoot();
  const [days, setDays] = useState(7);
  const [list, setList] = useState<Pay[] | null>(null);
  useEffect(() => {
    setList(null);
    api<Pay[]>(`/payments?from=${addDays(boot.today, -days + 1)}`).then(setList);
  }, [days, boot.today]);
  const paid = (list ?? []).filter((p) => p.status === 'paid');
  const sum = (f: (p: Pay) => boolean, field: 'amount' | 'tip' = 'amount') => paid.filter(f).reduce((n, p) => n + p[field], 0);
  const tipsBy = boot.staff.map((s) => ({ s, tips: sum((p) => p.staffId === s.id, 'tip') })).filter((x) => x.tips);

  return (
    <div className="page">
      <PageHead title="Payments" sub={boot.live.payments ? 'Through Stripe' : 'Simulated until Stripe is connected'}>
        <div className="seg seg--toggle">
          {[1, 7, 30].map((d) => (
            <button key={d} className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>
              {d === 1 ? 'Today' : `${d} days`}
            </button>
          ))}
        </div>
      </PageHead>
      <div className="stats">
        <Stat label="Services" value={money(sum((p) => p.kind === 'checkout' || p.kind === 'deposit'))} note={`${paid.filter((p) => p.kind === 'checkout').length} checkouts`} />
        <Stat label="Tips" value={money(sum(() => true, 'tip'))} note="owed to staff" />
        <Stat label="Memberships & packages" value={money(sum((p) => p.kind === 'membership' || p.kind === 'package'))} />
        <Stat label="Fees" value={money(sum((p) => p.kind.endsWith('fee')))} note="late cancels and no-shows" />
      </div>
      <div className="two two--wide">
        <section className="card-panel">
          <h2>Transactions</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Client</th>
                  <th>For</th>
                  <th>Amount</th>
                  <th>Tip</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {(list ?? []).slice(0, 200).map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{p.clientName}</td>
                    <td>{KIND[p.kind] ?? p.kind}</td>
                    <td>{p.status === 'paid' ? money(p.amount) : <Pill tone="red">Failed</Pill>}</td>
                    <td>{p.tip ? money(p.tip) : '—'}</td>
                    <td>
                      {p.method}
                      {p.simulated && p.method === 'card' ? ' (sim)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card-panel">
          <h2>Tips by person</h2>
          <ul className="mini-list">
            {tipsBy.map(({ s, tips }) => (
              <li key={s.id}>
                <span>
                  <i className="dot" style={{ background: s.color }} />
                </span>
                <strong>{s.short}</strong>
                <small>{money(tips)}</small>
              </li>
            ))}
            {list && !tipsBy.length ? <li className="muted small">No tips in this period.</li> : null}
          </ul>
          <p className="muted small mt">Payouts to the bank and card fees are in the Stripe dashboard once it’s connected.</p>
        </section>
      </div>
    </div>
  );
}
