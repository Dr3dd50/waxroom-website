import { useState } from 'react';
import { CLIENTS, REFERRALS, REFERRAL_PROGRAM, clientById, money } from '../data';
import { PageHead, Pill, Stat, Toggle } from '../ui';

const STATUS = {
  invited: { label: 'Link opened', tone: 'neutral' as const },
  booked: { label: 'Booked', tone: 'honey' as const },
  completed: { label: 'Visited · both credited', tone: 'green' as const },
};

export function ReferralsView() {
  const [on, setOn] = useState(true);
  const [friend, setFriend] = useState(REFERRAL_PROGRAM.friendGets / 100);
  const [referrer, setReferrer] = useState(REFERRAL_PROGRAM.referrerGets / 100);
  const done = REFERRALS.filter((r) => r.status === 'completed');
  const top = Object.entries(
    REFERRALS.reduce<Record<string, number>>((m, r) => ((m[r.referrerId] = (m[r.referrerId] ?? 0) + 1), m), {}),
  ).sort((a, b) => b[1] - a[1]);
  const sample = CLIENTS[3];

  return (
    <div className="page">
      <PageHead title="Referrals" sub="Every client gets a personal link. When a friend books through it, both of them get credit.">
        <span className="inline-toggle">
          Program {on ? 'on' : 'off'} <Toggle on={on} onChange={setOn} label="Referral program on" />
        </span>
      </PageHead>

      <div className="stats">
        <Stat label="Referred friends" value={REFERRALS.length} note="all time" />
        <Stat label="Visited" value={done.length} note={`${Math.round((100 * done.length) / Math.max(1, REFERRALS.length))}% of referrals`} />
        <Stat label="Credit given" value={money(done.length * (REFERRAL_PROGRAM.friendGets + REFERRAL_PROGRAM.referrerGets))} note="friends + referrers" />
        <Stat label="New-client revenue" value={money(done.length * 6500)} note="first visits" />
      </div>

      <div className="two two--wide">
        <section className="card-panel">
          <h2>How it works</h2>
          <ol className="how">
            <li>
              <strong>Client shares their link</strong>
              <span>
                It’s on every receipt text and in their booking confirmation, e.g. <code>waxroomrichmond.com/r/{sample.referralCode}</code>
              </span>
            </li>
            <li>
              <strong>Friend books through it</strong>
              <span>The friend gets {money(friend * 100)} off their first visit, applied automatically at checkout.</span>
            </li>
            <li>
              <strong>Friend’s first visit is paid</strong>
              <span>The referrer gets {money(referrer * 100)} credit on their account and a text saying so. Credit applies to their next checkout.</span>
            </li>
          </ol>
          <div className="two">
            <label className="field">
              Friend gets
              <span className="money-input">
                $<input type="number" value={friend} onChange={(e) => setFriend(+e.target.value)} />
              </span>
            </label>
            <label className="field">
              Referrer gets
              <span className="money-input">
                $<input type="number" value={referrer} onChange={(e) => setReferrer(+e.target.value)} />
              </span>
            </label>
          </div>
          <p className="muted small">
            Credit is held as a Stripe customer balance, so it’s used up automatically at checkout. First visits only; a friend who’s been here before doesn’t
            qualify.
          </p>
        </section>

        <section className="card-panel">
          <h2>Top referrers</h2>
          <ul className="mini-list">
            {top.slice(0, 6).map(([id, n]) => (
              <li key={id}>
                <span>{n}×</span>
                <strong>{clientById(id).name}</strong>
                <small>{money(clientById(id).credit)} earned</small>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card-panel">
        <h2>Recent referrals</h2>
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
            {REFERRALS.map((r) => (
              <tr key={r.friendId}>
                <td>
                  <strong>{clientById(r.friendId).name}</strong>
                </td>
                <td>{clientById(r.referrerId).name}</td>
                <td>{r.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td>
                  <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
