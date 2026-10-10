import { useState } from 'react';
import { api } from '../api';
import { CATEGORY_COLORS, CATEGORY_ORDER, duration, money, nice, useBoot } from '../ctx';
import type { Membership, Service } from '../types';
import { Drawer, Icon, PageHead, Pill } from '../ui';

// Things the GlossGenius port flagged for the owner to confirm.
const REVIEW: Record<string, string> = {
  'Luxury Wig Installation': 'Set to 10 minutes in GlossGenius. How long should an install be booked for?',
  'Bio Scan': '31 scans a month (daily). Is that right?',
};

export function CatalogView() {
  const boot = useBoot();
  const [tab, setTab] = useState<'services' | 'memberships' | 'packages'>('services');
  const [edit, setEdit] = useState<Service | 'new' | null>(null);
  const [editM, setEditM] = useState<Membership | null>(null);
  const svcName = (id: string) => nice(boot.services.find((s) => s.id === id)?.name ?? 'Service');
  const cats = [...new Set([...CATEGORY_ORDER, ...boot.services.map((s) => s.category)])].filter((c) => boot.services.some((s) => s.category === c));

  return (
    <div className="page">
      <PageHead title="Services & offers" sub="Changes here update online booking and the website menu.">
        {tab === 'services' ? (
          <button className="btn btn--dark" onClick={() => setEdit('new')}>
            <Icon name="plus" /> Add service
          </button>
        ) : null}
      </PageHead>
      <div className="staff-tabs">
        {(['services', 'memberships', 'packages'] as const).map((t) => (
          <button key={t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'services'
        ? cats.map((cat) => (
            <section className="card-panel cat" key={cat}>
              <h2>
                <i className="swatch" style={{ background: CATEGORY_COLORS[cat] }} /> {cat}
              </h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Time</th>
                      <th>Price</th>
                      <th>Deposit</th>
                      <th>Who</th>
                      <th>Online</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {boot.services
                      .filter((s) => s.category === cat)
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
                        <tr key={s.id} className={s.active ? '' : 'is-off'}>
                          <td>
                            <strong>{nice(s.name)}</strong>
                            {REVIEW[s.name] ? <span className="flag">Needs review: {REVIEW[s.name]}</span> : null}
                          </td>
                          <td>{duration(s.duration)}</td>
                          <td>
                            {money(s.price)}
                            {s.priceVaries ? '+' : ''}
                          </td>
                          <td>{s.deposit ? `${money(s.deposit)}${s.depositNewClientsOnly ? ' new' : ''}` : '—'}</td>
                          <td>
                            <span className="dots">
                              {boot.staff
                                .filter((st) => s.staffIds.includes(st.id))
                                .map((st) => (
                                  <i key={st.id} style={{ background: st.color }} title={st.short} />
                                ))}
                            </span>
                          </td>
                          <td>{!s.active ? <Pill>Hidden</Pill> : s.bookableOnline ? <Pill tone="green">Yes</Pill> : <Pill tone="red">No</Pill>}</td>
                          <td>
                            <button className="chip" onClick={() => setEdit(s)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        : null}

      {tab === 'memberships' ? (
        <div className="grid-cards">
          {boot.memberships.map((m) => (
            <article className="card-panel offer" key={m.id}>
              <Pill tone="honey">Membership</Pill>
              <h2>{m.name}</h2>
              <p className="muted">{m.description}</p>
              <p className="offer__price">
                {money(m.price)}
                <small>/month</small>
              </p>
              <h3>Each month includes</h3>
              <ul className="mini-list">
                {m.includes.map((i) => (
                  <li key={i.serviceId}>
                    <span>{i.quantity}×</span>
                    <strong>{svcName(i.serviceId)}</strong>
                  </li>
                ))}
              </ul>
              {REVIEW[m.name] ? <span className="flag">Needs review: {REVIEW[m.name]}</span> : null}
              <button className="chip" onClick={() => setEditM(m)}>
                Edit
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'packages' ? (
        <div className="grid-cards">
          {boot.packages.map((p) => {
            const regular = p.items.reduce((n, i) => n + (boot.services.find((s) => s.id === i.serviceId)?.price ?? 0) * i.quantity, 0);
            return (
              <article className="card-panel offer" key={p.id}>
                <Pill tone="violet">Package</Pill>
                <h2>{p.name}</h2>
                <p className="offer__price">
                  {money(p.price)} {regular > p.price ? <s>{money(regular)}</s> : null}
                </p>
                <ul className="mini-list">
                  {p.items.map((i) => (
                    <li key={i.serviceId}>
                      <span>{i.quantity}×</span>
                      <strong>{svcName(i.serviceId)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="muted small">{p.expiresMonths ? `Use within ${p.expiresMonths} months of buying.` : 'Doesn’t expire.'}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {edit ? <ServiceEditor service={edit === 'new' ? null : edit} cats={cats} onClose={() => setEdit(null)} /> : null}
      {editM ? <MembershipEditor m={editM} onClose={() => setEditM(null)} /> : null}
    </div>
  );
}

function ServiceEditor({ service, cats, onClose }: { service: Service | null; cats: string[]; onClose: () => void }) {
  const boot = useBoot();
  const [error, setError] = useState('');
  const [staffIds, setStaffIds] = useState<string[]>(service?.staffIds ?? [boot.me.id]);
  return (
    <Drawer title={service ? `Edit ${nice(service.name)}` : 'New service'} onClose={onClose}>
      <form
        className="drawer-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = {
            name: String(f.get('name')),
            category: String(f.get('category')),
            price: Math.round(Number(f.get('price')) * 100),
            priceVaries: f.get('priceVaries') === 'on',
            duration: Number(f.get('duration')),
            deposit: Number(f.get('deposit')) ? Math.round(Number(f.get('deposit')) * 100) : null,
            depositNewClientsOnly: f.get('depositWho') === 'new',
            description: String(f.get('description')) || null,
            prepTip: String(f.get('prepTip')) || undefined,
            staffIds,
            active: f.get('active') === 'on',
          };
          try {
            if (service) await api(`/services/${service.id}`, body, 'PUT');
            else await api('/services', body);
            await boot.reload();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="field">
          Name
          <input name="name" defaultValue={service ? nice(service.name) : ''} required />
        </label>
        <label className="field">
          Category
          <select name="category" defaultValue={service?.category ?? cats[0]}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="two">
          <label className="field">
            Price ($)
            <input name="price" type="number" step="1" min="0" defaultValue={service ? service.price / 100 : ''} required />
          </label>
          <label className="field">
            Minutes
            <input name="duration" type="number" step="5" min="5" defaultValue={service?.duration ?? 30} required />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="priceVaries" defaultChecked={service?.priceVaries} /> Price can vary (shows “from”)
        </label>
        <div className="two">
          <label className="field">
            Deposit ($)
            <input name="deposit" type="number" min="0" defaultValue={service?.deposit ? service.deposit / 100 : ''} />
          </label>
          <label className="field">
            Deposit applies to
            <select name="depositWho" defaultValue={service?.depositNewClientsOnly ? 'new' : 'all'}>
              <option value="new">New clients</option>
              <option value="all">Everyone</option>
            </select>
          </label>
        </div>
        <label className="field">
          Description
          <textarea name="description" rows={5} defaultValue={service?.description ?? ''} />
        </label>
        <label className="field">
          Reminder tip (texted the day before)
          <input name="prepTip" defaultValue={service?.prepTip ?? ''} />
        </label>
        <fieldset className="field">
          <legend>Who performs it</legend>
          {boot.staff
            .filter((s) => s.active)
            .map((s) => (
              <label key={s.id} className="check">
                <input type="checkbox" checked={staffIds.includes(s.id)} onChange={(e) => setStaffIds(e.target.checked ? [...staffIds, s.id] : staffIds.filter((x) => x !== s.id))} /> {s.short}
                {s.bookable ? '' : ' (not bookable online)'}
              </label>
            ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Offered (uncheck to hide it everywhere)
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn--honey">Save</button>
      </form>
    </Drawer>
  );
}

function MembershipEditor({ m, onClose }: { m: Membership; onClose: () => void }) {
  const boot = useBoot();
  const [includes, setIncludes] = useState(m.includes);
  const [error, setError] = useState('');
  return (
    <Drawer title={`Edit ${m.name}`} onClose={onClose}>
      <form
        className="drawer-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(`/memberships/${m.id}`, { name: f.get('name'), description: f.get('description'), price: Math.round(Number(f.get('price')) * 100), includes, active: f.get('active') === 'on', public: f.get('public') === 'on' }, 'PUT');
            await boot.reload();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="field">
          Name
          <input name="name" defaultValue={m.name} />
        </label>
        <label className="field">
          Description
          <textarea name="description" rows={3} defaultValue={m.description ?? ''} />
        </label>
        <label className="field">
          Monthly price ($)
          <input name="price" type="number" defaultValue={m.price / 100} />
        </label>
        <fieldset className="field">
          <legend>Each month includes</legend>
          {includes.map((i, k) => (
            <div className="row-actions" key={k}>
              <input className="qty" type="number" min="1" value={i.quantity} onChange={(e) => setIncludes(includes.map((x, j) => (j === k ? { ...x, quantity: +e.target.value } : x)))} aria-label="Visits" />
              <select value={i.serviceId} onChange={(e) => setIncludes(includes.map((x, j) => (j === k ? { ...x, serviceId: e.target.value } : x)))}>
                {boot.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {nice(s.name)}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-btn" onClick={() => setIncludes(includes.filter((_, j) => j !== k))} aria-label="Remove">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="linkish" onClick={() => setIncludes([...includes, { serviceId: boot.services[0].id, quantity: 1 }])}>
            + Add a service
          </button>
        </fieldset>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={m.active} /> Available to join
        </label>
        <label className="check">
          <input type="checkbox" name="public" defaultChecked={m.public} /> Shown on the website
        </label>
        <p className="muted small">A new price applies to new members. Existing members keep their current price until you move them.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn--honey">Save</button>
      </form>
    </Drawer>
  );
}
