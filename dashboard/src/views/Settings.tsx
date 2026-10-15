import { useState } from 'react';
import { api } from '../api';
import { CATEGORY_ORDER, DAY_KEYS, nice, useBoot } from '../ctx';
import type { Service, Staff } from '../types';
import { Drawer, PageHead, Pill, Toggle } from '../ui';
import { OnlineBooking } from './OnlineBooking';

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
      <OnlineBooking />
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
            <dt>Deposit refunded when cancelled at least (hours ahead)</dt>
            <dd>
              <input
                className="qty"
                type="number"
                min={0}
                value={policies.depositRefundHours ?? policies.cancellationWindowHours}
                onChange={(e) => setPolicies({ ...policies, depositRefundHours: +e.target.value })}
              />
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
          <h2 className="mt">Team texts and privacy</h2>
          <dl className="kv kv--settings">
            <dt>Text the team about bookings, moves and cancellations</dt>
            <dd>
              <Toggle on={s.staffAlerts.enabled} onChange={(v) => save({ staffAlerts: { enabled: v } })} label="Team texts" />
            </dd>
            <dt>Employees can see client phone numbers and emails</dt>
            <dd>
              <Toggle on={s.privacy.employeesSeeContact} onChange={(v) => save({ privacy: { employeesSeeContact: v } })} label="Employees see client contact details" />
            </dd>
          </dl>
          <p className="muted small mt">
            Each person gets texts about their own appointments, and you get a copy of every one. Turn it off for one person under Team. The texts never include client
            numbers. With contact details hidden, employees still see names, visits and notes, and can still text a client from the dashboard.
          </p>
          <h2 className="mt">Connections</h2>
          <dl className="kv kv--settings">
            <dt>Stripe (payments)</dt>
            <dd>{boot.live.payments ? <Pill tone="green">Connected</Pill> : <Pill tone="red">Add keys</Pill>}</dd>
            <dt>Twilio (texts)</dt>
            <dd>{boot.live.texts ? <Pill tone="green">Connected</Pill> : <Pill tone="red">Waiting on registration</Pill>}</dd>
            <dt>Gmail (appointment emails)</dt>
            <dd>{boot.live.email ? <Pill tone="green">Connected</Pill> : <Pill tone="red">Add the app password</Pill>}</dd>
          </dl>
        </section>
      </div>
      <ClientTexts />
      <RebookTexts />
      <Ratings />
      <section className="card-panel">
        <h2>Cancellation & no-show policy</h2>
        <p className="policy">{s.policies.cancellationPolicy}</p>
      </section>
      {editing ? <TeamEditor m={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

const REMINDER_HOURS = [2, 4, 6, 12, 24, 36, 48, 72];
const CONFIRM_HOURS = [24, 36, 48, 72, 96, 120, 168];
const ahead = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'} before` : `${h} hours before`);

/** When clients get their appointment texts. The wording of each is under Texts. */
function ClientTexts() {
  const boot = useBoot();
  const s = boot.settings;
  const [n, setN] = useState(s.notifications);
  const [msg, setMsg] = useState('');
  const auto = (key: string) => !!s.automations[key]?.enabled;
  const toggle = async (key: string, on: boolean) => {
    await api('/settings', { automations: { [key]: { ...s.automations[key], enabled: on } } }, 'PUT');
    await boot.reload();
  };
  const changed = JSON.stringify(n) !== JSON.stringify(s.notifications);
  return (
    <section className="card-panel" id="client-texts">
      <h2>Client texts and emails</h2>
      <p className="muted small">
        When clients get their appointment texts. Change the wording of each under Texts. With emails on, the booking, moved, confirm, reminder, cancelled and receipt
        messages are also emailed from waxroomrichmond@gmail.com in the same words, and online booking asks for an email.
      </p>
      <dl className="kv kv--settings">
        <dt>Email them too</dt>
        <dd>
          <Toggle
            on={!!s.emails?.enabled}
            onChange={async (v) => {
              await api('/settings', { emails: { enabled: v } }, 'PUT');
              await boot.reload();
            }}
            label="Appointment emails on"
          />
        </dd>
        <dt>Appointment reminder</dt>
        <dd className="hours">
          <Toggle on={auto('reminder')} onChange={(v) => toggle('reminder', v)} label="Appointment reminder on" />
          <select value={n.reminderHoursBefore} disabled={!auto('reminder')} onChange={(e) => (setN({ ...n, reminderHoursBefore: +e.target.value }), setMsg(''))} aria-label="Reminder timing">
            {REMINDER_HOURS.map((h) => (
              <option key={h} value={h}>
                {ahead(h)}
              </option>
            ))}
          </select>
        </dd>
        <dt>Ask the client to confirm (reply C, or the link in the email)</dt>
        <dd className="hours">
          <Toggle on={auto('confirm-request')} onChange={(v) => toggle('confirm-request', v)} label="Confirmation request on" />
          <select value={n.confirmHoursBefore} disabled={!auto('confirm-request')} onChange={(e) => (setN({ ...n, confirmHoursBefore: +e.target.value }), setMsg(''))} aria-label="Confirmation request timing">
            {CONFIRM_HOURS.filter((h) => h > n.reminderHoursBefore).map((h) => (
              <option key={h} value={h}>
                {ahead(h)}
              </option>
            ))}
          </select>
        </dd>
        <dt>No texts to clients between</dt>
        <dd className="hours">
          <select value={n.quietStart} onChange={(e) => (setN({ ...n, quietStart: +e.target.value }), setMsg(''))} aria-label="Quiet hours start">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hr(h)}
              </option>
            ))}
          </select>
          and
          <select value={n.quietEnd} onChange={(e) => (setN({ ...n, quietEnd: +e.target.value }), setMsg(''))} aria-label="Quiet hours end">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hr(h)}
              </option>
            ))}
          </select>
        </dd>
      </dl>
      <div className="row-actions mt">
        <button
          className="btn btn--dark"
          disabled={!changed}
          onClick={async () => {
            try {
              await api('/settings', { notifications: n }, 'PUT');
              await boot.reload();
              setMsg('Saved.');
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Save timing
        </button>
        {msg ? <span className="muted small">{msg}</span> : null}
      </div>
      <p className="muted small mt">
        A booking made inside these windows skips the text it would have missed: its booking confirmation already did the job. Texts the studio sends during quiet hours
        (offers, and the texts a change at the desk sets off) wait until they end.
      </p>
    </section>
  );
}

type RebookRow = { on: boolean; weeks: string };
/** The timing shown for a service with none saved (the API's fallback is the same). */
const FALLBACK_DAYS = 42;
const weeksOf = (s: Service) => String(Math.round(((s.rebookAfterDays ?? FALLBACK_DAYS) / 7) * 2) / 2);

/** Per service: whether clients get a text inviting them to book again, and how long after their visit. */
function RebookTexts() {
  const boot = useBoot();
  const services = boot.services.filter((s) => s.active && !s.ritualOf);
  const initial = () => Object.fromEntries(services.map((s) => [s.id, { on: !!s.rebookText, weeks: weeksOf(s) }])) as Record<string, RebookRow>;
  const [rows, setRows] = useState<Record<string, RebookRow>>(initial);
  const [msg, setMsg] = useState('');
  const changed = services.filter((s) => rows[s.id] && (rows[s.id].on !== !!s.rebookText || rows[s.id].weeks !== weeksOf(s)));
  const categories = [...CATEGORY_ORDER.filter((c) => services.some((s) => s.category === c)), ...[...new Set(services.map((s) => s.category))].filter((c) => !CATEGORY_ORDER.includes(c))];
  const set = (id: string, patch: Partial<RebookRow>) => (setRows({ ...rows, [id]: { ...rows[id], ...patch } }), setMsg(''));
  const masterOn = !!boot.settings.automations.rebook?.enabled;
  const count = services.filter((s) => rows[s.id]?.on).length;
  return (
    <section className="card-panel" id="rebook-texts">
      <div className="row-actions row-actions--spread">
        <h2>Time to book again</h2>
        <Toggle
          on={masterOn}
          onChange={async (v) => {
            await api('/settings', { automations: { rebook: { ...boot.settings.automations.rebook, enabled: v } } }, 'PUT');
            await boot.reload();
          }}
          label="Book-again texts on"
        />
      </div>
      <p className="muted small">
        A text inviting the client to book again, sent at 10am once the time after their visit has passed and they have nothing booked. Turn it on for each service that
        should get one. A New Client Ritual follows its service. {masterOn ? `On for ${count} service${count === 1 ? '' : 's'}.` : 'All of these are paused while the switch above is off.'}
      </p>
      <div className="table-wrap">
        <table className="table table--compact">
          <tbody>
            {categories.map((cat) => [
              <tr key={cat}>
                <th colSpan={3}>{cat}</th>
              </tr>,
              ...services
                .filter((s) => s.category === cat)
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <tr key={s.id}>
                    <td>{nice(s.name)}</td>
                    <td>
                      <Toggle on={rows[s.id].on} onChange={(v) => set(s.id, { on: v })} label={`Book-again text for ${nice(s.name)}`} />
                    </td>
                    <td>
                      <span className="hours">
                        <input
                          className="qty"
                          type="number"
                          min={0.5}
                          max={52}
                          step={0.5}
                          value={rows[s.id].weeks}
                          onChange={(e) => set(s.id, { weeks: e.target.value })}
                          aria-label={`Weeks after a ${nice(s.name)}`}
                        />
                        weeks after
                      </span>
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="row-actions mt">
        <button
          className="btn btn--dark"
          disabled={!changed.length}
          onClick={async () => {
            try {
              await api('/rebook-texts', { services: changed.map((s) => ({ id: s.id, on: rows[s.id].on, days: Math.round(Number(rows[s.id].weeks) * 7) })) }, 'PUT');
              await boot.reload();
              setMsg('Saved.');
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Save {changed.length ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : ''}
        </button>
        {msg ? <span className="muted small">{msg}</span> : null}
      </div>
    </section>
  );
}

type Reviews = NonNullable<ReturnType<typeof useBoot>['settings']['reviews']>;

/**
 * The text after a visit asking for a 1–5 rating, the thank-you for answering, and the
 * review link. The thank-you never depends on the score, and every answer gets the link:
 * Google removes reviews from businesses that reward reviews or only ask happy clients.
 */
function Ratings() {
  const boot = useBoot();
  const saved = boot.settings.reviews;
  const [r, setR] = useState<Reviews | undefined>(saved);
  const [msg, setMsg] = useState('');
  if (!r || !saved) return null;
  const set = (patch: Partial<Reviews>) => (setR({ ...r, ...patch }), setMsg(''));
  const services = boot.services.filter((x) => x.active && !x.ritualOf).sort((a, b) => a.name.localeCompare(b.name));
  const save = async (next: Reviews) => {
    try {
      await api('/settings', { reviews: next }, 'PUT');
      await boot.reload();
      setMsg('Saved.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <section className="card-panel" id="ratings">
      <div className="row-actions row-actions--spread">
        <h2>Ratings and reviews</h2>
        <Toggle on={saved.enabled} onChange={(v) => save({ ...saved, enabled: v })} label="Rating texts on" />
      </div>
      <p className="muted small">
        After checkout, clients get a text asking them to rate the visit from 1 to 5. Everyone who answers gets the same thank-you, once per client, whatever the score, and
        every answer gets your Google review link. A 1, 2 or 3 also sends you a private text so you can follow up. Change the wording under Texts.
      </p>
      <dl className="kv kv--settings">
        <dt>Send the rating text</dt>
        <dd className="hours">
          <select value={r.delayHours} onChange={(e) => set({ delayHours: +e.target.value })} aria-label="Hours after checkout">
            {[1, 2, 3, 4, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? '' : 's'} after checkout
              </option>
            ))}
          </select>
        </dd>
        <dt>Ask the same client at most once every (days)</dt>
        <dd>
          <input className="qty" type="number" min={7} max={365} value={r.everyDays} onChange={(e) => set({ everyDays: +e.target.value })} />
        </dd>
        <dt>Thank-you for answering</dt>
        <dd className="hours">
          <select value={r.rewardServiceId ?? ''} onChange={(e) => set({ rewardServiceId: e.target.value || null })} aria-label="Thank-you service">
            <option value="">No thank-you</option>
            {services.map((x) => (
              <option key={x.id} value={x.id}>
                Free {nice(x.name)}
              </option>
            ))}
          </select>
        </dd>
        {r.rewardServiceId ? (
          <>
            <dt>Called in texts</dt>
            <dd>
              <input value={r.rewardLabel ?? ''} placeholder="the service’s name" onChange={(e) => set({ rewardLabel: e.target.value })} aria-label="Thank-you name" />
            </dd>
            <dt>Good for (days; blank for no limit)</dt>
            <dd>
              <input className="qty" type="number" min={7} max={730} value={r.rewardDays ?? ''} onChange={(e) => set({ rewardDays: e.target.value ? +e.target.value : null })} />
            </dd>
          </>
        ) : null}
        <dt>Google review link</dt>
        <dd>
          <input value={r.reviewUrl} onChange={(e) => set({ reviewUrl: e.target.value.trim() })} aria-label="Google review link" />
        </dd>
      </dl>
      <div className="row-actions mt">
        <button className="btn btn--dark" disabled={JSON.stringify(r) === JSON.stringify(saved)} onClick={() => save(r)}>
          Save
        </button>
        {msg ? <span className="muted small">{msg}</span> : null}
      </div>
    </section>
  );
}

function TeamEditor({ m, onClose }: { m: Staff | null; onClose: () => void }) {
  const boot = useBoot();
  const [error, setError] = useState('');
  // the menu as clients see it; a New Client Ritual follows its service
  const menu = boot.services.filter((s) => s.active && !s.ritualOf);
  const had = menu.filter((s) => m && s.staffIds.includes(m.id)).map((s) => s.id);
  const [does, setDoes] = useState<string[]>(had);
  const categories = [...CATEGORY_ORDER.filter((c) => menu.some((s) => s.category === c)), ...[...new Set(menu.map((s) => s.category))].filter((c) => !CATEGORY_ORDER.includes(c))];
  const servicesChanged = [...does].sort().join() !== [...had].sort().join();
  // services nobody else does stop being bookable if this person is taken off them
  const leftEmpty = menu.filter((s) => m && had.includes(s.id) && !does.includes(s.id) && !s.staffIds.some((x) => x !== m.id && boot.staff.find((t) => t.id === x)?.active));
  const tick = (ids: string[], on: boolean) => setDoes(on ? [...new Set([...does, ...ids])] : does.filter((x) => !ids.includes(x)));
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
            phone: f.get('phone') ?? undefined,
            alerts: f.get('alerts') === 'on',
            color: f.get('color'),
            role: f.get('role'),
            bookable: f.get('bookable') === 'on',
            active: f.get('active') === 'on',
            password: f.get('password') || undefined,
          };
          try {
            const saved = m ? await api<Staff>(`/team/${m.id}`, body, 'PATCH') : await api<Staff>('/team', body);
            if (servicesChanged) await api(`/team/${saved.id}/services`, { serviceIds: does }, 'PUT');
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
          Mobile (for booking texts)
          <input name="phone" type="tel" defaultValue={m?.phone} />
        </label>
        <label className="check">
          <input type="checkbox" name="alerts" defaultChecked={m?.alerts ?? true} /> Text them when appointments are booked, moved or cancelled
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
        <fieldset className="field services-pick">
          <legend>Services they do</legend>
          <p className="muted small">
            Clients can only book them for what’s ticked, online and at the desk. A New Client Ritual follows its service. Appointments they already have stay on the calendar.
          </p>
          {categories.map((cat) => {
            const ids = menu.filter((s) => s.category === cat).map((s) => s.id);
            const all = ids.every((x) => does.includes(x));
            return (
              <div key={cat} className="services-pick__group">
                <label className="check services-pick__cat">
                  <input type="checkbox" checked={all} onChange={(e) => tick(ids, e.target.checked)} /> <strong>{cat}</strong>
                </label>
                {menu
                  .filter((s) => s.category === cat)
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" checked={does.includes(s.id)} onChange={(e) => tick([s.id], e.target.checked)} /> {nice(s.name)}
                    </label>
                  ))}
              </div>
            );
          })}
          {leftEmpty.length ? (
            <p className="form-error">
              No one else does {leftEmpty.map((s) => nice(s.name)).join(', ')}, so {leftEmpty.length === 1 ? 'it' : 'they'} can’t be booked until someone is ticked for{' '}
              {leftEmpty.length === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
        </fieldset>
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
