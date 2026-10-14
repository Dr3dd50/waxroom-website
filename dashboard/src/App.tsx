import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { BootCtx } from './ctx';
import type { Boot } from './types';
import { CalendarView } from './views/Calendar';
import { ClientsView } from './views/Clients';
import { CatalogView } from './views/Catalog';
import { ReferralsView } from './views/Referrals';
import { TextsView } from './views/Texts';
import { PaymentsView } from './views/Payments';
import { SettingsView } from './views/Settings';
import { Login } from './views/Login';
import { AvailabilityView } from './views/Availability';
import { Icon, type IconName } from './ui';

type View = 'calendar' | 'availability' | 'clients' | 'catalog' | 'referrals' | 'texts' | 'payments' | 'settings';

const NAV: { view: View; label: string; icon: IconName; ownerOnly?: boolean }[] = [
  { view: 'calendar', label: 'Calendar', icon: 'calendar' },
  { view: 'availability', label: 'Availability', icon: 'clock' },
  { view: 'clients', label: 'Clients', icon: 'users' },
  { view: 'catalog', label: 'Services', icon: 'tag', ownerOnly: true },
  { view: 'referrals', label: 'Referrals', icon: 'gift', ownerOnly: true },
  { view: 'texts', label: 'Texts', icon: 'chat', ownerOnly: true },
  { view: 'payments', label: 'Payments', icon: 'card', ownerOnly: true },
  { view: 'settings', label: 'Settings', icon: 'gear', ownerOnly: true },
];

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready'>('loading');
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'calendar');

  const load = useCallback(async () => {
    try {
      setBoot(await api<Boot>('/bootstrap'));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState('signed-out');
      else throw e;
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    history.replaceState(null, '', `#${view}`);
  }, [view]);

  if (state === 'loading') return <div className="boot">Loading…</div>;
  if (state === 'signed-out' || !boot) return <Login onSignedIn={load} />;

  const owner = boot.me.role === 'owner';
  const nav = NAV.filter((n) => owner || !n.ownerOnly);
  const current = nav.some((n) => n.view === view) ? view : 'calendar';

  return (
    <BootCtx.Provider value={{ ...boot, reload: load }}>
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
              <button key={n.view} className={current === n.view ? 'is-on' : ''} onClick={() => setView(n.view)}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="side__me">
            <span className="avatar" style={{ background: boot.me.color }}>
              {boot.me.short[0]}
            </span>
            <div>
              <strong>{boot.me.short}</strong>
              <span>{owner ? 'Owner' : 'Esthetician'}</span>
            </div>
            <button
              className="ghost-btn"
              onClick={async () => {
                await api('/logout', {});
                setBoot(null);
                setState('signed-out');
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="out" />
            </button>
          </div>
          <ModeNote boot={boot} />
        </aside>
        <main className="main">
          {/* phones: the sidebar becomes the bottom menu, so who's signed in, sign-out and the notice sit up top */}
          <div className="mobile-top">
            <span>
              {boot.me.short} · {owner ? 'Owner' : 'Esthetician'}
            </span>
            <button
              className="chip"
              onClick={async () => {
                await api('/logout', {});
                setBoot(null);
                setState('signed-out');
              }}
            >
              Sign out
            </button>
            <ModeNote boot={boot} />
          </div>
          {current === 'calendar' ? <CalendarView /> : null}
          {current === 'availability' ? <AvailabilityView /> : null}
          {current === 'clients' ? <ClientsView /> : null}
          {current === 'catalog' ? <CatalogView /> : null}
          {current === 'referrals' ? <ReferralsView /> : null}
          {current === 'texts' ? <TextsView /> : null}
          {current === 'payments' ? <PaymentsView /> : null}
          {current === 'settings' ? <SettingsView /> : null}
        </main>
      </div>
    </BootCtx.Provider>
  );
}

/** Why booking, payments or texts aren't fully on yet. */
function ModeNote({ boot }: { boot: Boot }) {
  if (!boot.settings.switchover.done)
    return <p className="side__mode">GlossGenius is still the booking system. Booking, payments and texts here start when the owner switches over in Settings.</p>;
  if (boot.live.payments && boot.live.texts) return null;
  return (
    <p className="side__mode">
      {!boot.live.payments ? 'Payments are simulated until Stripe is connected. ' : ''}
      {!boot.live.texts ? 'Texts are saved, not sent, until Twilio is connected.' : ''}
    </p>
  );
}
