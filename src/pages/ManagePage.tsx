// The link in every booking text: see the appointment, move it, or cancel it
// (with the policy fee shown before anything is charged).
import { useEffect, useState } from 'react';
import { api, cents, dateOf, timeOf, TZ } from '../lib/api';
import { business, phoneDisplay } from '../data';
import { CalendarButtons } from './BookPage';

type Booking = {
  token: string;
  status: string;
  start: string;
  service: string;
  serviceId: string;
  staff: string;
  staffId: string;
  price: number;
  deposit: number;
  first: string;
  card: string | null;
  cancelFee: number;
  canCancelOnline: boolean;
  windowHours: number;
  calendar?: { ics: string; google: string };
};

export function ManagePage() {
  const token = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('t') ?? '';
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'view' | 'cancel' | 'move'>('view');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setError('This link is missing its booking code. Use the link from your text.');
    api<Booking>(`/public/booking/${token}`).then(setB, (e) => setError(e.message));
  }, [token]);

  const upcoming = b && ['booked', 'confirmed'].includes(b.status);
  const inWindow = b && (Date.parse(b.start) - Date.now()) / 3600000 < b.windowHours;

  async function cancel() {
    setBusy(true);
    try {
      setB(await api<Booking>(`/public/booking/${token}/cancel`, {}));
      setMode('view');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="book">
      <div className="container manage">
        <p className="eyebrow">Your booking</p>
        {error ? <p className="form-error">{error}</p> : null}
        {!b && !error ? <p className="muted">Loading…</p> : null}
        {b ? (
          <>
            <h1 className="display book__title">
              {b.status === 'cancelled' ? (
                <>
                  <em>Cancelled.</em>
                </>
              ) : (
                <>
                  See you <em>{new Date(b.start).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })}.</em>
                </>
              )}
            </h1>
            <div className="manage__card">
              <dl>
                <dt>Service</dt>
                <dd>{b.service}</dd>
                <dt>With</dt>
                <dd>{b.staff}</dd>
                <dt>When</dt>
                <dd>
                  {dateOf(b.start)} at {timeOf(b.start)}
                </dd>
                <dt>Price</dt>
                <dd>
                  {cents(b.price)}
                  {b.deposit ? ` (${cents(b.deposit)} deposit paid)` : ''}
                </dd>
                <dt>Where</dt>
                <dd>{business.address}</dd>
              </dl>
            </div>

            {upcoming && mode === 'view' ? (
              <div className="book__actions">
                {b.calendar ? <CalendarButtons calendar={b.calendar} /> : null}
                {!inWindow ? (
                  <button className="btn btn--dark" onClick={() => setMode('move')}>
                    Change time
                  </button>
                ) : null}
                {b.canCancelOnline ? (
                  <button className="btn btn--ghost" onClick={() => setMode('cancel')}>
                    Cancel appointment
                  </button>
                ) : null}
              </div>
            ) : null}
            {upcoming && inWindow ? (
              <p className="muted">
                It’s within {b.windowHours} hours of your appointment, so changes need a call or text: <a href={`tel:${business.phone}`}>{phoneDisplay(business.phone)}</a>.
              </p>
            ) : null}

            {mode === 'cancel' && b ? (
              <div className="manage__confirm">
                <p>
                  {b.cancelFee
                    ? `Because it’s within ${b.windowHours} hours, cancelling now charges a ${cents(b.cancelFee)} fee to ${b.card ?? 'your card on file'}, per our policy.`
                    : 'There’s no charge to cancel.'}
                </p>
                <div className="book__actions">
                  <button className="btn btn--honey" disabled={busy} onClick={cancel}>
                    {busy ? 'Cancelling…' : b.cancelFee ? `Cancel and pay ${cents(b.cancelFee)}` : 'Yes, cancel it'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => setMode('view')}>
                    Keep my appointment
                  </button>
                </div>
              </div>
            ) : null}

            {mode === 'move' && b ? <MovePicker b={b} onMoved={(nb) => (setB(nb), setMode('view'))} /> : null}

            {b.status === 'cancelled' ? (
              <a className="btn btn--honey" href="/book/">
                Book another time
              </a>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function MovePicker({ b, onMoved }: { b: Booking; onMoved: (b: Booking) => void }) {
  const [days, setDays] = useState<{ day: string; open: number }[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ start: string }[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ day: string; open: number }[]>(`/public/days?service=${b.serviceId}&staff=${b.staffId}`).then((d) => {
      setDays(d);
      setDay(d.find((x) => x.open)?.day ?? null);
    });
  }, [b.serviceId, b.staffId]);
  useEffect(() => {
    if (day) api<{ start: string }[]>(`/public/availability?service=${b.serviceId}&staff=${b.staffId}&day=${day}`).then(setSlots);
  }, [day, b.serviceId, b.staffId]);
  return (
    <div className="book__step">
      <h2>Pick a new time with {b.staff}</h2>
      <div className="days">
        {days?.map((d) => (
          <button key={d.day} className={`day ${day === d.day ? 'is-on' : ''}`} disabled={!d.open} onClick={() => setDay(d.day)}>
            <small>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</small>
            <strong>{new Date(`${d.day}T12:00:00Z`).getUTCDate()}</strong>
          </button>
        ))}
      </div>
      <div className="slots">
        {slots?.map((s) => (
          <button
            key={s.start}
            className="slot"
            onClick={() =>
              api<Booking>(`/public/booking/${b.token}/reschedule`, { start: s.start }).then(onMoved, (e) => setError(e.message))
            }
          >
            {timeOf(s.start)}
          </button>
        ))}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
