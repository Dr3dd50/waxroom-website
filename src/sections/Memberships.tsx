import { useRef } from 'react';
import { business, money } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { NATIVE, membershipLink, packageLink } from '../lib/booking';

export function Memberships() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.card', {
          y: 80,
          rotate: (i) => (i % 2 ? 3 : -3),
          opacity: 0,
          stagger: 0.08,
          duration: 1,
          ease: 'expo.out',
          // Hand transform back to the CSS hover tilt once the entrance is done.
          clearProps: 'transform',
          scrollTrigger: { trigger: '.cards', start: 'top 80%' },
        });
      });
    },
    { scope: root },
  );

  // Pointer-follow tilt on hover.
  const tilt = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-y * 8}deg`);
    el.style.setProperty('--ry', `${x * 10}deg`);
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };
  const reset = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };

  return (
    <section className="members" id="memberships" ref={root}>
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Memberships & packages</p>
          <h2 className="display">
            Stay smooth. <em>Save every month.</em>
          </h2>
        </div>
        <div className="cards">
          {business.memberships.map((m) => (
            <a className="card" key={m.name} {...membershipLink(m.name, m.url)} onPointerMove={tilt} onPointerLeave={reset}>
              <span className="card__tag">Membership</span>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <p className="card__price">
                {money(m.price ?? 0)}
                <small>/{m.period}</small>
              </p>
            </a>
          ))}
          {business.packages.map((p) => {
            const value = p.items.reduce((n, i) => n + (i.value ?? 0) * i.quantity, 0);
            return (
              <a
                className="card card--pkg"
                key={p.name}
                {...packageLink(p.name)}
                onPointerMove={tilt}
                onPointerLeave={reset}
              >
                <span className="card__tag">Package</span>
                <h3>{p.name}</h3>
                <p>{p.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(' + ')}</p>
                <p className="card__price">
                  {money(p.price ?? 0)}
                  {value > (p.price ?? 0) ? <s>{money(value)}</s> : null}
                </p>
              </a>
            );
          })}
          {/* Gift cards are sold through GlossGenius; our own system doesn't sell them yet. */}
          {NATIVE ? null : (
          <a className="card card--gift" href={business.giftCardsUrl} target="_blank" rel="noopener" onPointerMove={tilt} onPointerLeave={reset}>
              <span className="card__tag">Gift cards</span>
              <h3>Give the gift of smooth.</h3>
              <p>Digital gift cards for any service, delivered instantly.</p>
              <p className="card__price">Shop gift cards</p>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
