import { useEffect, useMemo, useState } from 'react';
import type { Me } from '../App';
import {
  CATEGORY_COLORS,
  CLIENTS,
  SERVICES,
  STAFF,
  TODAY,
  addDays,
  appointmentsOn,
  catalog,
  categoryOf,
  clientById,
  duration,
  hoursFor,
  money,
  nice,
  serviceById,
  staffById,
  time,
  type Appointment,
  type Status,
} from '../data';
import { Drawer, Icon, PageHead, Pill, Stat } from '../ui';

const PX = 1.5; // pixels per minute on the day grid
const OPEN = 9 * 60;
const CLOSE = 19 * 60;
const STATUS_LABEL: Record<Status, string> = {
  booked: 'Booked',
  confirmed: 'Confirmed',
  'checked-in': 'Checked in',
  completed: 'Paid',
  'no-show': 'No-show',
  cancelled: 'Cancelled',
};

const dateLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function CalendarView({ me }: { me: Me }) {
  const owner = me.role === 'owner';
  const [day, setDay] = useState(TODAY);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [who, setWho] = useState<string>(owner ? 'all' : me.id);
  const [open, setOpen] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const withStatus = (a: Appointment) => ({ ...a, status: overrides[a.id] ?? a.status });
  const columns = who === 'all' ? STAFF.filter((s) => s.days.includes(day.getDay())) : [staffById(who)];
  const todays = appointmentsOn(day).map(withStatus).filter((a) => columns.some((c) => c.id === a.staffId));
  const live = todays.filter((a) => a.status !== 'cancelled');
  const booked = live.reduce((n, a) => n + (serviceById(a.serviceId).price ?? 0), 0);
  const weekStart = addDays(day, -((day.getDay() + 6) % 7));

  return (
    <div className="page">
      <PageHead title={mode === 'day' ? dateLabel(day) : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`} sub={isSameDay(day, TODAY) ? 'Today' : undefined}>
        <div className="seg">
          <button className="ghost-btn" onClick={() => setDay(addDays(day, mode === 'day' ? -1 : -7))} aria-label="Previous">
            <Icon name="left" />
          </button>
          <button className="chip" onClick={() => setDay(TODAY)}>
            Today
          </button>
          <button className="ghost-btn" onClick={() => setDay(addDays(day, mode === 'day' ? 1 : 7))} aria-label="Next">
            <Icon name="right" />
          </button>
        </div>
        <div className="seg seg--toggle">
          <button className={mode === 'day' ? 'is-on' : ''} onClick={() => setMode('day')}>
            Day
          </button>
          <button className={mode === 'week' ? 'is-on' : ''} onClick={() => setMode('week')}>
            Week
          </button>
        </div>
        <button className="btn btn--dark" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New appointment
        </button>
      </PageHead>

      {owner ? (
        <div className="staff-tabs">
          {mode === 'day' ? (
            <button className={who === 'all' ? 'is-on' : ''} onClick={() => setWho('all')}>
              Everyone
            </button>
          ) : null}
          {STAFF.map((s) => (
            <button key={s.id} className={who === s.id ? 'is-on' : ''} onClick={() => setWho(s.id)}>
              <i style={{ background: s.color }} /> {s.short}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'day' ? (
        <>
          <div className="stats">
            <Stat label="Appointments" value={live.length} note={plural(live.filter((a) => a.newClient).length, 'new client')} />
            <Stat label="Booked" value={money(booked)} note="before tips" />
            <Stat label="Deposits held" value={money(live.reduce((n, a) => n + (a.deposit ?? 0), 0))} />
            <Stat label="Booked online" value={`${Math.round((100 * live.filter((a) => a.bookedOnline).length) / Math.max(1, live.length))}%`} />
          </div>
          <DayGrid day={day} columns={columns} appts={todays} now={now} onOpen={setOpen} />
        </>
      ) : (
        <WeekGrid start={weekStart} staffId={who === 'all' ? me.id : who} withStatus={withStatus} onOpen={setOpen} onDay={(d) => (setDay(d), setMode('day'))} />
      )}

      {open ? (
        <AppointmentDrawer
          a={withStatus(open)}
          onClose={() => setOpen(null)}
          onStatus={(s) => {
            setOverrides({ ...overrides, [open.id]: s });
          }}
        />
      ) : null}
      {creating ? <NewAppointment me={me} day={day} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function DayGrid({ day, columns, appts, now, onOpen }: { day: Date; columns: typeof STAFF; appts: Appointment[]; now: Date; onOpen: (a: Appointment) => void }) {
  const h = hoursFor(day);
  const hours = Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) => OPEN / 60 + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isSameDay(day, now) && nowMin >= OPEN && nowMin <= CLOSE;
  if (!columns.length) return <p className="empty">No one is scheduled on this day.</p>;

  return (
    <div className="daygrid" style={{ ['--cols' as string]: columns.length }}>
      <div className="daygrid__head">
        <span />
        {columns.map((s) => (
          <div key={s.id} className="daygrid__who">
            <span className="avatar avatar--sm" style={{ background: s.color }}>
              {s.short[0]}
            </span>
            {s.short}
          </div>
        ))}
      </div>
      <div className="daygrid__body" style={{ height: (CLOSE - OPEN) * PX }}>
        <div className="daygrid__times">
          {hours.map((hr) => (
            <span key={hr} style={{ top: (hr * 60 - OPEN) * PX }}>
              {hr > 12 ? hr - 12 : hr} {hr >= 12 ? 'pm' : 'am'}
            </span>
          ))}
        </div>
        {columns.map((s) => (
          <div key={s.id} className="daygrid__col">
            {hours.map((hr) => (
              <i key={hr} className="daygrid__line" style={{ top: (hr * 60 - OPEN) * PX }} />
            ))}
            {h.working && h.end * 60 < CLOSE ? <div className="daygrid__closed" style={{ top: (h.end * 60 - OPEN) * PX, bottom: 0 }} /> : null}
            {appts
              .filter((a) => a.staffId === s.id)
              .map((a) => {
                const sv = serviceById(a.serviceId);
                const c = clientById(a.clientId);
                const top = (a.start.getHours() * 60 + a.start.getMinutes() - OPEN) * PX;
                return (
                  <button
                    key={a.id}
                    className={`appt appt--${a.status} ${a.minutes * PX < 56 ? 'appt--short' : ''}`}
                    style={{ top, height: Math.max(a.minutes * PX - 2, 20), background: CATEGORY_COLORS[categoryOf(sv)], borderColor: s.color }}
                    onClick={() => onOpen(a)}
                  >
                    <strong>{c.name}</strong>
                    <span>
                      {time(a.start)} · {nice(sv.name)}
                    </span>
                    <span className="appt__flags" hidden={a.minutes * PX < 56}>
                      {a.newClient ? <em>New</em> : null}
                      {a.usesMembership ? <em>Member</em> : null}
                      {a.status === 'completed' ? <em>Paid</em> : null}
                      {a.status === 'no-show' ? <em>No-show</em> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
        {showNow ? <div className="daygrid__now" style={{ top: (nowMin - OPEN) * PX }} /> : null}
      </div>
    </div>
  );
}

function WeekGrid({ start, staffId, withStatus, onOpen, onDay }: { start: Date; staffId: string; withStatus: (a: Appointment) => Appointment; onOpen: (a: Appointment) => void; onDay: (d: Date) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const s = staffById(staffId);
  return (
    <div className="week">
      {days.map((d) => {
        const list = appointmentsOn(d).map(withStatus).filter((a) => a.staffId === staffId && a.status !== 'cancelled');
        const total = list.reduce((n, a) => n + (serviceById(a.serviceId).price ?? 0), 0);
        return (
          <section key={d.toDateString()} className={`week__day ${isSameDay(d, TODAY) ? 'is-today' : ''}`}>
            <button className="week__head" onClick={() => onDay(d)}>
              <strong>{d.toLocaleDateString('en-US', { weekday: 'short' })}</strong>
              <span>{d.getDate()}</span>
            </button>
            <p className="week__sum">{list.length ? `${list.length} appts · ${money(total)}` : s.days.includes(d.getDay()) ? 'Open' : 'Off'}</p>
            <ul>
              {list.map((a) => {
                const sv = serviceById(a.serviceId);
                return (
                  <li key={a.id}>
                    <button className="week__appt" style={{ background: CATEGORY_COLORS[categoryOf(sv)] }} onClick={() => onOpen(a)}>
                      <span>{time(a.start)}</span>
                      <strong>{clientById(a.clientId).name}</strong>
                      <small>{nice(sv.name)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AppointmentDrawer({ a, onClose, onStatus }: { a: Appointment; onClose: () => void; onStatus: (s: Status) => void }) {
  const sv = serviceById(a.serviceId);
  const c = clientById(a.clientId);
  const s = staffById(a.staffId);
  const [step, setStep] = useState<'details' | 'checkout' | 'cancel' | 'paid'>('details');
  const [tipPct, setTipPct] = useState(catalog.policies.defaultGratuityPercent);
  const price = a.usesMembership ? 0 : sv.price ?? 0;
  const tip = Math.round(((sv.price ?? 0) * tipPct) / 100);
  const hoursAway = (+a.start - Date.now()) / 3_600_000;
  const late = hoursAway < catalog.policies.cancellationWindowHours;
  const fee = Math.round(((sv.price ?? 0) * catalog.policies.cancellationFeePercent) / 100);
  const reminder = new Date(+a.start - 24 * 3_600_000);
  const confirm = new Date(+a.start - 72 * 3_600_000);
  const past = (d: Date) => d < new Date();

  return (
    <Drawer
      title={nice(sv.name)}
      onClose={onClose}
      footer={
        step === 'details' && !['completed', 'cancelled', 'no-show'].includes(a.status) ? (
          <>
            <button className="btn btn--ghost" onClick={() => setStep('cancel')}>
              Cancel / no-show
            </button>
            {a.status !== 'checked-in' ? (
              <button className="btn btn--ghost" onClick={() => onStatus('checked-in')}>
                Check in
              </button>
            ) : null}
            <button className="btn btn--honey" onClick={() => setStep('checkout')}>
              Check out
            </button>
          </>
        ) : null
      }
    >
      {step === 'details' ? (
        <>
          <div className="appt-sum">
            <Pill tone={a.status === 'completed' ? 'green' : a.status === 'no-show' || a.status === 'cancelled' ? 'red' : 'honey'}>{STATUS_LABEL[a.status]}</Pill>
            {a.newClient ? <Pill tone="violet">New client</Pill> : null}
            {a.usesMembership ? <Pill tone="green">{c.membership}</Pill> : null}
            <p className="appt-sum__when">
              {a.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {time(a.start)}–{time(new Date(+a.start + a.minutes * 60000))}
            </p>
            <p>
              with <strong>{s.short}</strong> · {duration(a.minutes)} · {a.usesMembership ? 'covered by membership' : money(sv.price)}
            </p>
          </div>

          <section className="box">
            <h3>{c.name}</h3>
            <p className="muted">
              {c.phone} · {c.visits} visits · client since {new Date(c.since).getFullYear()}
            </p>
            {c.notes ? <p className="note">{c.notes}</p> : null}
            <div className="row-actions">
              <a className="chip" href={`sms:${c.phone}`}>
                <Icon name="chat" size={15} /> Text
              </a>
              <a className="chip" href={`tel:${c.phone}`}>
                <Icon name="phone" size={15} /> Call
              </a>
            </div>
          </section>

          <section className="box">
            <h3>Payment</h3>
            <dl className="kv">
              <dt>Card on file</dt>
              <dd>{c.cardOnFile ?? <Pill tone="red">None: ask for a card</Pill>}</dd>
              <dt>Deposit</dt>
              <dd>{a.deposit ? `${money(a.deposit)} paid at booking` : 'None'}</dd>
              {c.credit ? (
                <>
                  <dt>Referral credit</dt>
                  <dd>{money(c.credit)} available</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="box">
            <h3>Texts</h3>
            <ul className="timeline">
              <li className="is-done">
                <Icon name="check" size={14} /> Booking confirmation sent {a.bookedOnline ? '(booked online)' : '(booked by staff)'}
              </li>
              <li className={past(confirm) ? 'is-done' : ''}>
                <Icon name={past(confirm) ? 'check' : 'clock'} size={14} /> Confirm request, 72 h before ·{' '}
                {a.status === 'confirmed' || a.status === 'completed' ? 'client replied C' : past(confirm) ? 'no reply yet' : 'scheduled'}
              </li>
              <li className={past(reminder) ? 'is-done' : ''}>
                <Icon name={past(reminder) ? 'check' : 'clock'} size={14} /> Reminder, 24 h before
              </li>
              <li>
                <Icon name="clock" size={14} /> Rebooking nudge, 6 weeks after
              </li>
            </ul>
          </section>
        </>
      ) : null}

      {step === 'checkout' ? (
        <section>
          <dl className="kv kv--receipt">
            <dt>{nice(sv.name)}</dt>
            <dd>{money(sv.price)}</dd>
            {a.usesMembership ? (
              <>
                <dt>{c.membership}</dt>
                <dd>−{money(sv.price)}</dd>
              </>
            ) : null}
            {a.deposit ? (
              <>
                <dt>Deposit paid</dt>
                <dd>−{money(a.deposit)}</dd>
              </>
            ) : null}
            {c.credit && !a.usesMembership ? (
              <>
                <dt>Referral credit</dt>
                <dd>−{money(Math.min(c.credit, price))}</dd>
              </>
            ) : null}
            <dt>Tip ({tipPct}%)</dt>
            <dd>{money(tip)}</dd>
          </dl>
          <div className="tips">
            {[0, 15, 20, 25].map((p) => (
              <button key={p} className={tipPct === p ? 'is-on' : ''} onClick={() => setTipPct(p)}>
                {p ? `${p}%` : 'No tip'}
              </button>
            ))}
          </div>
          <p className="total">
            Total <strong>{money(Math.max(0, price - (a.deposit ?? 0) - (a.usesMembership ? 0 : Math.min(c.credit, price))) + tip)}</strong>
          </p>
          <div className="pay-opts">
            <button className="btn btn--honey" onClick={() => (onStatus('completed'), setStep('paid'))}>
              Charge {c.cardOnFile ?? 'card'}
            </button>
            <button className="btn btn--ghost" onClick={() => (onStatus('completed'), setStep('paid'))}>
              Tap to pay (reader)
            </button>
            <button className="btn btn--ghost" onClick={() => (onStatus('completed'), setStep('paid'))}>
              Cash
            </button>
          </div>
          <p className="muted small">Payments run through Stripe. The receipt is texted to {c.phone}.</p>
        </section>
      ) : null}

      {step === 'paid' ? (
        <div className="done">
          <span className="done__tick">
            <Icon name="check" size={28} />
          </span>
          <h3>Paid</h3>
          <p className="muted">Receipt texted to {c.name.split(' ')[0]}. Rebooking nudge scheduled in 6 weeks.</p>
          <button className="btn btn--dark" onClick={onClose}>
            Done
          </button>
        </div>
      ) : null}

      {step === 'cancel' ? (
        <section className="cancel">
          <p>
            {late
              ? `This is within ${catalog.policies.cancellationWindowHours} hours of the appointment, so the policy fee applies.`
              : `More than ${catalog.policies.cancellationWindowHours} hours ahead: no fee.`}
          </p>
          <button className="btn btn--ghost" onClick={() => (onStatus('cancelled'), onClose())}>
            Cancel{late ? ` and charge ${money(fee)} (${catalog.policies.cancellationFeePercent}%)` : ' with no fee'}
          </button>
          <button className="btn btn--ghost" onClick={() => (onStatus('cancelled'), onClose())}>
            Cancel and waive the fee
          </button>
          <button className="btn btn--ghost danger" onClick={() => (onStatus('no-show'), onClose())}>
            Mark no-show and charge {money(sv.price)} (100%)
          </button>
          <p className="muted small">The client gets a text either way. The waitlist is offered the open slot.</p>
        </section>
      ) : null}
    </Drawer>
  );
}

function NewAppointment({ me, day, onClose }: { me: Me; day: Date; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState(me.id);
  // Most-booked first, so the common case is one tap.
  const own = useMemo(() => {
    const list = SERVICES.filter((s) => s.staff.includes(staffId));
    return [...list.filter((s) => s.name === 'Brazilian'), ...list.filter((s) => s.name !== 'Brazilian')];
  }, [staffId]);
  const [serviceId, setServiceId] = useState(own[0]?.id);
  const [slot, setSlot] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const matches = q ? CLIENTS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)).slice(0, 6) : [];
  const sv = serviceId ? serviceById(serviceId) : null;
  const taken = appointmentsOn(day).filter((a) => a.staffId === staffId);
  const h = hoursFor(day);
  const slots: string[] = [];
  for (let t = h.start * 60; sv && t + sv.duration <= h.end * 60; t += 15) {
    const st = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, t);
    const en = +st + sv.duration * 60000;
    if (!taken.some((a) => +a.start < en && +a.start + a.minutes * 60000 > +st) && st > new Date()) slots.push(time(st));
  }
  const client = clientId ? clientById(clientId) : null;

  if (sent && client && sv)
    return (
      <Drawer title="Booked" onClose={onClose}>
        <div className="done">
          <span className="done__tick">
            <Icon name="check" size={28} />
          </span>
          <h3>
            {client.name} · {nice(sv.name)}
          </h3>
          <p className="muted">
            {dateLabel(day)} at {slot}. Confirmation texted to {client.phone}
            {client.cardOnFile ? '.' : ', with a link to add a card (required to hold the booking).'}
          </p>
          <button className="btn btn--dark" onClick={onClose}>
            Done
          </button>
        </div>
      </Drawer>
    );

  return (
    <Drawer
      title="New appointment"
      onClose={onClose}
      footer={
        <button className="btn btn--honey" disabled={!client || !slot} onClick={() => setSent(true)}>
          Book and text confirmation
        </button>
      }
    >
      <label className="field">
        Client
        {client ? (
          <div className="picked">
            <strong>{client.name}</strong> {client.phone}
            <button className="ghost-btn" onClick={() => setClientId(null)} aria-label="Change client">
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone, or add a new client" />
            {matches.length ? (
              <ul className="matches">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setClientId(c.id)}>
                      {c.name} <small>{c.phone}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </label>
      <label className="field">
        With
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={me.role !== 'owner'}>
          {STAFF.map((s) => (
            <option key={s.id} value={s.id}>
              {s.short}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Service
        <select value={serviceId} onChange={(e) => (setServiceId(e.target.value), setSlot(null))}>
          {own.map((s) => (
            <option key={s.id} value={s.id}>
              {nice(s.name)} · {duration(s.duration)} · {money(s.price)}
            </option>
          ))}
        </select>
      </label>
      {sv?.deposit ? (
        <p className="muted small">
          {money(sv.deposit)} deposit {sv.depositNewClientsOnly ? 'for new clients' : ''}, collected by text link.
        </p>
      ) : null}
      <div className="field">
        {dateLabel(day)}
        <div className="slots">
          {slots.length ? (
            slots.map((t) => (
              <button key={t} className={slot === t ? 'is-on' : ''} onClick={() => setSlot(t)}>
                {t}
              </button>
            ))
          ) : (
            <p className="muted small">No open times left on this day.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
