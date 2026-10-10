import { useRef } from 'react';
import { business, hourLabel, phoneDisplay } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { useBookLink } from '../lib/booking';

const DAY_NAMES: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

/** Current weekday and fractional hour in Richmond, regardless of the visitor's timezone. */
function richmondNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: get('weekday').toLowerCase(), hour: Number(get('hour')) + Number(get('minute')) / 60 };
}

export function Visit() {
  const book = useBookLink();
  const root = useRef<HTMLElement>(null);
  const now = richmondNow();
  const today = business.hours.find((h) => h.day === now.day);
  const isOpen = !!today && today.open !== null && today.close !== null && now.hour >= today.open && now.hour < today.close;
  const mapQuery = encodeURIComponent(`The Wax Room, ${business.address}`);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.team__member', {
          y: 40,
          opacity: 0,
          scale: 0.9,
          stagger: 0.08,
          duration: 0.9,
          ease: 'back.out(1.6)',
          scrollTrigger: { trigger: '.team', start: 'top 85%' },
        });
        gsap.from('.visit__map', {
          clipPath: 'circle(0% at 50% 50%)',
          duration: 1.4,
          ease: 'expo.inOut',
          scrollTrigger: { trigger: '.visit__map', start: 'top 80%' },
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="visit" id="visit" ref={root}>
      <div className="container">
        <div className="team">
          <p className="eyebrow">Your waxers & estheticians</p>
          <ul className="team__list">
            {business.team.map((m) => (
              <li className="team__member" key={m.name}>
                {m.avatar ? (
                  <img src={m.avatar} alt="" loading="lazy" width={96} height={96} />
                ) : (
                  <span className="team__mono" aria-hidden="true">{m.name[0]}</span>
                )}
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="visit__grid">
          <div className="visit__info">
            <h2 className="display">
              Come <em>see us.</em>
            </h2>
            <a className="visit__addr" href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} target="_blank" rel="noopener">
              {business.address}
            </a>
            <p className="visit__contact">
              <a href={`tel:${business.phone}`}>{phoneDisplay(business.phone)}</a>
              <a href={`mailto:${business.email}`}>{business.email}</a>
            </p>
            <p className={`open-pill ${isOpen ? 'open-pill--open' : ''}`}>
              <i aria-hidden="true" />
              {isOpen && today?.close != null ? `Open now · until ${hourLabel(today.close)}` : 'Closed right now · book online anytime'}
            </p>
            <table className="hours">
              <tbody>
                {business.hours.map((h) => (
                  <tr key={h.day} className={h.day === now.day ? 'is-today' : ''}>
                    <th scope="row">{DAY_NAMES[h.day]}</th>
                    <td>{h.open === null || h.close === null ? 'Closed' : `${hourLabel(h.open)} – ${hourLabel(h.close)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="visit__ctas">
              <a className="btn btn--honey" {...book()}>
                Book now
              </a>
              {business.instagram ? (
                <a className="link-arrow" href={business.instagram} target="_blank" rel="noopener">
                  Instagram
                </a>
              ) : null}
              {business.facebook ? (
                <a className="link-arrow" href={business.facebook} target="_blank" rel="noopener">
                  Facebook
                </a>
              ) : null}
            </div>
          </div>
          <div className="visit__map">
            <iframe
              title="Map to The Wax Room"
              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
