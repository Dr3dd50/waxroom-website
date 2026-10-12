// A New Client Ritual card: what you get, who it's for, the value and the price.
import { bookLink } from '../lib/booking';
import type { Ritual } from '../lib/rituals';

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function RitualCard({ r, className = '', ...rest }: { r: Ritual; className?: string } & React.HTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={`card card--ritual ${className}`} {...bookLink({ service: r.name })} {...rest}>
      <span className="card__tag">New client ritual</span>
      <h3>{r.name}</h3>
      {/* a non-breaking hyphen keeps "V-steam" on one line */}
      <p>{r.includes.replace(/V-steam/g, 'V\u2011steam')}.</p>
      <p className="card__fine">
        For your first {r.label}. A {dollars(r.value)} value ({r.arithmetic}). {dollars(r.deposit)} deposit to book.
      </p>
      <p className="card__price">
        {dollars(r.price)}
        <s>{dollars(r.value)}</s>
      </p>
    </a>
  );
}
