import { useMemo, useState } from 'react';
import type { Me } from '../App';
import { CLIENTS, REFERRALS, TODAY, addDays, appointmentsOn, clientById, money, nice, serviceById, staffById, type Client } from '../data';
import { Icon, PageHead, Pill } from '../ui';

/** Each client's visits over the last 8 weeks and next 2, from the mock calendar. */
function visitsFor(clientId: string) {
  const out = [];
  for (let i = -56; i <= 14; i++) out.push(...appointmentsOn(addDays(TODAY, i)).filter((a) => a.clientId === clientId));
  return out;
}

export function ClientsView({ me }: { me: Me }) {
  const owner = me.role === 'owner';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'members' | 'marketing' | 'credit'>('all');
  // Employees see the clients they've seen or are booked with.
  const mine = useMemo(() => {
    if (owner) return CLIENTS;
    const ids = new Set<string>();
    for (let i = -56; i <= 14; i++) appointmentsOn(addDays(TODAY, i)).forEach((a) => a.staffId === me.id && ids.add(a.clientId));
    return CLIENTS.filter((c) => ids.has(c.id));
  }, [owner, me.id]);
  const list = mine
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
    .filter((c) => filter === 'all' || (filter === 'members' && c.membership) || (filter === 'marketing' && c.smsMarketing) || (filter === 'credit' && c.credit))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [sel, setSel] = useState<Client | null>(null);
  const current = sel ?? list[0] ?? null;

  return (
    <div className="page">
      <PageHead title="Clients" sub={`${mine.length} ${owner ? 'clients' : 'of your clients'}`}>
        <div className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" />
        </div>
      </PageHead>
      <div className="staff-tabs">
        {(
          [
            ['all', 'All'],
            ['members', 'Members'],
            ['marketing', 'Texts opted in'],
            ['credit', 'Has credit'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="split">
        <ul className="list">
          {list.map((c) => (
            <li key={c.id}>
              <button className={current?.id === c.id ? 'is-on' : ''} onClick={() => setSel(c)}>
                <span className="avatar avatar--sm avatar--soft">{c.name[0]}</span>
                <span className="list__main">
                  <strong>{c.name}</strong>
                  <small>{c.phone}</small>
                </span>
                {c.membership ? <Pill tone="green">Member</Pill> : null}
              </button>
            </li>
          ))}
        </ul>
        {current ? <ClientCard c={current} owner={owner} /> : <p className="empty">No clients match.</p>}
      </div>
    </div>
  );
}

function ClientCard({ c, owner }: { c: Client; owner: boolean }) {
  const visits = visitsFor(c.id);
  const upcoming = visits.filter((a) => a.start > new Date());
  const pastVisits = visits.filter((a) => a.start <= new Date()).reverse();
  const referred = REFERRALS.filter((r) => r.referrerId === c.id);
  const by = c.referredBy ? clientById(c.referredBy) : null;
  return (
    <article className="card-panel">
      <header className="client-head">
        <span className="avatar avatar--lg avatar--soft">{c.name[0]}</span>
        <div>
          <h2>{c.name}</h2>
          <p className="muted">
            {c.phone} · {c.email}
          </p>
        </div>
      </header>
      <div className="stats stats--3">
        <div className="stat">
          <span className="stat__label">Visits</span>
          <strong className="stat__value">{c.visits}</strong>
        </div>
        {owner ? (
          <div className="stat">
            <span className="stat__label">Lifetime spend</span>
            <strong className="stat__value">{money(c.spent)}</strong>
          </div>
        ) : null}
        <div className="stat">
          <span className="stat__label">Client since</span>
          <strong className="stat__value">{new Date(c.since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</strong>
        </div>
      </div>

      {c.notes ? <p className="note">{c.notes}</p> : null}

      <section className="box">
        <h3>Upcoming</h3>
        {upcoming.length ? (
          <ul className="mini-list">
            {upcoming.map((a) => (
              <li key={a.id}>
                <span>{a.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <strong>{nice(serviceById(a.serviceId).name)}</strong>
                <small>with {staffById(a.staffId).short}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing booked. {c.smsReminders ? 'They’ll get a rebooking nudge 6 weeks after their last visit.' : ''}</p>
        )}
      </section>

      <section className="box">
        <h3>Recent visits</h3>
        <ul className="mini-list">
          {pastVisits.slice(0, 5).map((a) => (
            <li key={a.id}>
              <span>{a.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <strong>{nice(serviceById(a.serviceId).name)}</strong>
              <small>{a.status === 'no-show' ? 'No-show' : a.status === 'cancelled' ? 'Cancelled' : `with ${staffById(a.staffId).short}`}</small>
            </li>
          ))}
          {!pastVisits.length ? <li className="muted small">No visits in the last 8 weeks.</li> : null}
        </ul>
      </section>

      <div className="two">
        <section className="box">
          <h3>Membership & credit</h3>
          <dl className="kv">
            <dt>Membership</dt>
            <dd>{c.membership ?? 'None'}</dd>
            <dt>Referral credit</dt>
            <dd>{money(c.credit)}</dd>
            <dt>Card on file</dt>
            <dd>{c.cardOnFile ?? 'None'}</dd>
          </dl>
        </section>
        <section className="box">
          <h3>Referrals</h3>
          <p className="small">
            Link: <code>waxroomrichmond.com/r/{c.referralCode}</code>
          </p>
          {by ? <p className="small">Referred by {by.name}</p> : null}
          <p className="small">{referred.length ? `${referred.length} friends referred, ${referred.filter((r) => r.status === 'completed').length} visited` : 'No referrals yet.'}</p>
        </section>
      </div>

      <section className="box">
        <h3>Texts</h3>
        <dl className="kv">
          <dt>Appointment texts</dt>
          <dd>{c.smsReminders ? <Pill tone="green">On</Pill> : <Pill>Off</Pill>}</dd>
          <dt>Offers & news</dt>
          <dd>{c.smsMarketing ? <Pill tone="green">Opted in</Pill> : <Pill>Not opted in</Pill>}</dd>
        </dl>
      </section>
    </article>
  );
}
