import { useEffect, useState } from 'react';
import { api } from '../api';
import { money, useBoot } from '../ctx';
import { PageHead, Pill, Stat, Toggle } from '../ui';

type Ref = { id: string; referrerId: string; friendId: string; code: string; status: 'booked' | 'completed' | 'cancelled'; createdAt: string; referrerName?: string; friendName?: string; referrerCredit?: number };
const STATUS = {
  booked: { label: 'Booked', tone: 'honey' as const },
  completed: { label: 'Visited · both credited', tone: 'green' as const },
  cancelled: { label: 'Cancelled', tone: 'neutral' as const },
};

export function ReferralsView() {
  const boot = useBoot();
  const [list, setList] = useState<Ref[] | null>(null);
  const r = boot.settings.referrals;
  const [friend, setFriend] = useState(r.friendGets / 100);
  const [referrer, setReferrer] = useState(r.referrerGets / 100);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    api<Ref[]>('/referrals').then(setList);
  }, []);
  const save = async (patch: Partial<typeof r>) => {
    await api('/settings', { referrals: patch }, 'PUT');
    await boot.reload();
    setSaved('Saved.');
  };
  const done = (list ?? []).filter((x) => x.status === 'completed');
  const top = Object.values(
    (list ?? []).reduce<Record<string, { name: string; n: number; credit: number }>>((m, x) => {
      m[x.referrerId] ??= { name: x.referrerName ?? '', n: 0, credit: x.referrerCredit ?? 0 };
      m[x.referrerId].n++;
      return m;
    }, {}),
  ).sort((a, b) => b.n - a.n);

  return (
    <div className="page">
      <PageHead title="Referrals" sub="Every client gets a personal link. When a friend books through it, both of them get credit.">
        <span className="inline-toggle">
          Program {r.enabled ? 'on' : 'off'} <Toggle on={r.enabled} onChange={(v) => save({ enabled: v })} label="Referral program on" />
        </span>
      </PageHead>
      <div className="stats">
        <Stat label="Referred friends" value={list?.length ?? '…'} note="all time" />
        <Stat label="Visited" value={done.length} note={list?.length ? `${Math.round((100 * done.length) / list.length)}% of referrals` : ''} />
        <Stat label="Credit given" value={money(done.length * (r.friendGets + r.referrerGets))} note="friends + referrers" />
        <Stat label="Waiting on a visit" value={(list ?? []).filter((x) => x.status === 'booked').length} />
      </div>
      <div className="two two--wide">
        <section className="card-panel">
          <h2>How it works</h2>
          <ol className="how">
            <li>
              <strong>Clients share their link</strong>
              <span>It’s in every receipt text, e.g. waxroomrichmond.com/r/KEISHA10.</span>
            </li>
            <li>
              <strong>The friend books through it</strong>
              <span>They get {money(r.friendGets)} off their first visit, taken off at checkout.</span>
            </li>
            <li>
              <strong>The friend’s first visit is paid</strong>
              <span>The referrer gets {money(r.referrerGets)} account credit and a text. It comes off their next checkout.</span>
            </li>
          </ol>
          <form
            className="two"
            onSubmit={(e) => {
              e.preventDefault();
              save({ friendGets: Math.round(friend * 100), referrerGets: Math.round(referrer * 100) });
            }}
          >
            <label className="field">
              Friend gets ($)
              <input type="number" min="0" value={friend} onChange={(e) => (setFriend(+e.target.value), setSaved(''))} />
            </label>
            <label className="field">
              Referrer gets ($)
              <input type="number" min="0" value={referrer} onChange={(e) => (setReferrer(+e.target.value), setSaved(''))} />
            </label>
            <button className="btn btn--dark">Save amounts</button>
            {saved ? <p className="muted small">{saved}</p> : null}
          </form>
          <p className="muted small">First visits only: someone who’s been here before doesn’t get the friend discount, and nobody can use their own link.</p>
        </section>
        <section className="card-panel">
          <h2>Top referrers</h2>
          <ul className="mini-list">
            {top.slice(0, 8).map((t) => (
              <li key={t.name}>
                <span>{t.n}×</span>
                <strong>{t.name}</strong>
                <small>{money(t.credit)} credit</small>
              </li>
            ))}
            {list && !top.length ? <li className="muted small">No referrals yet.</li> : null}
          </ul>
        </section>
      </div>
      <section className="card-panel">
        <h2>All referrals</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Friend</th>
                <th>Referred by</th>
                <th>When</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.friendName}</strong>
                  </td>
                  <td>{x.referrerName}</td>
                  <td>{new Date(x.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td>
                    <Pill tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
