import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { dateShort, money, nice, phone, useBoot } from '../ctx';
import type { Appointment, Client } from '../types';
import { Icon, PageHead, Pill } from '../ui';
import { NewClientForm } from './Calendar';

type Detail = {
  client: Client;
  appointments: Appointment[];
  referrals: { id: string; referrerId: string; friendId: string; status: string; referrerName?: string; friendName?: string }[];
  membershipLeft: Record<string, number>;
  spent: number | null;
};

export function ClientsView() {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [list, setList] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'members' | 'marketing' | 'credit' | 'nocard'>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => setList(await api<Client[]>('/clients')), []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (list ?? [])
    .filter((c) => !q || `${c.first} ${c.last}`.toLowerCase().includes(q.toLowerCase().trim()) || (q.replace(/\D/g, '').length >= 3 && c.phone.includes(q.replace(/\D/g, ''))))
    .filter((c) => filter === 'all' || (filter === 'members' && c.membership?.status === 'active') || (filter === 'marketing' && c.smsMarketing) || (filter === 'credit' && c.credit > 0) || (filter === 'nocard' && !c.card));
  const current = selId ?? shown[0]?.id ?? null;

  return (
    <div className="page">
      <PageHead title="Clients" sub={list ? `${list.length} ${owner ? 'clients' : 'of your clients'}` : 'Loading…'}>
        <div className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" aria-label="Search clients" />
        </div>
        <button className="btn btn--dark" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add client
        </button>
      </PageHead>
      <div className="staff-tabs">
        {(
          [
            ['all', 'All'],
            ['members', 'Members'],
            ['marketing', 'Offers opted in'],
            ['credit', 'Has credit'],
            ['nocard', 'No card on file'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {adding ? (
        <section className="card-panel">
          <h2>New client</h2>
          <NewClientForm
            onCancel={() => setAdding(false)}
            onSaved={async (c) => {
              await load();
              setSelId(c.id);
              setAdding(false);
            }}
          />
        </section>
      ) : null}
      <div className="split">
        <ul className="list">
          {shown.slice(0, 300).map((c) => (
            <li key={c.id}>
              <button className={current === c.id ? 'is-on' : ''} onClick={() => setSelId(c.id)}>
                <span className="avatar avatar--sm avatar--soft">{c.first[0]}</span>
                <span className="list__main">
                  <strong>
                    {c.first} {c.last}
                  </strong>
                  <small>{phone(c.phone)}</small>
                </span>
                {c.membership?.status === 'active' ? <Pill tone="green">Member</Pill> : null}
              </button>
            </li>
          ))}
        </ul>
        {current ? <ClientCard id={current} onChanged={load} key={current} /> : <p className="empty">{list ? 'No clients match.' : 'Loading…'}</p>}
      </div>
    </div>
  );
}

function ClientCard({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const [cardMode, setCardMode] = useState(false);
  const load = useCallback(async () => {
    const r = await api<Detail>(`/clients/${id}`);
    setD(r);
    setNotes(r.client.notes);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <p className="empty">Loading…</p>;
  const c = d.client;
  const now = new Date().toISOString();
  const upcoming = d.appointments.filter((a) => a.start > now && !['cancelled', 'no-show'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start));
  const past = d.appointments.filter((a) => a.start <= now).sort((a, b) => b.start.localeCompare(a.start));
  const svc = (sid: string) => nice(boot.services.find((s) => s.id === sid)?.name ?? 'Service');
  const who = (sid: string) => boot.staff.find((s) => s.id === sid)?.short ?? '';
  const membership = c.membership?.status === 'active' ? boot.memberships.find((m) => m.id === c.membership!.membershipId) : null;

  async function save(body: Partial<Client>) {
    setError('');
    try {
      await api(`/clients/${id}`, body, 'PATCH');
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <article className="card-panel">
      <header className="client-head">
        <span className="avatar avatar--lg avatar--soft">{c.first[0]}</span>
        <div>
          <h2>
            {c.first} {c.last}
          </h2>
          <p className="muted">
            {c.contactHidden ? 'Phone and email: owner only' : phone(c.phone)}
            {c.email ? ` · ${c.email}` : ''}
          </p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="stats stats--3">
        <div className="stat">
          <span className="stat__label">Visits</span>
          <strong className="stat__value">{past.filter((a) => a.status === 'completed').length}</strong>
        </div>
        {owner ? (
          <div className="stat">
            <span className="stat__label">Spent</span>
            <strong className="stat__value">{money(d.spent ?? 0)}</strong>
          </div>
        ) : null}
        <div className="stat">
          <span className="stat__label">Client since</span>
          <strong className="stat__value">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</strong>
        </div>
      </div>

      <label className="field">
        Notes (staff only)
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== c.notes && save({ notes })} placeholder="Preferences, sensitivities, skincare…" />
      </label>

      <section className="box">
        <h3>Upcoming</h3>
        {upcoming.length ? (
          <ul className="mini-list">
            {upcoming.map((a) => (
              <li key={a.id}>
                <span>{dateShort(a.start)}</span>
                <strong>{svc(a.serviceId)}</strong>
                <small>with {who(a.staffId)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing booked.</p>
        )}
      </section>

      <section className="box">
        <h3>History</h3>
        <ul className="mini-list">
          {past.slice(0, 8).map((a) => (
            <li key={a.id}>
              <span>{new Date(a.start).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: '2-digit' })}</span>
              <strong>{svc(a.serviceId)}</strong>
              <small>{a.status === 'completed' ? `${money(a.checkout?.total ?? a.price)} · ${who(a.staffId)}` : a.status === 'no-show' ? 'No-show' : a.status === 'cancelled' ? 'Cancelled' : who(a.staffId)}</small>
            </li>
          ))}
          {!past.length ? <li className="muted small">No visits yet.</li> : null}
        </ul>
      </section>

      <div className="two">
        <section className="box">
          <h3>Card, membership & credit</h3>
          <dl className="kv">
            <dt>Card on file</dt>
            <dd>{c.card ?? 'None'}</dd>
            <dt>Membership</dt>
            <dd>{membership ? membership.name : 'None'}</dd>
            {membership
              ? membership.includes.map((i) => (
                  <Left key={i.serviceId} label={svc(i.serviceId)} left={d.membershipLeft[i.serviceId] ?? 0} of={i.quantity} />
                ))
              : null}
            <dt>Account credit</dt>
            <dd>{money(c.credit)}</dd>
            {(c.perks ?? []).map((p) => (
              <Fragment key={p.id}>
                <dt>Thank-you</dt>
                <dd>
                  {p.label}
                  {p.expiresAt ? ` until ${new Date(p.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''} (taken off at checkout)
                </dd>
              </Fragment>
            ))}
          </dl>
          <div className="row-actions">
            <button className="chip" onClick={() => setCardMode(!cardMode)}>
              {c.card ? 'Replace card' : 'Add card'}
            </button>
            {owner ? <MembershipPicker client={c} onDone={load} /> : null}
          </div>
          {cardMode ? <CardLink client={c} onClose={() => setCardMode(false)} /> : null}
        </section>
        <section className="box">
          <h3>Referrals</h3>
          <p className="small">
            Their link: <code>waxroomrichmond.com/r/{c.referralCode}</code>
          </p>
          {d.referrals
            .filter((r) => r.friendId === c.id)
            .map((r) => (
              <p className="small" key={r.id}>
                Referred by {r.referrerName}
              </p>
            ))}
          {d.referrals.filter((r) => r.referrerId === c.id).length ? (
            <ul className="mini-list">
              {d.referrals
                .filter((r) => r.referrerId === c.id)
                .map((r) => (
                  <li key={r.id}>
                    <span>Friend</span>
                    <strong>{r.friendName}</strong>
                    <small>{r.status === 'completed' ? 'visited · credited' : r.status}</small>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted small">No referrals yet.</p>
          )}
        </section>
      </div>

      <section className="box">
        <h3>Texts</h3>
        <dl className="kv kv--settings">
          <dt>Appointment texts</dt>
          <dd>
            {c.smsReminders ? (
              <>
                <Pill tone="green">On</Pill> <span className="muted small">{consentNote(c)}</span>{' '}
                <button className="chip" onClick={() => save({ smsReminders: false })} title="When the client asks to stop">
                  Client asked to stop
                </button>
              </>
            ) : (
              <>
                <Pill tone="red">Off</Pill> <span className="muted small">{optOutNote(c)}</span>{' '}
                {c.smsOptOut?.source === 'reply' ? (
                  <span className="muted small">They can reply START to turn them back on.</span>
                ) : (
                  <button className="chip" onClick={() => save({ smsReminders: true })} title="Only when the client asks">
                    Client asked to turn on
                  </button>
                )}
              </>
            )}
          </dd>
          <dt>Offers & news</dt>
          <dd>
            {c.smsMarketing ? (
              <button className="chip" onClick={() => save({ smsMarketing: false })}>
                Opted in · turn off
              </button>
            ) : (
              <button className="chip" onClick={() => save({ smsMarketing: true })} title="Only with the client’s permission">
                Not opted in · client agreed
              </button>
            )}
          </dd>
        </dl>
        {c.smsReminders ? (
          <form
            className="row-actions"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/clients/${id}/text`, { body: text });
                setSent(`Sent${boot.live.texts ? '' : ' (saved to the outbox: Twilio isn’t connected yet)'}.`);
                setText('');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <input className="grow" value={text} onChange={(e) => (setText(e.target.value), setSent(''))} placeholder={`Text ${c.first}…`} aria-label={`Text ${c.first}`} />
            <button className="btn btn--dark" disabled={!text.trim()}>
              Send
            </button>
          </form>
        ) : null}
        {sent ? <p className="muted small">{sent}</p> : null}
      </section>
    </article>
  );
}

const Left = ({ label, left, of }: { label: string; left: number; of: number }) => (
  <>
    <dt>· {label}</dt>
    <dd>
      {left} of {of} left this month
    </dd>
  </>
);

/**
 * A card for a client who booked by phone or walked in: text them a link to Stripe's
 * secure card form on our site. Nobody at the studio types or sees a card number.
 * Their card shows here once they've saved it (reopen the client to see it).
 */
function CardLink({ client, onClose }: { client: Client; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; texted: boolean; queued?: boolean; reason?: string; error?: string } | null>(null);
  const [error, setError] = useState('');
  return (
    <div className="new-client">
      {!result ? (
        <>
          <p className="small">
            {client.first} gets a text with a link to add {client.card ? 'a new' : 'a'} card securely through Stripe. It works for 7 days, and the card shows here once they’ve
            saved it.
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="row-actions">
            <button
              className="btn btn--dark"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  setResult(await api(`/clients/${client.id}/card-link`, {}));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Text {client.first} a card link
            </button>
            <button className="btn btn--ghost" onClick={onClose}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">
            {result.texted
              ? result.queued
                ? `It’s quiet hours, so the link goes to ${client.first} when they end.`
                : `Sent. ${client.first} can add their card from the link in the text.`
              : (result.reason ?? `The text didn’t go through${result.error ? ` (${result.error})` : ''}. Share the link another way.`)}
          </p>
          <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} aria-label="Card link" />
          <button className="chip" onClick={onClose}>
            Done
          </button>
        </>
      )}
    </div>
  );
}

function MembershipPicker({ client, onDone }: { client: Client; onDone: () => Promise<void> }) {
  const boot = useBoot();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const active = client.membership?.status === 'active';
  if (!open)
    return (
      <button className="chip" onClick={() => setOpen(true)}>
        {active ? 'Change membership' : 'Start membership'}
      </button>
    );
  return (
    <div className="new-client">
      <select
        defaultValue=""
        onChange={async (e) => {
          setError('');
          try {
            await api(`/clients/${client.id}/membership`, { membershipId: e.target.value === 'cancel' ? null : e.target.value });
            setOpen(false);
            await onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <option value="" disabled>
          Choose…
        </option>
        {boot.memberships
          .filter((m) => m.active)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {money(m.price)}/mo
            </option>
          ))}
        {active ? <option value="cancel">Cancel membership</option> : null}
      </select>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
const CONSENT: Record<string, string> = { online: 'agreed when booking online', desk: 'agreed in person', glossgenius: 'carried over from GlossGenius', 'text-reply': 'replied START' };
const OPT_OUT: Record<string, string> = { reply: 'replied STOP', 'web-form': 'opted out on the website', desk: 'asked the studio to stop', glossgenius: 'opted out in GlossGenius' };
/** How and when the client agreed to appointment texts, for the record. */
function consentNote(c: Client) {
  const k = c.smsConsent;
  return k ? `${CONSENT[k.source]}${k.by ? ` (${k.by})` : ''}, ${when(k.at)}` : '';
}
function optOutNote(c: Client) {
  const o = c.smsOptOut;
  return o ? `${OPT_OUT[o.source]}${o.by ? ` (${o.by})` : ''}, ${when(o.at)}` : 'opted out';
}
