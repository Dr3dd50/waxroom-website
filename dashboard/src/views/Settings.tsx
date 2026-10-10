import { useState } from 'react';
import { api } from '../api';
import { DAY_KEYS, useBoot } from '../ctx';
import type { Staff } from '../types';
import { Drawer, PageHead, Pill, Toggle } from '../ui';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const hr = (h: number) => `${h === 12 ? 12 : h % 12}${h >= 12 ? 'pm' : 'am'}`;

export function SettingsView() {
  const boot = useBoot();
  const s = boot.settings;
  const [hours, setHours] = useState(s.hours);
  const [policies, setPolicies] = useState(s.policies);
  const [saved, setSaved] = useState('');
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const save = async (body: object) => {
    await api('/settings', body, 'PUT');
    await boot.reload();
    setSaved('Saved.');
  };

  return (
    <div className="page">
      <PageHead title="Settings" sub="Carried over from GlossGenius. Changes apply to online booking right away." />
      <div className="two two--wide">
        <section className="card-panel">
          <h2>Business hours</h2>
          <table className="table table--compact">
            <tbody>
              {ORDER.map((d) => {
                const key = DAY_KEYS[d];
                const h = hours[key];
                return (
                  <tr key={key}>
                    <td>{key[0].toUpperCase() + key.slice(1)}</td>
                    <td>
                      <Toggle on={h.working} onChange={(v) => setHours({ ...hours, [key]: { ...h, working: v } })} label={`Open ${key}`} />
                    </td>
                    <td>
                      {h.working ? (
                        <span className="hours">
                          <select value={h.start} onChange={(e) => setHours({ ...hours, [key]: { ...h, start: +e.target.value } })} aria-label={`${key} opens`}>
                            {Array.from({ length: 14 }, (_, i) => i + 6).map((x) => (
                              <option key={x} value={x}>
                                {hr(x)}
                              </option>
                            ))}
                          </select>
                          –
                          <select value={h.end} onChange={(e) => setHours({ ...hours, [key]: { ...h, end: +e.target.value } })} aria-label={`${key} closes`}>
                            {Array.from({ length: 14 }, (_, i) => i + 9).map((x) => (
                              <option key={x} value={x}>
                                {hr(x)}
                              </option>
                            ))}
                          </select>
                        </span>
                      ) : (
                        'Closed'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn btn--dark mt" disabled={JSON.stringify(hours) === JSON.stringify(s.hours)} onClick={() => save({ hours })}>
            Save hours
          </button>

          <h2 className="mt">Team</h2>
          <ul className="mini-list">
            {boot.staff.map((m) => (
              <li key={m.id}>
                <span>
                  <i className="dot" style={{ background: m.color }} />
                </span>
                <strong>
                  {m.name} {m.active ? '' : '(inactive)'}
                </strong>
                <button className="chip" onClick={() => setEditing(m)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
          <button className="chip mt" onClick={() => setEditing('new')}>
            Add a team member
          </button>
        </section>

        <section className="card-panel">
          <h2>Booking rules</h2>
          <dl className="kv kv--settings">
            <dt>Card required to book</dt>
            <dd>
              <Toggle on={policies.cardRequired} onChange={(v) => setPolicies({ ...policies, cardRequired: v })} label="Card required" />
            </dd>
            <dt>Late-cancel window (hours)</dt>
            <dd>
              <input className="qty" type="number" value={policies.cancellationWindowHours} onChange={(e) => setPolicies({ ...policies, cancellationWindowHours: +e.target.value })} />
            </dd>
            <dt>Late-cancel fee (%)</dt>
            <dd>
              <input className="qty" type="number" value={policies.cancellationFeePercent} onChange={(e) => setPolicies({ ...policies, cancellationFeePercent: +e.target.value })} />
            </dd>
            <dt>No-show fee (%)</dt>
            <dd>
              <input className="qty" type="number" value={policies.noShowFeePercent} onChange={(e) => setPolicies({ ...policies, noShowFeePercent: +e.target.value })} />
            </dd>
            <dt>Clients can cancel online</dt>
            <dd>
              <Toggle on={policies.allowOnlineCancellations} onChange={(v) => setPolicies({ ...policies, allowOnlineCancellations: v })} label="Online cancellations" />
            </dd>
            <dt>Upcoming bookings per client</dt>
            <dd>
              <input className="qty" type="number" value={policies.futureBookingsLimit ?? ''} onChange={(e) => setPolicies({ ...policies, futureBookingsLimit: e.target.value ? +e.target.value : null })} />
            </dd>
            <dt>Earliest online booking (minutes from now)</dt>
            <dd>
              <input className="qty" type="number" step={15} value={policies.leadTimeMinutes} onChange={(e) => setPolicies({ ...policies, leadTimeMinutes: +e.target.value })} />
            </dd>
            <dt>Book up to (days ahead)</dt>
            <dd>
              <input className="qty" type="number" value={policies.bookAheadDays} onChange={(e) => setPolicies({ ...policies, bookAheadDays: +e.target.value })} />
            </dd>
            <dt>Default tip (%)</dt>
            <dd>
              <input className="qty" type="number" value={policies.defaultTipPercent} onChange={(e) => setPolicies({ ...policies, defaultTipPercent: +e.target.value })} />
            </dd>
          </dl>
          <div className="row-actions mt">
            <button className="btn btn--dark" disabled={JSON.stringify(policies) === JSON.stringify(s.policies)} onClick={() => save({ policies })}>
              Save rules
            </button>
            {saved ? <span className="muted small">{saved}</span> : null}
          </div>
          <h2 className="mt">Connections</h2>
          <dl className="kv kv--settings">
            <dt>Stripe (payments)</dt>
            <dd>{boot.live.payments ? <Pill tone="green">Connected</Pill> : <Pill tone="red">Add keys</Pill>}</dd>
            <dt>Twilio (texts)</dt>
            <dd>{boot.live.texts ? <Pill tone="green">Connected</Pill> : <Pill tone="red">Waiting on registration</Pill>}</dd>
          </dl>
        </section>
      </div>
      <section className="card-panel">
        <h2>Cancellation & no-show policy</h2>
        <p className="policy">{s.policies.cancellationPolicy}</p>
      </section>
      {editing ? <TeamEditor m={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function TeamEditor({ m, onClose }: { m: Staff | null; onClose: () => void }) {
  const boot = useBoot();
  const [error, setError] = useState('');
  return (
    <Drawer title={m ? m.name : 'Add a team member'} onClose={onClose}>
      <form
        className="drawer-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = {
            name: f.get('name'),
            short: f.get('short'),
            email: f.get('email'),
            phone: f.get('phone') || undefined,
            color: f.get('color'),
            role: f.get('role'),
            bookable: f.get('bookable') === 'on',
            active: f.get('active') === 'on',
            password: f.get('password') || undefined,
          };
          try {
            if (m) await api(`/team/${m.id}`, body, 'PATCH');
            else await api('/team', body);
            await boot.reload();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="two">
          <label className="field">
            Full name
            <input name="name" defaultValue={m?.name} required />
          </label>
          <label className="field">
            Calendar name
            <input name="short" defaultValue={m?.short} />
          </label>
        </div>
        <label className="field">
          Email (for signing in)
          <input name="email" type="email" defaultValue={m?.email} required />
        </label>
        <label className="field">
          Mobile
          <input name="phone" defaultValue={m?.phone} />
        </label>
        <div className="two">
          <label className="field">
            Role
            <select name="role" defaultValue={m?.role ?? 'employee'}>
              <option value="employee">Esthetician (own calendar and clients)</option>
              <option value="owner">Owner (everything)</option>
            </select>
          </label>
          <label className="field">
            Calendar color
            <input name="color" type="color" defaultValue={m?.color ?? '#9c8a76'} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="bookable" defaultChecked={m?.bookable ?? true} /> Clients can book them online
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={m?.active ?? true} /> Active
        </label>
        <label className="field">
          {m ? 'New password (leave blank to keep)' : 'Temporary password (8+ characters)'}
          <input name="password" type="password" minLength={8} required={!m} autoComplete="new-password" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn--honey">Save</button>
      </form>
    </Drawer>
  );
}
