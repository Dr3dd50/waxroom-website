import { SERVICE_PAGES, servicePath } from '../content/services';
import { business } from '../data';
import { useBookLink } from '../lib/booking';
import { privacyState, setOptOut } from '../lib/tracking';

export function Footer() {
  const book = useBookLink();
  const [title, ...policy] = business.cancellationPolicy.split(/\n+/);
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <img src="/logo.png" alt="The Wax Room" width={212} height={180} className="footer__logo" />
        <div className="footer__cta">
          <p className="display">
            Ready when <em>you are.</em>
          </p>
          <a className="btn btn--honey" {...book()}>
            Book your appointment
          </a>
        </div>
        <nav className="footer__links" aria-label="Services">
          {SERVICE_PAGES.map((p) => (
            <a key={p.slug} href={servicePath(p)}>
              {p.name}
            </a>
          ))}
        </nav>
        <details className="footer__policy">
          <summary>{title}</summary>
          {policy.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </details>
        <PrivacyChoices />
        <a className="footer__optout" href="/text-opt-out/">
          Text message opt-out
        </a>
        <p className="footer__fine">
          © {new Date().getFullYear()} {business.name} · {business.address}
        </p>
      </div>
    </footer>
  );
}

/** Opt out of tracking (Meta pixel, its server copy, and PostHog) in this browser. Hidden until one is set up. */
function PrivacyChoices() {
  const state = privacyState();
  if (state === 'not-set-up') return null;
  return (
    <details className="footer__policy">
      <summary>Your privacy choices</summary>
      <p>We use Meta's pixel to see which of our ads bring people in, and PostHog to see how the site is used. We never sell your information.</p>
      {state === 'browser-signal' ? (
        <p>Your browser sends a Global Privacy Control signal, so we don't track this browser.</p>
      ) : state === 'opted-out' ? (
        <p>
          You've opted out on this browser.{' '}
          <button type="button" className="linkish" onClick={() => setOptOut(false)}>
            Turn tracking back on
          </button>
        </p>
      ) : (
        <p>
          <button type="button" className="linkish" onClick={() => setOptOut(true)}>
            Opt out of tracking on this browser
          </button>
        </p>
      )}
    </details>
  );
}
