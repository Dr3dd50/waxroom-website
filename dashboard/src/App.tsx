import { useState } from 'react';
import { STAFF, type Staff } from './data';
import { CalendarView } from './views/Calendar';
import { ClientsView } from './views/Clients';
import { CatalogView } from './views/Catalog';
import { ReferralsView } from './views/Referrals';
import { TextsView } from './views/Texts';
import { PaymentsView } from './views/Payments';
import { SettingsView } from './views/Settings';
import { Login } from './views/Login';
import { Icon, type IconName } from './ui';

export type Me = Staff;
type View = 'calendar' | 'clients' | 'catalog' | 'referrals' | 'texts' | 'payments' | 'settings';

const NAV: { view: View; label: string; icon: IconName; ownerOnly?: boolean }[] = [
  { view: 'calendar', label: 'Calendar', icon: 'calendar' },
  { view: 'clients', label: 'Clients', icon: 'users' },
  { view: 'catalog', label: 'Services', icon: 'tag', ownerOnly: true },
  { view: 'referrals', label: 'Referrals', icon: 'gift', ownerOnly: true },
  { view: 'texts', label: 'Texts', icon: 'chat', ownerOnly: true },
  { view: 'payments', label: 'Payments', icon: 'card', ownerOnly: true },
  { view: 'settings', label: 'Settings', icon: 'gear', ownerOnly: true },
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<View>('calendar');

  if (!me) return <Login onSignIn={(s) => (setMe(s), setView('calendar'))} />;
  const owner = me.role === 'owner';
  const nav = NAV.filter((n) => owner || !n.ownerOnly);

  return (
    <div className="shell">
      <aside className="side">
        <div className="side__brand">
          <img src="logo.png" alt="" />
          <div>
            <strong>The Wax Room</strong>
            <span>Staff</span>
          </div>
        </div>
        <nav className="side__nav">
          {nav.map((n) => (
            <button key={n.view} className={view === n.view ? 'is-on' : ''} onClick={() => setView(n.view)}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side__me">
          <span className="avatar" style={{ background: me.color }}>
            {me.short[0]}
          </span>
          <div>
            <strong>{me.short}</strong>
            <span>{owner ? 'Owner' : 'Esthetician'}</span>
          </div>
          <button className="ghost-btn" onClick={() => setMe(null)} title="Sign out">
            <Icon name="out" />
          </button>
        </div>
        <label className="side__demo">
          <span>Prototype with sample clients and appointments. Preview as</span>
          <select value={me.id} onChange={(e) => setMe(STAFF.find((s) => s.id === e.target.value)!)}>
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short} ({s.role})
              </option>
            ))}
          </select>
        </label>
      </aside>
      <main className="main">
        {view === 'calendar' ? <CalendarView me={me} key={me.id} /> : null}
        {view === 'clients' ? <ClientsView me={me} key={me.id} /> : null}
        {view === 'catalog' && owner ? <CatalogView /> : null}
        {view === 'referrals' && owner ? <ReferralsView /> : null}
        {view === 'texts' && owner ? <TextsView /> : null}
        {view === 'payments' && owner ? <PaymentsView /> : null}
        {view === 'settings' && owner ? <SettingsView /> : null}
      </main>
    </div>
  );
}
