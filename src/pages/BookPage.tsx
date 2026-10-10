// Online booking: service → who → when → details → card → booked.
import { useEffect, useMemo, useState } from 'react';
import { CardForm, type CardSetup } from '../components/CardForm';
import { api, cents, dateOf, minutes, timeOf, TZ } from '../lib/api';
import { business } from '../data';

type Svc = { id: string; name: string; category: string; price: number; priceVaries: boolean; duration: number; deposit: number | null; depositNewClientsOnly: boolean; description: string | null; staffIds: string[] };
type Catalog = { staff: { id: string; short: string; color: string }[]; services: Svc[] };
type Config = { payments: 'stripe' | 'simulated'; texts: 'twilio' | 'simulated'; stripePublishableKey: string | null; referrals: { enabled: boolean; friendGets: number }; policies: { cancellationPolicy: string; cancellationWindowHours: number; cancellationFeePercent: number } };
type Slot = { start: string; staffIds: string[] };
type Booked = { token: string; start: string; service: string; staff: string; price: number; deposit: number; referralDiscount: number; card: string | null; first: string };

const CATEGORY_LABEL: Record<string, string> = {
  'Intimate Waxing': 'Brazilian & intimate waxing',
  'Body and Facial Waxing': 'Body & facial waxing',
  'Brow Art': 'Brows',
  'Lash Art': 'Lashes',
  'Skin Therapy': 'Skin & Jet Plasma',
  'Yoni Steam': 'Yoni steam',
  'Hair Restoration': 'Hair restoration',
  'Bio scans': 'Bio scan',
};

export function readReferral(): { code: string; from: string; amount: number } | null {
  try {
    return JSON.parse(localStorage.getItem('wr_referral') ?? 'null');
  } catch {
    return null;
  }
}

export function BookPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState('');
  const [service, setService] = useState<Svc | null>(null);
  const [staffId, setStaffId] = useState<string | null | undefined>(undefined); // undefined = not chosen, null = anyone
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [details, setDetails] = useState<{ clientId: string; setup: CardSetup } | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const referral = useMemo(() => (typeof window === 'undefined' ? null : readReferral()), []);

  useEffect(() => {
    Promise.all([api<Catalog>('/public/catalog'), api<Config>('/public/config')])
      .then(([cat, cfg]) => {
        setCatalog(cat);
        setConfig(cfg);
        const wanted = new URLSearchParams(location.search).get('service')?.toLowerCase();
        const pre = wanted && cat.services.find((s) => s.name.toLowerCase() === wanted);
        if (pre) pickService(pre, cat);
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickService(s: Svc, cat = catalog!) {
    setService(s);
    setSlot(null);
    setDay(null);
    setDetails(null);
    const people = cat.staff.filter((x) => s.staffIds.includes(x.id));
    setStaffId(people.length === 1 ? people[0].id : undefined);
  }

  const step = booked ? 'done' : !service ? 'service' : staffId === undefined ? 'who' : !slot ? 'when' : !details ? 'details' : 'card';
  const people = catalog && service ? catalog.staff.filter((x) => service.staffIds.includes(x.id)) : [];
  const deposit = service?.deposit ?? 0;

  return (
    <section className="book">
      <div className="container book__grid">
        <div className="book__main">
          <p className="eyebrow">Book online</p>
          <h1 className="display book__title">
            {step === 'done' ? (
              <>
                You’re <em>booked.</em>
              </>
            ) : (
              <>
                Book your <em>visit.</em>
              </>
            )}
          </h1>
          {referral && step !== 'done' ? (
            <p className="book__ref">
              {referral.from} sent you {cents(referral.amount)} off your first visit. It comes off automatically when you check out.
            </p>
          ) : null}
          {loadError ? <p className="form-error">{loadError}</p> : null}
          {!catalog && !loadError ? <p className="muted">Loading the menu…</p> : null}

          {catalog && step === 'service' ? <ServicePicker catalog={catalog} onPick={(s) => pickService(s)} /> : null}

          {step === 'who' && service ? (
            <div className="book__step">
              <h2>Who would you like?</h2>
              <div className="choice-grid">
                <button className="choice" onClick={() => setStaffId(null)}>
                  <strong>Anyone available</strong>
                  <span>Shows the most open times</span>
                </button>
                {people.map((p) => (
                  <button key={p.id} className="choice" onClick={() => setStaffId(p.id)}>
                    <span className="choice__avatar" style={{ background: p.color }}>
                      {p.short[0]}
                    </span>
                    <strong>{p.short}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 'when' && service ? <WhenPicker service={service} staffId={staffId ?? null} day={day} setDay={setDay} onPick={setSlot} /> : null}

          {step === 'details' && service && slot && config ? (
            <DetailsForm
              onDone={(d) => setDetails(d)}
              path="/public/bookings/start"
              policy={config.policies}
              cta="Continue to card"
            />
          ) : null}

          {step === 'card' && service && slot && details && config ? (
            <div className="book__step">
              <h2>Card to hold your booking</h2>
              <p className="muted">
                {deposit
                  ? `${service.depositNewClientsOnly ? 'New clients pay' : 'This service takes'} a ${cents(deposit)} deposit when booking; it comes off your total. Everything else is paid at your visit.`
                  : 'Nothing is charged now. You pay at your visit.'}{' '}
                Late cancellations (within {config.policies.cancellationWindowHours} hours) are charged {config.policies.cancellationFeePercent}% and no-shows in full.
              </p>
              <CardForm
                setup={details.setup}
                publishableKey={config.stripePublishableKey}
                submitLabel="Book appointment"
                onSaved={async (extra) => {
                  const r = await api<Booked>('/public/bookings/confirm', {
                    clientId: details.clientId,
                    setupId: details.setup.setupId,
                    serviceId: service.id,
                    staffId,
                    start: slot.start,
                    referralCode: referral?.code,
                    ...extra,
                  });
                  try {
                    localStorage.removeItem('wr_referral');
                  } catch {
                    /* private mode */
                  }
                  setBooked(r);
                }}
              />
            </div>
          ) : null}

          {step === 'done' && booked ? (
            <div className="book__step book__done">
              <p>
                Thanks, {booked.first}! <strong>{booked.service}</strong> with {booked.staff}, {dateOf(booked.start)} at {timeOf(booked.start)}.
              </p>
              {booked.deposit ? <p className="muted">Your {cents(booked.deposit)} deposit is paid and comes off your total.</p> : null}
              <p className="muted">
                A confirmation is on its way by text with a link to change or cancel. We’ll remind you the day before.
                {config?.texts === 'simulated' ? ' (Texting isn’t switched on yet, so this one is saved instead of sent.)' : ''}
              </p>
              <div className="book__actions">
                <a className="btn btn--dark" href={`/booking/?t=${booked.token}`}>
                  View or change booking
                </a>
                <a className="btn btn--ghost" href="/">
                  Back to the site
                </a>
              </div>
              <p className="book__where">
                {business.address}
                <br />
                Parking is right out front.
              </p>
            </div>
          ) : null}
        </div>

        <aside className="book__summary">
          <h2>Your appointment</h2>
          <dl>
            <dt>Service</dt>
            <dd>
              {service ? (
                <>
                  {service.name}
                  <small>
                    {minutes(service.duration)} · {cents(service.price)}
                    {service.priceVaries ? '+' : ''}
                  </small>
                  {step !== 'done' ? (
                    <button className="linkish" onClick={() => (setService(null), setStaffId(undefined), setSlot(null), setDetails(null))}>
                      Change
                    </button>
                  ) : null}
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt>With</dt>
            <dd>
              {staffId === undefined ? '—' : staffId === null ? 'Anyone available' : catalog?.staff.find((s) => s.id === staffId)?.short}
              {staffId !== undefined && people.length > 1 && step !== 'done' ? (
                <button className="linkish" onClick={() => (setStaffId(undefined), setSlot(null), setDetails(null))}>
                  Change
                </button>
              ) : null}
            </dd>
            <dt>When</dt>
            <dd>
              {slot ? (
                <>
                  {dateOf(slot.start)}
                  <small>{timeOf(slot.start)}</small>
                  {step !== 'done' ? (
                    <button className="linkish" onClick={() => (setSlot(null), setDetails(null))}>
                      Change
                    </button>
                  ) : null}
                </>
              ) : (
                '—'
              )}
            </dd>
            {referral && service ? (
              <>
                <dt>Referral</dt>
                <dd>−{cents(Math.min(referral.amount, service.price))} at checkout</dd>
              </>
            ) : null}
          </dl>
          <p className="book__tz">Times are Eastern ({TZ.split('/')[1].replace('_', ' ')}).</p>
        </aside>
      </div>
    </section>
  );
}

function ServicePicker({ catalog, onPick }: { catalog: Catalog; onPick: (s: Svc) => void }) {
  // menu order: waxing first, the same order as the rest of the site
  const order = Object.keys(CATEGORY_LABEL);
  const cats = [...new Set(catalog.services.map((s) => s.category))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const [open, setOpen] = useState(cats[0]);
  return (
    <div className="book__step">
      <h2>What are you booking?</h2>
      <div className="svc-acc">
        {cats.map((cat) => (
          <section key={cat} className={`svc-acc__group ${open === cat ? 'is-open' : ''}`}>
            <button className="svc-acc__head" onClick={() => setOpen(open === cat ? '' : cat)} aria-expanded={open === cat}>
              <span>{CATEGORY_LABEL[cat] ?? cat}</span>
              <small>{catalog.services.filter((s) => s.category === cat).length}</small>
            </button>
            {open === cat ? (
              <ul>
                {catalog.services
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <li key={s.id}>
                      <button className="svc-row" onClick={() => onPick(s)}>
                        <span className="svc-row__name">{s.name}</span>
                        <span className="svc-row__meta">
                          {minutes(s.duration)} · {cents(s.price)}
                          {s.priceVaries ? '+' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function WhenPicker({ service, staffId, day, setDay, onPick }: { service: Svc; staffId: string | null; day: string | null; setDay: (d: string) => void; onPick: (s: Slot) => void }) {
  const [days, setDays] = useState<{ day: string; open: number }[] | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  useEffect(() => {
    setDays(null);
    api<{ day: string; open: number }[]>(`/public/days?service=${service.id}${staffId ? `&staff=${staffId}` : ''}${from ? `&from=${from}` : ''}`).then((d) => {
      setDays(d);
      if (!day || !d.some((x) => x.day === day)) {
        const first = d.find((x) => x.open);
        if (first) setDay(first.day);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, staffId, from]);
  useEffect(() => {
    if (!day) return;
    setSlots(null);
    api<Slot[]>(`/public/availability?service=${service.id}&day=${day}${staffId ? `&staff=${staffId}` : ''}`).then(setSlots);
  }, [service.id, staffId, day]);

  const label = (d: string) => new Date(`${d}T12:00:00Z`);
  const hour = (iso: string) => Number(new Date(iso).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));
  const groups = slots
    ? ([
        ['Morning', slots.filter((s) => hour(s.start) < 12)],
        ['Afternoon', slots.filter((s) => hour(s.start) >= 12 && hour(s.start) < 17)],
        ['Evening', slots.filter((s) => hour(s.start) >= 17)],
      ] as const)
    : [];
  return (
    <div className="book__step">
      <h2>Pick a day and time</h2>
      <div className="days">
        {days
          ? days.map((d) => (
              <button key={d.day} className={`day ${day === d.day ? 'is-on' : ''}`} disabled={!d.open} onClick={() => setDay(d.day)}>
                <small>{label(d.day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</small>
                <strong>{label(d.day).getUTCDate()}</strong>
                <small>{label(d.day).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small>
              </button>
            ))
          : Array.from({ length: 14 }, (_, i) => <span key={i} className="day day--ghost" />)}
      </div>
      {days ? (
        <button className="linkish" onClick={() => setFrom(new Date(Date.parse(`${days[days.length - 1].day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10))}>
          Later dates →
        </button>
      ) : null}
      {day ? (
        slots === null ? (
          <p className="muted">Finding open times…</p>
        ) : slots.length ? (
          groups.map(([name, list]) =>
            list.length ? (
              <div key={name} className="slot-group">
                <h3>{name}</h3>
                <div className="slots">
                  {list.map((s) => (
                    <button key={s.start} className="slot" onClick={() => onPick(s)}>
                      {timeOf(s.start)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )
        ) : (
          <p className="muted">Nothing open that day. Try another.</p>
        )
      ) : null}
    </div>
  );
}

export function DetailsForm({
  path,
  onDone,
  policy,
  cta,
}: {
  path: string;
  onDone: (d: { clientId: string; setup: CardSetup }) => void;
  policy?: { cancellationPolicy: string };
  cta: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const r = await api<{ clientId: string } & CardSetup>(path, {
        client: {
          first: f.get('first'),
          last: f.get('last'),
          phone: f.get('phone'),
          email: f.get('email'),
          smsReminders: f.get('reminders') === 'on',
          smsMarketing: f.get('marketing') === 'on',
        },
      });
      onDone({ clientId: r.clientId, setup: { simulated: r.simulated, setupId: r.setupId, clientSecret: r.clientSecret } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="book__step details" onSubmit={submit}>
      <h2>Your details</h2>
      <div className="field-row">
        <label className="field">
          First name
          <input name="first" required autoComplete="given-name" />
        </label>
        <label className="field">
          Last name
          <input name="last" required autoComplete="family-name" />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Mobile
          <input name="phone" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(804) 555-0123" />
        </label>
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="email" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="reminders" defaultChecked /> Text me my booking confirmation and reminders.
      </label>
      <label className="check">
        <input type="checkbox" name="marketing" /> Text me offers and news from The Wax Room (optional). Up to 4 a month. Reply STOP anytime.
      </label>
      {policy ? (
        <label className="check">
          <input type="checkbox" required /> I agree to the{' '}
          <button type="button" className="linkish" onClick={() => setShowPolicy(!showPolicy)}>
            cancellation and no-show policy
          </button>
          .
        </label>
      ) : null}
      {showPolicy && policy ? <p className="policy-text">{policy.cancellationPolicy}</p> : null}
      <p className="fine">Message and data rates may apply. Reply HELP for help, STOP to opt out.</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn btn--honey btn--wide" disabled={busy}>
        {busy ? 'One moment…' : cta}
      </button>
    </form>
  );
}
