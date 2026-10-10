import { SERVICE_PAGES, servicePath } from '../content/services';
import { business } from '../data';
import { useBookLink } from '../lib/booking';

/** bookBar: the floating Book button on phones; off on pages that are already booking. */
export function Footer({ bookBar = true }: { bookBar?: boolean }) {
  const book = useBookLink();
  const [title, ...policy] = business.cancellationPolicy.split(/\n+/);
  return (
    <footer className={`footer ${bookBar ? 'footer--bar' : ''}`}>
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
        <p className="footer__fine">
          © {new Date().getFullYear()} {business.name} · {business.address}
        </p>
      </div>
      {bookBar ? (
        <a className="mobile-book btn btn--honey" {...book()}>
          Book now
        </a>
      ) : null}
    </footer>
  );
}
