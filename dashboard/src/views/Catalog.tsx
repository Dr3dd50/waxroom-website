import { useState } from 'react';
import { CATEGORY_COLORS, SERVICES, STAFF, catalog, categoryOf, duration, money, nice, type Service } from '../data';
import { Drawer, Icon, PageHead, Pill } from '../ui';

// Things the GlossGenius port flagged for the owner to confirm.
const REVIEW: Record<string, string> = {
  'Luxury Wig Installation': 'Only Chicago is assigned, and Chicago isn’t bookable online. Who takes these?',
  'Luxury Wig Install Consultation': 'Only Chicago is assigned, and Chicago isn’t bookable online. Who takes these?',
  'Luxe Lash Pass': 'Includes one of each fill (1–4 week) every month. Meant to be one fill of any kind?',
  'The Steam Society': 'Lists the steam’s regular price as $50; the menu says $30.',
  'Bio Scan': '31 scans a month (daily). Is that right?',
};

const CATEGORY_ORDER = ['Intimate Waxing', 'Body and Facial Waxing', 'Brow Art', 'Lash Art', 'Skin Therapy', 'Yoni Steam', 'Hair Restoration', 'Bio scans'];
const renews = (iso: string) => (iso === 'P1M' ? 'month' : iso === 'P1Y' ? 'year' : iso);

export function CatalogView() {
  const [tab, setTab] = useState<'services' | 'memberships' | 'packages'>('services');
  const [edit, setEdit] = useState<Service | null>(null);
  const byCat = CATEGORY_ORDER.map((cat) => ({ cat, items: SERVICES.filter((s) => categoryOf(s) === cat) })).filter((g) => g.items.length);

  return (
    <div className="page">
      <PageHead title="Services & offers" sub={`${SERVICES.length} services · ${catalog.memberships.length} memberships · ${catalog.packages.length} packages · ported from GlossGenius`}>
        <button className="btn btn--dark">
          <Icon name="plus" /> Add {tab === 'services' ? 'service' : tab === 'memberships' ? 'membership' : 'package'}
        </button>
      </PageHead>
      <div className="staff-tabs">
        {(['services', 'memberships', 'packages'] as const).map((t) => (
          <button key={t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'services'
        ? byCat.map((g) => (
            <section className="card-panel cat" key={g.cat}>
              <h2>
                <i className="swatch" style={{ background: CATEGORY_COLORS[g.cat] }} /> {g.cat}
              </h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Time</th>
                    <th>Price</th>
                    <th>Deposit</th>
                    <th>Who</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{nice(s.name)}</strong>
                        {REVIEW[s.name] ? (
                          <span className="flag" title={REVIEW[s.name]}>
                            Needs review: {REVIEW[s.name]}
                          </span>
                        ) : null}
                      </td>
                      <td>{duration(s.duration)}</td>
                      <td>
                        {money(s.price)}
                        {s.priceVaries ? '+' : ''}
                      </td>
                      <td>{s.deposit ? `${money(s.deposit)}${s.depositNewClientsOnly ? ' new' : ''}` : '—'}</td>
                      <td>
                        <span className="dots">
                          {STAFF.filter((st) => s.staff.includes(st.id)).map((st) => (
                            <i key={st.id} style={{ background: st.color }} title={st.short} />
                          ))}
                        </span>
                      </td>
                      <td>
                        <button className="chip" onClick={() => setEdit(s)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        : null}

      {tab === 'memberships' ? (
        <div className="grid-cards">
          {catalog.memberships.map((m) => (
            <article className="card-panel offer" key={m.id}>
              <Pill tone="honey">Membership</Pill>
              <h2>{m.name}</h2>
              <p className="muted">{m.description}</p>
              <p className="offer__price">
                {money(m.price)}
                <small>/{renews(m.renews)}</small>
              </p>
              <h3>Each {renews(m.renews)} includes</h3>
              <ul className="mini-list">
                {m.includes.map((i, k) =>
                  'service' in i ? (
                    <li key={k}>
                      <span>{i.quantity}×</span>
                      <strong>{nice(i.service)}</strong>
                      <small>reg. {money(i.regularPrice)}</small>
                    </li>
                  ) : null,
                )}
              </ul>
              {REVIEW[m.name] ? <span className="flag">Needs review: {REVIEW[m.name]}</span> : null}
              <p className="muted small">Billed through Stripe subscriptions. Unused visits don’t roll over.</p>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'packages' ? (
        <div className="grid-cards">
          {catalog.packages.map((p) => {
            const regular = p.items.reduce((n, i) => n + (SERVICES.find((s) => s.id === i.serviceId)?.price ?? 0) * i.quantity, 0);
            return (
              <article className="card-panel offer" key={p.id}>
                <Pill tone="violet">Package</Pill>
                <h2>{p.name}</h2>
                <p className="offer__price">
                  {money(p.price)} {regular > (p.price ?? 0) ? <s>{money(regular)}</s> : null}
                </p>
                <ul className="mini-list">
                  {p.items.map((i) => (
                    <li key={i.serviceId}>
                      <span>{i.quantity}×</span>
                      <strong>{nice(i.service)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="muted small">Expires {p.expires === 'P1Y' ? '1 year' : p.expires} after purchase.</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {edit ? (
        <Drawer
          title={`Edit ${nice(edit.name)}`}
          onClose={() => setEdit(null)}
          footer={
            <button className="btn btn--honey" onClick={() => setEdit(null)}>
              Save (updates the website and booking)
            </button>
          }
        >
          <label className="field">
            Name
            <input defaultValue={nice(edit.name)} />
          </label>
          <div className="two">
            <label className="field">
              Price
              <input defaultValue={(edit.price ?? 0) / 100} type="number" />
            </label>
            <label className="field">
              Minutes
              <input defaultValue={edit.duration} type="number" step={5} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              Deposit
              <input defaultValue={(edit.deposit ?? 0) / 100} type="number" />
            </label>
            <label className="field">
              Deposit applies to
              <select defaultValue={edit.depositNewClientsOnly ? 'new' : 'all'}>
                <option value="new">New clients</option>
                <option value="all">Everyone</option>
              </select>
            </label>
          </div>
          <label className="field">
            Description
            <textarea defaultValue={edit.description ?? ''} rows={6} />
          </label>
          <fieldset className="field">
            <legend>Who performs it</legend>
            {STAFF.map((s) => (
              <label key={s.id} className="check">
                <input type="checkbox" defaultChecked={edit.staff.includes(s.id)} /> {s.short}
              </label>
            ))}
          </fieldset>
        </Drawer>
      ) : null}
    </div>
  );
}
