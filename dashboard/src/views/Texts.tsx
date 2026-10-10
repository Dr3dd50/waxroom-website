import { useEffect, useState } from 'react';
import { api } from '../api';
import { CATEGORY_ORDER, phone, useBoot } from '../ctx';
import { PageHead, Pill, Toggle } from '../ui';

const AUTOMATIONS: { key: string; name: string; when: (n: ReturnType<typeof useBoot>['settings']['notifications']) => string }[] = [
  { key: 'booking', name: 'Booking confirmation', when: () => 'Right after booking or a time change' },
  { key: 'confirm-request', name: 'Confirmation request', when: (n) => `${n.confirmHoursBefore} hours before (if booked further ahead)` },
  { key: 'reminder', name: 'Reminder', when: (n) => `${n.reminderHoursBefore} hours before` },
  { key: 'receipt', name: 'Receipt + referral link', when: () => 'After checkout' },
  { key: 'rebook', name: 'Rebooking nudge', when: (n) => `${n.rebookAfterDays} days after a visit, if nothing’s booked` },
  { key: 'referral', name: 'Referral credit earned', when: () => 'When a referred friend’s first visit is paid' },
  { key: 'cancel', name: 'Cancellation', when: () => 'When an appointment is cancelled' },
  { key: 'birthday', name: 'Birthday', when: () => 'On their birthday, around 10am' },
];
const SAMPLE: Record<string, string> = {
  first: 'Keisha',
  service: 'Brazilian',
  staff: 'Danielle',
  date: 'Thu, Oct 15',
  day: 'Thursday',
  time: '2:30 PM',
  friend: 'Amara',
  amount: '$10',
  total: '$78',
  referral_amount: '$10',
  window: '24',
  fee: '50',
  fee_note: '',
  prep_tip: 'Let hair grow to about ¼ inch and skip lotion on the area.',
};
const preview = (t: string) => t.replace(/\{(\w+)\}/g, (m, k) => SAMPLE[k] ?? (k.endsWith('_link') ? 'waxroomrichmond.com/b/4k2' : m));

type Msg = { id: string; at: string; direction: 'out' | 'in'; to: string; from?: string; kind: string; body: string; status: string; clientName?: string; error?: string };

export function TextsView() {
  const boot = useBoot();
  const [tab, setTab] = useState<'auto' | 'campaign' | 'log'>('auto');
  const [sel, setSel] = useState(AUTOMATIONS[0].key);
  const auto = boot.settings.automations[sel] ?? { enabled: false, text: '' };
  const [draft, setDraft] = useState(auto.text);
  const [saved, setSaved] = useState('');
  useEffect(() => setDraft(auto.text), [auto.text, sel]);

  const saveAuto = async (key: string, patch: Partial<{ enabled: boolean; text: string }>) => {
    await api('/settings', { automations: { [key]: { ...boot.settings.automations[key], ...patch } } }, 'PUT');
    await boot.reload();
    setSaved('Saved.');
  };

  return (
    <div className="page">
      <PageHead title="Texts" sub="Appointment texts go to every client who books (unless they reply STOP). Offers only go to clients who opted in.">
        {boot.live.texts ? <Pill tone="green">Twilio connected</Pill> : <Pill tone="red">Twilio not connected: texts are saved, not sent</Pill>}
      </PageHead>
      <div className="staff-tabs">
        <button className={tab === 'auto' ? 'is-on' : ''} onClick={() => setTab('auto')}>
          Appointment texts
        </button>
        <button className={tab === 'campaign' ? 'is-on' : ''} onClick={() => setTab('campaign')}>
          Send an offer
        </button>
        <button className={tab === 'log' ? 'is-on' : ''} onClick={() => setTab('log')}>
          Sent & replies
        </button>
      </div>

      {tab === 'auto' ? (
        <div className="split split--texts">
          <ul className="list">
            {AUTOMATIONS.map((a) => (
              <li key={a.key}>
                <div className={`list__row ${sel === a.key ? 'is-on' : ''}`}>
                  <button className="list__main" onClick={() => (setSel(a.key), setSaved(''))}>
                    <strong>{a.name}</strong>
                    <small>{a.when(boot.settings.notifications)}</small>
                  </button>
                  <Toggle on={!!boot.settings.automations[a.key]?.enabled} onChange={(v) => saveAuto(a.key, { enabled: v })} label={`${a.name} on`} />
                </div>
              </li>
            ))}
          </ul>
          <section className="card-panel">
            <h2>{AUTOMATIONS.find((a) => a.key === sel)!.name}</h2>
            <label className="field">
              Message
              <textarea rows={4} value={draft} onChange={(e) => (setDraft(e.target.value), setSaved(''))} />
            </label>
            <p className="muted small">
              Words in braces fill in for each client: {'{first}'}, {'{service}'}, {'{staff}'}, {'{date}'}, {'{time}'}, {'{manage_link}'}, {'{prep_tip}'} and more. Replies of C (confirm), R (reschedule) and
              STOP are handled automatically.
            </p>
            <div className="row-actions">
              <button className="btn btn--dark" disabled={draft === auto.text} onClick={() => saveAuto(sel, { text: draft })}>
                Save message
              </button>
              {saved ? <span className="muted small">{saved}</span> : null}
            </div>
            <Phone text={preview(draft)} />
          </section>
        </div>
      ) : null}

      {tab === 'campaign' ? <Campaign /> : null}
      {tab === 'log' ? <Log /> : null}
    </div>
  );
}

function Campaign() {
  const boot = useBoot();
  const [aud, setAud] = useState('all');
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState('Hi {first}! Book a Brazilian this week and get a free lip or chin wax with it.');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState('');
  const audiences = [
    ['all', 'Everyone opted in'],
    ['members', 'Members'],
    ['lapsed', 'Not seen in 8+ weeks'],
    ...CATEGORY_ORDER.map((c) => [`category:${c}`, `${c} clients`]),
  ];
  useEffect(() => {
    setCount(null);
    api<{ count: number }>(`/campaigns/audience?key=${encodeURIComponent(aud)}`).then((r) => setCount(r.count));
  }, [aud]);
  return (
    <div className="two two--wide">
      <section className="card-panel">
        <h2>New offer text</h2>
        <div className="field">
          <span>Send to</span>
          <select value={aud} onChange={(e) => (setAud(e.target.value), setConfirm(false))}>
            {audiences.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <span className="muted small">{count === null ? 'Counting…' : `${count} clients who agreed to offers by text`}</span>
        </div>
        <label className="field">
          Message
          <textarea rows={4} value={msg} onChange={(e) => (setMsg(e.target.value), setConfirm(false))} />
        </label>
        <p className="muted small">{msg.length + 24} characters · “Reply STOP to opt out” is added automatically · send between 9am and 8pm.</p>
        {result ? <p className="note">{result}</p> : null}
        {confirm ? (
          <div className="row-actions">
            <button
              className="btn btn--honey"
              onClick={async () => {
                const r = await api<{ sent: number; of: number; simulated: boolean }>('/campaigns', { audience: aud, body: msg });
                setResult(`${r.simulated ? 'Saved' : 'Sent'} to ${r.sent} of ${r.of} clients${r.simulated ? ' (Twilio isn’t connected yet, so nothing went out)' : ''}.`);
                setConfirm(false);
              }}
            >
              Yes, send to {count}
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirm(false)}>
              Not yet
            </button>
          </div>
        ) : (
          <button className="btn btn--dark" disabled={!count || !msg.trim()} onClick={() => setConfirm(true)}>
            Send to {count ?? '…'} clients
          </button>
        )}
      </section>
      <section className="card-panel">
        <h2>Preview</h2>
        <Phone text={`${preview(msg)}\nReply STOP to opt out`} />
        {!boot.live.texts ? <p className="muted small">Offers can go out once Twilio’s business texting registration is approved.</p> : null}
      </section>
    </div>
  );
}

function Log() {
  const [list, setList] = useState<Msg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<Msg[]>('/messages').then(setList);
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="card-panel">
      <div className="row-actions row-actions--spread">
        <h2>Sent & replies</h2>
        <button
          className="chip"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await api('/run-texts', {});
            await load();
            setBusy(false);
          }}
        >
          Send due reminders now
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Client</th>
              <th>Type</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(list ?? []).map((m) => (
              <tr key={m.id} className={m.direction === 'in' ? 'is-in' : ''}>
                <td>{new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td>{m.clientName ?? phone(m.direction === 'in' ? m.from ?? '' : m.to)}</td>
                <td>{m.direction === 'in' ? 'Reply' : m.kind}</td>
                <td className="msg">{m.body}</td>
                <td>{m.status === 'simulated' ? <Pill>Saved</Pill> : m.status === 'failed' ? <Pill tone="red">Failed</Pill> : <Pill tone="green">{m.status === 'received' ? 'Received' : 'Sent'}</Pill>}</td>
              </tr>
            ))}
            {list && !list.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  No texts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Phone({ text }: { text: string }) {
  return (
    <div className="phone">
      <div className="phone__top">The Wax Room</div>
      <div className="bubble">{text}</div>
    </div>
  );
}
