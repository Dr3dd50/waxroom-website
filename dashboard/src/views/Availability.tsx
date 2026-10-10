import { useState } from 'react';
import { api } from '../api';
import { DAY_KEYS, local, useBoot } from '../ctx';
import type { Staff } from '../types';
import { PageHead, Toggle } from '../ui';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const label = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
};
// studio wall-clock → UTC instant (DST-safe enough for whole days and half hours)
function toUtc(day: string, minutes: number) {
  const guess = new Date(`${day}T00:00:00Z`).getTime() + minutes * 60000;
  const off = (iso: number) => {
    const l = local(new Date(iso).toISOString());
    const asUtc = Date.parse(`${l.day}T00:00:00Z`) + l.minutes * 60000;
    return asUtc - iso;
  };
  return new Date(guess - off(guess - off(guess))).toISOString();
}

/** Working hours and time off. Employees edit their own; the owner can edit anyone's. */
export function AvailabilityView() {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [whoId, setWhoId] = useState(boot.me.id);
  const who = boot.staff.find((s) => s.id === whoId)!;
  return (
    <div className="page">
      <PageHead title="Availability" sub="Clients can only book online inside these hours. Time off is blocked for everyone." />
      {owner ? (
        <div className="staff-tabs">
          {boot.staff
            .filter((s) => s.active)
            .map((s) => (
              <button key={s.id} className={whoId === s.id ? 'is-on' : ''} onClick={() => setWhoId(s.id)}>
                <i style={{ background: s.color }} /> {s.short}
              </button>
            ))}
        </div>
      ) : null}
      <div className="two two--wide">
        <WeeklyHours who={who} key={`h-${who.id}`} />
        <TimeOffPanel who={who} key={`t-${who.id}`} />
      </div>
    </div>
  );
}

function WeeklyHours({ who }: { who: Staff }) {
  const boot = useBoot();
  const biz = (d: number) => boot.settings.hours[DAY_KEYS[d]];
  const initial = Object.fromEntries(
    ORDER.map((d) => [d, who.schedule ? who.schedule[d] ?? null : biz(d).working ? { start: biz(d).start * 60, end: biz(d).end * 60 } : null]),
  ) as Record<number, { start: number; end: number } | null>;
  const [sched, setSched] = useState(initial);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const changed = JSON.stringify(sched) !== JSON.stringify(initial);
  return (
    <section className="card-panel">
      <h2>{who.id === boot.me.id ? 'My usual hours' : `${who.short}’s usual hours`}</h2>
      <table className="table table--compact">
        <tbody>
          {ORDER.map((d) => {
            const b = biz(d);
            const v = sched[d];
            const opts = b.working ? Array.from({ length: (b.end - b.start) * 2 + 1 }, (_, i) => b.start * 60 + i * 30) : [];
            return (
              <tr key={d}>
                <td>{DAY_KEYS[d][0].toUpperCase() + DAY_KEYS[d].slice(1)}</td>
                <td>{b.working ? <Toggle on={!!v} onChange={(on) => (setSched({ ...sched, [d]: on ? { start: b.start * 60, end: b.end * 60 } : null }), setSaved(''))} label={`Working ${DAY_KEYS[d]}`} /> : null}</td>
                <td>
                  {!b.working ? (
                    <span className="muted">Studio closed</span>
                  ) : v ? (
                    <span className="hours">
                      <select value={v.start} onChange={(e) => (setSched({ ...sched, [d]: { ...v, start: +e.target.value } }), setSaved(''))} aria-label={`${DAY_KEYS[d]} start`}>
                        {opts.slice(0, -1).map((m) => (
                          <option key={m} value={m}>
                            {label(m)}
                          </option>
                        ))}
                      </select>
                      –
                      <select value={v.end} onChange={(e) => (setSched({ ...sched, [d]: { ...v, end: +e.target.value } }), setSaved(''))} aria-label={`${DAY_KEYS[d]} end`}>
                        {opts.slice(1).map((m) => (
                          <option key={m} value={m}>
                            {label(m)}
                          </option>
                        ))}
                      </select>
                    </span>
                  ) : (
                    <span className="muted">Off</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="row-actions mt">
        <button
          className="btn btn--dark"
          disabled={!changed}
          onClick={async () => {
            setError('');
            if (Object.values(sched).some((v) => v && v.end <= v.start)) return setError('Each day needs to end after it starts.');
            try {
              await api(`/team/${who.id}`, { schedule: sched }, 'PATCH');
              await boot.reload();
              setSaved('Saved. Online booking uses these hours now.');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save hours
        </button>
        {saved ? <span className="muted small">{saved}</span> : null}
      </div>
    </section>
  );
}

function TimeOffPanel({ who }: { who: Staff }) {
  const boot = useBoot();
  const [from, setFrom] = useState(boot.today);
  const [to, setTo] = useState(boot.today);
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState(12 * 60);
  const [end, setEnd] = useState(13 * 60);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const upcoming = (who.timeOff ?? []).filter((t) => Date.parse(t.to) > Date.now());
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const times = Array.from({ length: 25 }, (_, i) => 7 * 60 + i * 30);
  return (
    <section className="card-panel">
      <h2>Time off</h2>
      <form
        className="drawer-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setMsg('');
          const body = allDay ? { from: toUtc(from, 0), to: toUtc(to, 24 * 60), note } : { from: toUtc(from, start), to: toUtc(from, end), note };
          try {
            const r = await api<{ clash: number }>(`/team/${who.id}/time-off`, body);
            await boot.reload();
            setNote('');
            setMsg(r.clash ? `Saved. ${r.clash} appointment${r.clash === 1 ? ' is' : 's are'} already booked in that time: move ${r.clash === 1 ? 'it' : 'them'} from the calendar.` : 'Saved. Those times are now blocked online.');
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="check">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Whole day(s)
        </label>
        {allDay ? (
          <div className="two">
            <label className="field">
              From
              <input type="date" value={from} min={boot.today} onChange={(e) => (setFrom(e.target.value), e.target.value > to && setTo(e.target.value))} required />
            </label>
            <label className="field">
              Through
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </div>
        ) : (
          <>
            <label className="field">
              Day
              <input type="date" value={from} min={boot.today} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <div className="two">
              <label className="field">
                From
                <select value={start} onChange={(e) => setStart(+e.target.value)}>
                  {times.map((m) => (
                    <option key={m} value={m}>
                      {label(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Until
                <select value={end} onChange={(e) => setEnd(+e.target.value)}>
                  {times.map((m) => (
                    <option key={m} value={m}>
                      {label(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <label className="field">
          Note (optional, staff see it on the calendar)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vacation, appointment…" maxLength={80} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {msg ? <p className="note">{msg}</p> : null}
        <button className="btn btn--dark">Block this time</button>
      </form>
      <h3 className="mt">Coming up</h3>
      <ul className="mini-list">
        {upcoming.map((t) => (
          <li key={t.id}>
            <span>{t.note || 'Off'}</span>
            <strong>
              {fmt(t.from)} – {fmt(t.to)}
            </strong>
            <button
              className="chip"
              onClick={async () => {
                await api(`/team/${who.id}/time-off/${t.id}`, undefined, 'DELETE');
                await boot.reload();
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {!upcoming.length ? <li className="muted small">No time off coming up.</li> : null}
      </ul>
    </section>
  );
}
