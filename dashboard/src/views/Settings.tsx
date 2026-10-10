import { STAFF, catalog } from '../data';
import { PageHead, Pill, Toggle } from '../ui';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const hr = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
const p = catalog.policies;

export function SettingsView() {
  const hours = catalog.business.hours as Record<string, { start: number; end: number; working: boolean }>;
  return (
    <div className="page">
      <PageHead title="Settings" sub="Carried over from GlossGenius. Changes here update the website and online booking." />
      <div className="two two--wide">
        <section className="card-panel">
          <h2>Business hours</h2>
          <table className="table table--compact">
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td>{d[0].toUpperCase() + d.slice(1)}</td>
                  <td>{hours[d].working ? `${hr(hours[d].start)} – ${hr(hours[d].end)}` : 'Closed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="mt">Team</h2>
          <ul className="mini-list">
            {STAFF.map((s) => (
              <li key={s.id}>
                <span>
                  <i className="dot" style={{ background: s.color }} />
                </span>
                <strong>{s.name}</strong>
                <small>
                  {s.role === 'owner' ? 'Owner' : 'Esthetician'} ·{' '}
                  {s.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                </small>
              </li>
            ))}
          </ul>
          <button className="chip mt">Invite a team member</button>
        </section>

        <section className="card-panel">
          <h2>Booking rules</h2>
          <dl className="kv kv--settings">
            <dt>Card required to book</dt>
            <dd>
              <Toggle on={p.cardRequired === 'always_require'} onChange={() => {}} label="Card required" />
            </dd>
            <dt>Late cancellation</dt>
            <dd>
              {p.cancellationFeePercent}% within {p.cancellationWindowHours} h
            </dd>
            <dt>No-show</dt>
            <dd>100% of the service</dd>
            <dt>Clients can cancel online</dt>
            <dd>
              <Toggle on={p.allowOnlineCancellations} onChange={() => {}} label="Online cancellations" />
            </dd>
            <dt>Future bookings per client</dt>
            <dd>Up to {p.futureBookingsLimit}</dd>
            <dt>Default tip</dt>
            <dd>{p.defaultGratuityPercent}%</dd>
            <dt>Waitlist</dt>
            <dd>
              <Toggle on={p.waitlist} onChange={() => {}} label="Waitlist" />
            </dd>
            <dt>Pay later (Klarna/Afterpay via Stripe)</dt>
            <dd>
              <Toggle on={p.buyNowPayLater} onChange={() => {}} label="Pay later" />
            </dd>
            <dt>Intake form before first visit</dt>
            <dd>
              <Toggle on={p.requireIntakeForm} onChange={() => {}} label="Intake form" />
            </dd>
            <dt>Gift cards</dt>
            <dd>
              <Pill tone="red">Off in GlossGenius: decide</Pill>
            </dd>
          </dl>
          <h2 className="mt">Connections</h2>
          <ul className="mini-list">
            <li>
              <span />
              <strong>Stripe</strong>
              <small>Payments, deposits, memberships, payouts</small>
            </li>
            <li>
              <span />
              <strong>Twilio</strong>
              <small>Appointment texts and offers from (804) number</small>
            </li>
            <li>
              <span />
              <strong>Google Business Profile</strong>
              <small>Review link in receipt texts</small>
            </li>
          </ul>
        </section>
      </div>
      <section className="card-panel">
        <h2>Cancellation & no-show policy</h2>
        <p className="policy">{p.cancellationPolicy}</p>
      </section>
    </div>
  );
}
