import { useState } from 'react';
import { STAFF, type Staff } from '../data';

/** Sign-in. In the real system this is Cognito (email + password, then a code by text). */
export function Login({ onSignIn }: { onSignIn: (s: Staff) => void }) {
  const [email, setEmail] = useState('');
  return (
    <div className="login">
      <form
        className="login__card"
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn(STAFF[0]);
        }}
      >
        <img src="logo.png" alt="The Wax Room" className="login__logo" />
        <h1>
          Staff <em>sign in</em>
        </h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@waxroomrichmond.com" />
        </label>
        <label>
          Password
          <input type="password" placeholder="••••••••" />
        </label>
        <button className="btn btn--honey" type="submit">
          Sign in
        </button>
        <p className="login__note">We’ll text a 6-digit code to your phone to finish signing in.</p>
        <div className="login__demo">
          <span>Prototype: sign in as</span>
          {STAFF.map((s) => (
            <button type="button" key={s.id} onClick={() => onSignIn(s)}>
              {s.short} <small>{s.role}</small>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
