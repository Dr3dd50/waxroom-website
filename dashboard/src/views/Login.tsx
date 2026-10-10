import { useState } from 'react';
import { api } from '../api';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const demo = location.hostname !== 'staff.waxroomrichmond.com';
  return (
    <div className="login">
      <form
        className="login__card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/login', { email, password });
            onSignedIn();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <img src="logo.png" alt="The Wax Room" className="login__logo" />
        <h1>
          Staff <em>sign in</em>
        </h1>
        <label>
          Email
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn--honey" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {demo ? (
          <div className="login__demo">
            <span>Local demo accounts (password waxroom-demo):</span>
            {[
              ['Danielle (owner)', 'waxroomrichmond@gmail.com'],
              ['Nyeesha', 'nyeesha@demo.local'],
              ['Chicago', 'chicago@demo.local'],
            ].map(([label, em]) => (
              <button type="button" key={em} onClick={() => (setEmail(em), setPassword('waxroom-demo'))}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}
