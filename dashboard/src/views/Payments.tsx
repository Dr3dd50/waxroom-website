import { CLIENTS, TODAY, addDays, appointmentsOn, catalog, clientById, money, nice, serviceById, staffById } from '../data';
import { PageHead, Pill, Stat } from '../ui';

export function PaymentsView() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, -i));
  const paid = days.flatMap((d) => appointmentsOn(d)).filter((a) => a.status === 'completed' && a.start < new Date());
  const gross = paid.reduce((n, a) => n + (a.usesMembership ? 0 : serviceById(a.serviceId).price ?? 0), 0);
  const tips = paid.reduce((n, a) => n + (a.tip ?? 0), 0);
  const fees = days.flatMap((d) => appointmentsOn(d)).filter((a) => a.status === 'no-show').reduce((n, a) => n + (serviceById(a.serviceId).price ?? 0), 0);
  const members = CLIENTS.filter((c) => c.membership);
  const mrr = members.reduce((n, c) => n + (catalog.memberships.find((m) => m.name === c.membership)?.price ?? 0), 0);
  const y = addDays(TODAY, -1);
  const yesterday = Math.round(
    paid.filter((a) => a.start.toDateString() === y.toDateString()).reduce((n, a) => n + (a.usesMembership ? 0 : serviceById(a.serviceId).price ?? 0) + (a.tip ?? 0), 0) * 0.971,
  );
  const byStaff = new Map<string, number>();
  for (const a of paid) byStaff.set(a.staffId, (byStaff.get(a.staffId) ?? 0) + (a.tip ?? 0));

  return (
    <div className="page">
      <PageHead title="Payments" sub="Last 7 days · through Stripe">
        <Pill tone="green">Stripe connected · payouts daily</Pill>
      </PageHead>
      <div className="stats">
        <Stat label="Services" value={money(gross)} note={`${paid.length} checkouts`} />
        <Stat label="Tips" value={money(tips)} note="paid out to staff" />
        <Stat label="Memberships" value={`${money(mrr)}/mo`} note={`${members.length} active members`} />
        <Stat label="No-show fees" value={money(fees)} note="charged to card on file" />
      </div>
      <div className="two two--wide">
        <section className="card-panel">
          <h2>Recent checkouts</h2>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Client</th>
                <th>Service</th>
                <th>Paid</th>
                <th>Tip</th>
              </tr>
            </thead>
            <tbody>
              {[...paid]
                .sort((x, y) => +y.start - +x.start)
                .slice(0, 14)
                .map((a) => (
                  <tr key={a.id}>
                    <td>{a.start.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{clientById(a.clientId).name}</td>
                    <td>{nice(serviceById(a.serviceId).name)}</td>
                    <td>{a.usesMembership ? <Pill tone="green">Membership</Pill> : money(serviceById(a.serviceId).price)}</td>
                    <td>{money(a.tip)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
        <section className="card-panel">
          <h2>Tips by person</h2>
          <ul className="mini-list">
            {[...byStaff].map(([id, t]) => (
              <li key={id}>
                <span>
                  <i className="dot" style={{ background: staffById(id).color }} />
                </span>
                <strong>{staffById(id).short}</strong>
                <small>{money(t)}</small>
              </li>
            ))}
          </ul>
          <h2 className="mt">Next payout</h2>
          <p className="big">{money(yesterday)}</p>
          <p className="muted small">Yesterday’s card payments and tips, less Stripe fees. Arrives in the business bank account tomorrow.</p>
        </section>
      </div>
    </div>
  );
}
