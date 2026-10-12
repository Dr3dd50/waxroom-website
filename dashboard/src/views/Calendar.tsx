import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CATEGORY_COLORS, DAY_KEYS, addDays, dateLong, dateShort, duration, local, money, nice, phone, time, useBoot, weekday } from '../ctx';
import type { Appointment, Client, Status } from '../types';
import { Drawer, Icon, PageHead, Pill, Stat } from '../ui';

const PX = 1.5; // pixels per minute on the day grid
const STATUS_LABEL: Record<Status, string> = { booked: 'Booked', confirmed: 'Confirmed', 'checked-in': 'Checked in', completed: 'Paid', 'no-show': 'No-show', cancelled: 'Cancelled' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Loaded = { appointments: Appointment[]; clients: Client[] };

export function CalendarView() {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [day, setDay] = useState(boot.today);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [who, setWho] = useState<string>(owner ? 'all' : boot.me.id);
  const [data, setData] = useState<Loaded | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const weekStart = addDays(day, -((weekday(day) + 6) % 7));
  const from = mode === 'day' ? day : weekStart;
  const to = mode === 'day' ? day : addDays(weekStart, 6);

  const load = useCallback(async () => setData(await api<Loaded>(`/appointments?from=${from}&to=${to}`)), [from, to]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const clients = useMemo(() => new Map((data?.clients ?? []).map((c) => [c.id, c])), [data]);
  const working = boot.staff.filter((s) => s.active);
  const columns = who === 'all' ? working.filter((s) => s.bookable || data?.appointments.some((a) => a.staffId === s.id)) : working.filter((s) => s.id === who);
  const shown = (data?.appointments ?? []).filter((a) => columns.some((c) => c.id === a.staffId));
  const live = shown.filter((a) => a.status !== 'cancelled');
  const open = openId ? data?.appointments.find((a) => a.id === openId) ?? null : null;

  return (
    <div className="page">
      <PageHead title={mode === 'day' ? dateLong(day) : `Week of ${dateLong(weekStart).split(', ').slice(1).join(', ')}`} sub={day === boot.today ? 'Today' : undefined}>
        <div className="seg">
          <button className="ghost-btn" onClick={() => setDay(addDays(day, mode === 'day' ? -1 : -7))} aria-label="Previous">
            <Icon name="left" />
          </button>
          <button className="chip" onClick={() => setDay(boot.today)}>
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
          <button className={mode === 'week' ? 'is-on' : ''} onClick={() => (setMode('week'), who === 'all' && setWho(boot.me.id))}>
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
          {working.map((s) => (
            <button key={s.id} className={who === s.id ? 'is-on' : ''} onClick={() => setWho(s.id)}>
              <i style={{ background: s.color }} /> {s.short}
            </button>
          ))}
        </div>
      ) : null}

      {!data ? <p className="empty">Loading…</p> : null}
      {data && mode === 'day' ? (
        <>
          {/* totals are the owner's numbers */}
          {owner ? <div className="stats">
            <Stat label="Appointments" value={live.length} note={plural(live.filter((a) => a.newClient).length, 'new client')} />
            <Stat label="Booked" value={money(live.reduce((n, a) => n + a.price, 0))} note="before tips" />
            <Stat label="Paid so far" value={money(live.reduce((n, a) => n + (a.checkout?.total ?? 0), 0))} note="incl. tips" />
            <Stat label="Confirmed" value={`${live.filter((a) => a.status !== 'booked').length} / ${live.length}`} note="replied C or checked in" />
          </div> : null}
          <DayGrid day={day} columns={columns} appts={shown} clients={clients} onOpen={(a) => setOpenId(a.id)} />
        </>
      ) : null}
      {data && mode === 'week' ? <WeekGrid start={weekStart} staffId={who === 'all' ? boot.me.id : who} appts={data.appointments} clients={clients} onOpen={(a) => setOpenId(a.id)} onDay={(d) => (setDay(d), setMode('day'))} /> : null}

      {open ? <AppointmentDrawer a={open} client={clients.get(open.clientId)!} onClose={() => setOpenId(null)} onChanged={async (moved) => {
            await load();
            if (moved) setOpenId(moved);
          }} /> : null}
      {creating ? <NewAppointment day={day} onClose={() => setCreating(false)} onBooked={load} /> : null}
    </div>
  );
}

function DayGrid({ day, columns, appts, clients, onOpen }: { day: string; columns: ReturnType<typeof useBoot>['staff']; appts: Appointment[]; clients: Map<string, Client>; onOpen: (a: Appointment) => void }) {
  const boot = useBoot();
  const h = boot.settings.hours[DAY_KEYS[weekday(day)]];
  const OPEN = 9 * 60, CLOSE = 19 * 60;
  const hours = Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) => OPEN / 60 + i);
  const [now, setNow] = useState(() => local(new Date().toISOString()));
  useEffect(() => {
    const id = window.setInterval(() => setNow(local(new Date().toISOString())), 60000);
    return () => window.clearInterval(id);
  }, []);
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
            {!h?.working ? <div className="daygrid__closed" style={{ top: 0, bottom: 0 }} /> : h.end * 60 < CLOSE ? <div className="daygrid__closed" style={{ top: (h.end * 60 - OPEN) * PX, bottom: 0 }} /> : null}
            {offBlocks(s, day).map((b) => (
              <div key={b.id} className="daygrid__off" style={{ top: (Math.max(b.start, OPEN) - OPEN) * PX, height: (Math.min(b.end, CLOSE) - Math.max(b.start, OPEN)) * PX }}>
                <span>{b.note || 'Time off'}</span>
              </div>
            ))}
            {appts
              .filter((a) => a.staffId === s.id)
              .map((a) => {
                const sv = boot.services.find((x) => x.id === a.serviceId);
                const c = clients.get(a.clientId);
                const mins = (Date.parse(a.end) - Date.parse(a.start)) / 60000;
                const top = (local(a.start).minutes - OPEN) * PX;
                const short = mins * PX < 56;
                return (
                  <button
                    key={a.id}
                    className={`appt appt--${a.status} ${short ? 'appt--short' : ''}`}
                    style={{ top, height: Math.max(mins * PX - 2, 20), background: CATEGORY_COLORS[sv?.category ?? ''] ?? '#eee', borderColor: s.color }}
                    onClick={() => onOpen(a)}
                  >
                    <strong>{c ? `${c.first} ${c.last.slice(0, 1)}.` : 'Client'}</strong>
                    <span>
                      {time(a.start)} · {nice(sv?.name ?? 'Service')}
                    </span>
                    <span className="appt__flags" hidden={short}>
                      {a.newClient ? <em>New</em> : null}
                      {c?.membership?.status === 'active' ? <em>Member</em> : null}
                      {a.status === 'confirmed' ? <em>Confirmed</em> : null}
                      {a.status === 'checked-in' ? <em>Here</em> : null}
                      {a.status === 'completed' ? <em>Paid</em> : null}
                      {a.status === 'no-show' ? <em>No-show</em> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
        {now.day === day && now.minutes >= OPEN && now.minutes <= CLOSE ? <div className="daygrid__now" style={{ top: (now.minutes - OPEN) * PX }} /> : null}
      </div>
    </div>
  );
}

function WeekGrid({ start, staffId, appts, clients, onOpen, onDay }: { start: string; staffId: string; appts: Appointment[]; clients: Map<string, Client>; onOpen: (a: Appointment) => void; onDay: (d: string) => void }) {
  const boot = useBoot();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="week">
      {days.map((d) => {
        const list = appts.filter((a) => a.staffId === staffId && a.status !== 'cancelled' && local(a.start).day === d);
        const total = list.reduce((n, a) => n + a.price, 0);
        const h = boot.settings.hours[DAY_KEYS[weekday(d)]];
        return (
          <section key={d} className={`week__day ${d === boot.today ? 'is-today' : ''}`}>
            <button className="week__head" onClick={() => onDay(d)}>
              <strong>{new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</strong>
              <span>{+d.slice(8)}</span>
            </button>
            <p className="week__sum">{list.length ? (boot.me.role === 'owner' ? `${list.length} appts · ${money(total)}` : '') : h?.working ? '' : 'Closed'}</p>
            <ul>
              {list.map((a) => {
                const sv = boot.services.find((x) => x.id === a.serviceId);
                const c = clients.get(a.clientId);
                return (
                  <li key={a.id}>
                    <button className={`week__appt appt--${a.status}`} style={{ background: CATEGORY_COLORS[sv?.category ?? ''] }} onClick={() => onOpen(a)}>
                      <span>{time(a.start)}</span>
                      <strong>{c ? `${c.first} ${c.last.slice(0, 1)}.` : 'Client'}</strong>
                      <small>{nice(sv?.name ?? '')}</small>
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

type Quote = { lines: { label: string; amount: number }[]; due: number; membershipLeft: number; credit: number; card: string | null; tipBase: number; defaultTipPercent: number };

function AppointmentDrawer({ a, client, onClose, onChanged }: { a: Appointment; client: Client; onClose: () => void; onChanged: (movedId?: string) => Promise<void> }) {
  const boot = useBoot();
  const sv = boot.services.find((s) => s.id === a.serviceId)!;
  const staff = boot.staff.find((s) => s.id === a.staffId)!;
  const [step, setStep] = useState<'details' | 'checkout' | 'cancel' | 'move' | 'paid'>('details');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [tipPct, setTipPct] = useState(boot.settings.policies.defaultTipPercent);
  const [customTip, setCustomTip] = useState('');
  const [useCredit, setUseCredit] = useState(true);
  const [useMembership, setUseMembership] = useState(true);
  const [notes, setNotes] = useState(a.notes);
  const closed = ['completed', 'cancelled', 'no-show'].includes(a.status);
  const hoursAway = (Date.parse(a.start) - Date.now()) / 3600000;
  const late = hoursAway < boot.settings.policies.cancellationWindowHours;
  const lateFee = Math.round((a.price * boot.settings.policies.cancellationFeePercent) / 100);
  const tip = customTip !== '' ? Math.round(Number(customTip) * 100) : Math.round((a.price * tipPct) / 100);

  useEffect(() => {
    if (step !== 'checkout') return;
    api<Quote>(`/appointments/${encodeURIComponent(a.id)}/quote?credit=${useCredit}&membership=${useMembership}`).then(setQuote, (e) => setError(e.message));
  }, [step, useCredit, useMembership, a.id]);

  async function act(fn: () => Promise<unknown>, next?: typeof step) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
      if (next) setStep(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const path = `/appointments/${encodeURIComponent(a.id)}`;

  const footer =
    step === 'details' && !closed ? (
      <>
        <button className="btn btn--ghost" onClick={() => setStep('cancel')}>
          Cancel / no-show
        </button>
        <button className="btn btn--ghost" onClick={() => setStep('move')}>
          Move
        </button>
        {a.status !== 'checked-in' ? (
          <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(path, { status: 'checked-in' }, 'PATCH'))}>
            Check in
          </button>
        ) : null}
        <button className="btn btn--honey" onClick={() => setStep('checkout')}>
          Check out
        </button>
      </>
    ) : null;

  return (
    <Drawer title={nice(sv.name)} onClose={onClose} footer={footer}>
      {error ? <p className="form-error">{error}</p> : null}
      {step === 'details' ? (
        <>
          <div className="appt-sum">
            <Pill tone={a.status === 'completed' ? 'green' : a.status === 'no-show' || a.status === 'cancelled' ? 'red' : 'honey'}>{STATUS_LABEL[a.status]}</Pill>
            {a.newClient ? <Pill tone="violet">New client</Pill> : null}
            {client.membership?.status === 'active' ? <Pill tone="green">{boot.memberships.find((m) => m.id === client.membership!.membershipId)?.name}</Pill> : null}
            {a.referral ? <Pill tone="honey">Referred: {money(a.referral.friendDiscount)} off</Pill> : null}
            <p className="appt-sum__when">
              {dateShort(a.start)} · {time(a.start)}–{time(a.end)}
            </p>
            <p>
              with <strong>{staff.short}</strong> · {duration(sv.duration)} · {money(a.price)} · booked {a.source === 'online' ? 'online' : a.source === 'import' ? 'in GlossGenius' : 'by staff'}
            </p>
          </div>

          <section className="box">
            <h3>
              {client.first} {client.last}
            </h3>
            <p className="muted">
              {client.contactHidden ? 'Phone and email: owner only' : phone(client.phone)}
              {client.email ? ` · ${client.email}` : ''}
            </p>
            {client.notes ? <p className="note">{client.notes}</p> : null}
            <label className="field">
              Appointment note
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== a.notes && act(() => api(path, { notes }, 'PATCH'))} />
            </label>
          </section>

          <section className="box">
            <h3>Payment</h3>
            <dl className="kv">
              <dt>Card on file</dt>
              <dd>{client.card ?? <Pill tone="red">None: add one in Clients</Pill>}</dd>
              <dt>Deposit</dt>
              <dd>{a.deposit ? `${money(a.deposit.amount)} ${a.deposit.status}` : 'None'}</dd>
              {client.credit ? (
                <>
                  <dt>Account credit</dt>
                  <dd>{money(client.credit)}</dd>
                </>
              ) : null}
            </dl>
            {a.checkout ? (
              <dl className="kv kv--receipt">
                {a.checkout.lines.map((l, i) => (
                  <Line key={i} label={l.label} amount={l.amount} />
                ))}
                <Line label="Tip" amount={a.checkout.tip} />
                <dt>
                  <strong>Paid ({a.checkout.method})</strong>
                </dt>
                <dd>
                  <strong>{money(a.checkout.total)}</strong>
                </dd>
              </dl>
            ) : null}
            {a.cancel ? (
              <p className="muted small">
                {a.cancel.noShow ? 'No-show' : `Cancelled by ${a.cancel.by}`}
                {a.cancel.fee ? ` · ${money(a.cancel.fee)} fee ${a.cancel.feeStatus}` : a.cancel.feeStatus === 'waived' ? ' · fee waived' : ''}
              </p>
            ) : null}
          </section>

          <section className="box">
            <h3>Texts</h3>
            <ul className="timeline">
              <TextStep done={!!a.texts.bookedAt} label="Booking confirmation" />
              <TextStep
                done={!!a.texts.confirmRequestAt}
                label={`Confirm request, ${boot.settings.notifications.confirmHoursBefore} h before`}
                note={a.texts.confirmedAt ? 'replied C' : bookedWithin(a, boot.settings.notifications.confirmHoursBefore) && !a.texts.confirmRequestAt ? 'not needed (booked inside that window)' : undefined}
              />
              <TextStep
                done={!!a.texts.reminderAt}
                label={`Reminder, ${boot.settings.notifications.reminderHoursBefore} h before`}
                note={bookedWithin(a, boot.settings.notifications.reminderHoursBefore) && !a.texts.reminderAt ? 'not needed (booked inside that window)' : undefined}
              />
            </ul>
          </section>
        </>
      ) : null}

      {step === 'checkout' ? (
        quote ? (
          <section className="checkout">
            <dl className="kv kv--receipt">
              {quote.lines.map((l, i) => (
                <Line key={i} label={l.label} amount={l.amount} />
              ))}
              <Line label={`Tip${customTip === '' ? ` (${tipPct}%)` : ''}`} amount={tip} />
            </dl>
            <div className="tips">
              {[0, 15, 20, 25].map((p) => (
                <button key={p} className={customTip === '' && tipPct === p ? 'is-on' : ''} onClick={() => (setTipPct(p), setCustomTip(''))}>
                  {p ? `${p}%` : 'No tip'}
                </button>
              ))}
            </div>
            <label className="field">
              Other tip amount ($)
              <input type="number" min="0" step="1" value={customTip} onChange={(e) => setCustomTip(e.target.value)} />
            </label>
            {client.credit ? (
              <label className="check">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use {money(client.credit)} account credit
              </label>
            ) : null}
            {quote.membershipLeft ? (
              <label className="check">
                <input type="checkbox" checked={useMembership} onChange={(e) => setUseMembership(e.target.checked)} /> Use a membership visit ({quote.membershipLeft} left this month)
              </label>
            ) : null}
            <p className="total">
              Total <strong>{money(quote.due + tip)}</strong>
            </p>
            <div className="pay-opts">
              <button className="btn btn--honey" disabled={busy || (!quote.card && quote.due + tip > 0)} onClick={() => act(() => api(`${path}/checkout`, { tip, method: 'card', useCredit, useMembership }), 'paid')}>
                {quote.due + tip > 0 ? (quote.card ? `Charge ${quote.card}` : 'No card on file') : 'Complete (nothing to charge)'}
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`${path}/checkout`, { tip, method: 'cash', useCredit, useMembership }), 'paid')}>
                Paid in cash
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`${path}/checkout`, { tip, method: 'other', useCredit, useMembership }), 'paid')}>
                Paid another way (card reader, Zelle…)
              </button>
            </div>
            <p className="muted small">{boot.live.payments ? 'Card charges go through Stripe.' : 'Stripe isn’t connected yet, so card charges are simulated.'} The receipt and referral link are texted to the client.</p>
            <button className="linkish" onClick={() => setStep('details')}>
              ← Back
            </button>
          </section>
        ) : (
          <p className="muted">Working out the total…</p>
        )
      ) : null}

      {step === 'paid' ? (
        <div className="done">
          <span className="done__tick">
            <Icon name="check" size={28} />
          </span>
          <h3>Checked out</h3>
          <p className="muted">Receipt texted to {client.first}. A rebooking nudge goes out in 6 weeks if nothing’s booked.</p>
          <button className="btn btn--dark" onClick={onClose}>
            Done
          </button>
        </div>
      ) : null}

      {step === 'cancel' ? (
        <section className="cancel">
          <p>
            {late
              ? `This is within ${boot.settings.policies.cancellationWindowHours} hours of the appointment, so the ${boot.settings.policies.cancellationFeePercent}% fee (${money(lateFee)}) applies.`
              : `More than ${boot.settings.policies.cancellationWindowHours} hours ahead: no fee.`}
            {a.deposit?.status === 'paid' ? ` The ${money(a.deposit.amount)} deposit counts toward any fee.` : ''}
          </p>
          <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`${path}/cancel`, {}), 'details')}>
            {late ? `Cancel and charge the fee` : 'Cancel with no fee'}
          </button>
          {late ? (
            <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`${path}/cancel`, { waive: true }), 'details')}>
              Cancel and waive the fee
            </button>
          ) : null}
          <button className="btn btn--ghost danger" disabled={busy} onClick={() => act(() => api(`${path}/cancel`, { noShow: true }), 'details')}>
            Mark no-show and charge {money(a.price)}
          </button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`${path}/cancel`, { noShow: true, waive: true }), 'details')}>
            Mark no-show, no charge
          </button>
          <p className="muted small">The client gets a cancellation text. Fees go on the card on file.</p>
          <button className="linkish" onClick={() => setStep('details')}>
            ← Back
          </button>
        </section>
      ) : null}

      {step === 'move' ? <MovePicker a={a} onMoved={async (id) => onChanged(id).then(() => setStep('details'))} onBack={() => setStep('details')} /> : null}
    </Drawer>
  );
}

/** A person's time off and non-working hours on a studio day, as minutes from midnight. */
function offBlocks(s: { schedule?: Record<number, { start: number; end: number } | null>; timeOff: { id: string; from: string; to: string; note: string }[] }, day: string) {
  const out: { id: string; start: number; end: number; note: string }[] = [];
  const own = s.schedule?.[weekday(day)];
  if (s.schedule && own === null) out.push({ id: 'day-off', start: 0, end: 24 * 60, note: 'Not working' });
  for (const t of s.timeOff ?? []) {
    const a = local(t.from), b = local(t.to);
    if (a.day > day || b.day < day) continue;
    out.push({ id: t.id, start: a.day < day ? 0 : a.minutes, end: b.day > day ? 24 * 60 : b.minutes, note: t.note });
  }
  return out.filter((x) => x.end > 9 * 60 && x.start < 19 * 60);
}
const bookedWithin = (a: Appointment, hours: number) => a.texts.bookedAt !== undefined && (Date.parse(a.start) - Date.parse(a.texts.bookedAt)) / 3600000 <= hours;
const Line = ({ label, amount }: { label: string; amount: number }) => (
  <>
    <dt>{label}</dt>
    <dd>{amount < 0 ? `−${money(-amount)}` : money(amount)}</dd>
  </>
);
const TextStep = ({ done, label, note }: { done: boolean; label: string; note?: string }) => (
  <li className={done ? 'is-done' : ''}>
    <Icon name={done ? 'check' : 'clock'} size={14} /> {label}
    {note ? ` · ${note}` : done ? '' : ' · scheduled'}
  </li>
);

function SlotPicker({ serviceId, staffId, day, setDay, onPick, picked }: { serviceId: string; staffId: string; day: string; setDay: (d: string) => void; onPick: (start: string) => void; picked?: string | null }) {
  const [slots, setSlots] = useState<{ start: string }[] | null>(null);
  useEffect(() => {
    setSlots(null);
    if (serviceId && staffId) api<{ start: string }[]>(`/availability?service=${serviceId}&staff=${staffId}&day=${day}`).then(setSlots);
  }, [serviceId, staffId, day]);
  return (
    <div className="field">
      <span>Day</span>
      <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
      <div className="slots">
        {slots === null ? (
          <p className="muted small">Finding open times…</p>
        ) : slots.length ? (
          slots.map((s) => (
            <button key={s.start} className={picked === s.start ? 'is-on' : ''} onClick={() => onPick(s.start)}>
              {time(s.start)}
            </button>
          ))
        ) : (
          <p className="muted small">No open times that day.</p>
        )}
      </div>
    </div>
  );
}

function MovePicker({ a, onMoved, onBack }: { a: Appointment; onMoved: (id: string) => Promise<void>; onBack: () => void }) {
  const boot = useBoot();
  const [day, setDay] = useState(local(a.start).day);
  const [staffId, setStaffId] = useState(a.staffId);
  const [error, setError] = useState('');
  const sv = boot.services.find((s) => s.id === a.serviceId)!;
  return (
    <section className="cancel">
      {boot.me.role === 'owner' ? (
        <label className="field">
          With
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {boot.staff.filter((s) => sv.staffIds.includes(s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.short}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <SlotPicker
        serviceId={a.serviceId}
        staffId={staffId}
        day={day}
        setDay={setDay}
        onPick={(start) =>
          api<Appointment>(`/appointments/${encodeURIComponent(a.id)}/move`, { start, staffId }).then(
            (m) => onMoved(m.id),
            (e) => setError(e.message),
          )
        }
      />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="linkish" onClick={onBack}>
        ← Back
      </button>
    </section>
  );
}

function NewAppointment({ day: initialDay, onClose, onBooked }: { day: string; onClose: () => void; onBooked: () => Promise<void> }) {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [clients, setClients] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [adding, setAdding] = useState(false);
  const [staffId, setStaffId] = useState(boot.me.id);
  const own = useMemo(() => {
    const list = boot.services.filter((s) => s.active && s.staffIds.includes(staffId)).sort((x, y) => x.category.localeCompare(y.category) || x.order - y.order);
    return [...list.filter((s) => s.name === 'Brazilian'), ...list.filter((s) => s.name !== 'Brazilian')];
  }, [boot.services, staffId]);
  const [serviceId, setServiceId] = useState(own[0]?.id ?? '');
  const [day, setDay] = useState(initialDay);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    api<Client[]>('/clients').then(setClients);
  }, []);
  useEffect(() => {
    if (!own.some((s) => s.id === serviceId)) setServiceId(own[0]?.id ?? '');
  }, [own, serviceId]);
  const digits = q.replace(/\D/g, '');
  const matches = q && clients ? clients.filter((c) => `${c.first} ${c.last}`.toLowerCase().includes(q.toLowerCase().trim()) || (digits.length >= 3 && c.phone.includes(digits))).slice(0, 6) : [];
  const sv = boot.services.find((s) => s.id === serviceId);

  if (done && client && sv)
    return (
      <Drawer title="Booked" onClose={onClose}>
        <div className="done">
          <span className="done__tick">
            <Icon name="check" size={28} />
          </span>
          <h3>
            {client.first} · {nice(sv.name)}
          </h3>
          <p className="muted">
            {dateLong(day)} at {slot && time(slot)}. Confirmation texted to {client.contactHidden ? 'the client' : phone(client.phone)}.
            {client.card ? '' : ' No card on file yet: add one in Clients before the visit.'}
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
        <button
          className="btn btn--honey"
          disabled={!client || !slot}
          onClick={async () => {
            setError('');
            try {
              await api('/appointments', { clientId: client!.id, serviceId, staffId, start: slot, notes });
              await onBooked();
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Book and text confirmation
        </button>
      }
    >
      {error ? <p className="form-error">{error}</p> : null}
      <div className="field">
        <span>Client</span>
        {client ? (
          <div className="picked">
            <strong>
              {client.first} {client.last}
            </strong>{' '}
            {phone(client.phone)}
            <button className="ghost-btn" onClick={() => setClient(null)} aria-label="Change client">
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : adding ? (
          <NewClientForm
            onCancel={() => setAdding(false)}
            onSaved={(c) => {
              setClients([...(clients ?? []), c]);
              setClient(c);
              setAdding(false);
            }}
          />
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" />
            {matches.length ? (
              <ul className="matches">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setClient(c)}>
                      {c.first} {c.last} <small>{phone(c.phone)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button className="linkish" onClick={() => setAdding(true)}>
              + New client
            </button>
          </>
        )}
      </div>
      <label className="field">
        With
        <select value={staffId} onChange={(e) => (setStaffId(e.target.value), setSlot(null))} disabled={!owner}>
          {boot.staff
            .filter((s) => s.active)
            .map((s) => (
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
      {sv?.deposit ? <p className="muted small">{money(sv.deposit)} deposit {sv.depositNewClientsOnly ? 'for new clients' : ''}, charged to the card on file if there is one.</p> : null}
      {serviceId ? <SlotPicker serviceId={serviceId} staffId={staffId} day={day} setDay={(d) => (setDay(d), setSlot(null))} onPick={setSlot} picked={slot} /> : null}
      <label className="field">
        Note (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </Drawer>
  );
}

export function NewClientForm({ onSaved, onCancel }: { onSaved: (c: Client) => void; onCancel: () => void }) {
  const [error, setError] = useState('');
  return (
    <form
      className="new-client"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          onSaved(await api<Client>('/clients', { first: f.get('first'), last: f.get('last'), phone: f.get('phone'), email: f.get('email'), smsMarketing: f.get('marketing') === 'on' }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <div className="two">
        <input name="first" placeholder="First name" required />
        <input name="last" placeholder="Last name" />
      </div>
      <div className="two">
        <input name="phone" placeholder="Mobile" required inputMode="tel" />
        <input name="email" placeholder="Email" type="email" />
      </div>
      <label className="check">
        <input type="checkbox" name="marketing" /> Client agreed to offers by text
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="row-actions">
        <button className="btn btn--dark">Add client</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
