import { useState } from 'react';
import { CLIENTS, catalog } from '../data';
import { PageHead, Pill, Stat, Toggle } from '../ui';

const n = catalog.notifications;
const unit = (o: { unit: string; value: number }) => `${o.value} ${o.value === 1 ? o.unit.replace(/s$/, '') : o.unit}`;

// Automatic appointment texts. Timings are the ones set in GlossGenius today.
const AUTOMATIONS = [
  {
    key: 'booked',
    name: 'Booking confirmation',
    when: 'Right after booking',
    text: 'Hi {first}! You’re booked for {service} with {staff} on {date} at {time}. Reply C to confirm. Need to change it? {manage_link}',
  },
  {
    key: 'confirm',
    name: 'Confirmation request',
    when: `${unit(n.confirmationBefore[0])} before`,
    text: 'Hi {first}, see you {day} at {time} for {service}. Reply C to confirm or R to reschedule. Cancellations within 24 hours are charged 50%.',
  },
  {
    key: 'reminder',
    name: 'Reminder',
    when: `${unit(n.reminderBefore[0])} before`,
    text: 'Reminder: {service} tomorrow at {time} at The Wax Room, 11162 Hull Street Rd N. {prep_tip}',
  },
  {
    key: 'receipt',
    name: 'Receipt + referral link',
    when: 'After checkout',
    text: 'Thanks {first}! Receipt: {receipt_link}. Share your link and you both get $10: {referral_link}',
  },
  {
    key: 'rebook',
    name: 'Rebooking nudge',
    when: `${unit(n.rebookingAfter[0])} after a visit, if nothing’s booked`,
    text: 'Hi {first}, it’s been about 6 weeks since your {service}. Ready to book your next one? {booking_link}',
  },
  {
    key: 'waitlist',
    name: 'Waitlist opening',
    when: 'When a slot opens',
    text: 'A spot just opened: {service} {day} at {time}. Want it? Reply YES and it’s yours.',
  },
  {
    key: 'referral',
    name: 'Referral credit earned',
    when: 'When a referred friend visits',
    text: '{friend} just had their first visit. $10 credit is on your account for next time. Thank you!',
  },
  {
    key: 'birthday',
    name: 'Birthday',
    when: 'On their birthday',
    text: 'Happy birthday, {first}! From all of us at The Wax Room.',
  },
];

const AUDIENCES = [
  { key: 'all', label: 'Everyone opted in', count: (c: (typeof CLIENTS)[number]) => c.smsMarketing },
  { key: 'members', label: 'Members', count: (c: (typeof CLIENTS)[number]) => c.smsMarketing && !!c.membership },
  { key: 'lapsed', label: 'Not seen in 8+ weeks', count: (c: (typeof CLIENTS)[number]) => c.smsMarketing && c.visits % 3 === 0 },
  { key: 'brazilian', label: 'Brazilian clients', count: (c: (typeof CLIENTS)[number]) => c.smsMarketing && c.visits % 2 === 0 },
];

export function TextsView() {
  const [tab, setTab] = useState<'auto' | 'campaigns'>('auto');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(AUTOMATIONS.map((a) => [a.key, true])));
  const [sel, setSel] = useState(AUTOMATIONS[0].key);
  const [aud, setAud] = useState('all');
  const [msg, setMsg] = useState('Fall into smooth 🍂 Book a Brazilian this week and get a free 15-min lip or brow add-on. {booking_link}');
  const auto = AUTOMATIONS.find((a) => a.key === sel)!;
  const reach = CLIENTS.filter(AUDIENCES.find((a) => a.key === aud)!.count).length;
  const optedIn = CLIENTS.filter((c) => c.smsMarketing).length;
  const preview = (t: string) =>
    t
      .replace('{first}', 'Keisha')
      .replace('{service}', 'Brazilian')
      .replace('{staff}', 'Danielle')
      .replace('{date}', 'Thu, Oct 15')
      .replace('{day}', 'Thursday')
      .replace('{time}', '2:30 PM')
      .replace('{friend}', 'Amara')
      .replace('{prep_tip}', 'Let hair grow to about ¼ inch and skip lotion on the area.')
      .replace(/\{\w+_link\}/g, 'wxrm.co/b4k2');

  return (
    <div className="page">
      <PageHead title="Texts" sub="Appointment texts go to every client who books. Offers only go to clients who opted in.">
        <Pill tone="green">Twilio connected · business number verified</Pill>
      </PageHead>
      <div className="staff-tabs">
        <button className={tab === 'auto' ? 'is-on' : ''} onClick={() => setTab('auto')}>
          Appointment texts
        </button>
        <button className={tab === 'campaigns' ? 'is-on' : ''} onClick={() => setTab('campaigns')}>
          Offers & news
        </button>
      </div>

      {tab === 'auto' ? (
        <div className="split split--texts">
          <ul className="list">
            {AUTOMATIONS.map((a) => (
              <li key={a.key}>
                <div className={`list__row ${sel === a.key ? 'is-on' : ''}`}>
                  <button className="list__main" onClick={() => setSel(a.key)}>
                    <strong>{a.name}</strong>
                    <small>{a.when}</small>
                  </button>
                  <Toggle on={enabled[a.key]} onChange={(v) => setEnabled({ ...enabled, [a.key]: v })} label={`${a.name} on`} />
                </div>
              </li>
            ))}
          </ul>
          <section className="card-panel">
            <h2>{auto.name}</h2>
            <p className="muted">{auto.when}</p>
            <label className="field">
              Message
              <textarea rows={4} defaultValue={auto.text} key={auto.key} />
            </label>
            <p className="muted small">
              Placeholders in braces fill in for each client; {'{prep_tip}'} uses the service’s “before your visit” notes. Replies of C, R, YES and STOP are handled automatically.
            </p>
            <Phone text={preview(auto.text)} />
          </section>
        </div>
      ) : (
        <div className="two two--wide">
          <section className="card-panel">
            <h2>New text campaign</h2>
            <div className="field">
              Send to
              <div className="slots">
                {AUDIENCES.map((a) => (
                  <button key={a.key} className={aud === a.key ? 'is-on' : ''} onClick={() => setAud(a.key)}>
                    {a.label} · {CLIENTS.filter(a.count).length}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              Message
              <textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
            </label>
            <p className="muted small">
              {msg.length + 26} characters · “Reply STOP to opt out” is added automatically · about {money2(reach * 0.0083)} to send
            </p>
            <div className="row-actions">
              <button className="btn btn--ghost">Schedule</button>
              <button className="btn btn--honey">Send to {reach} clients</button>
            </div>
          </section>
          <section className="card-panel">
            <div className="stats stats--2">
              <Stat label="Opted in to offers" value={`${optedIn} / ${CLIENTS.length}`} note="asked at booking, never pre-checked" />
              <Stat label="Last campaign" value="38%" note="booked within 7 days" />
            </div>
            <Phone text={`${preview(msg)}\nReply STOP to opt out`} />
          </section>
        </div>
      )}
    </div>
  );
}

const money2 = (d: number) => `$${d.toFixed(2)}`;

function Phone({ text }: { text: string }) {
  return (
    <div className="phone">
      <div className="phone__top">The Wax Room</div>
      <div className="bubble">{text}</div>
    </div>
  );
}
