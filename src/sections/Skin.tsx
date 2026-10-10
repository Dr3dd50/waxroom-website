import { useRef } from 'react';
import { CodeVideo } from '../components/CodeVideo';
import { business, findService, money, duration, reviews } from '../data';
import { gsap, useGSAP } from '../lib/motion';
import { useBookLink } from '../lib/booking';

const STATEMENT =
  'Jet Plasma tightens skin, softens fine lines and fades scars and hyperpigmentation. No numbing. No downtime. Just you, brighter.';

const FEATURED = ['Jet Plasma Facial', 'Biorepeel', 'Jet Plasma Eye Treatment', 'Vajacial', 'Jet Plasma Body Treatment'];

export function Skin() {
  const book = useBookLink();
  const root = useRef<HTMLElement>(null);
  const services = FEATURED.map(findService).filter((s) => !!s);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Words light up one by one as the statement scrolls through.
        gsap.fromTo(
          '.statement .w',
          { opacity: 0.14 },
          {
            opacity: 1,
            stagger: 0.1,
            ease: 'none',
            scrollTrigger: { trigger: '.statement', start: 'top 80%', end: 'bottom 35%', scrub: true },
          },
        );
        // Before/after photo wipes open from the bottom.
        gsap.fromTo(
          '.skin__photo',
          { clipPath: 'inset(100% 0% 0% 0% round 28px)' },
          {
            clipPath: 'inset(0% 0% 0% 0% round 28px)',
            ease: 'power2.out',
            scrollTrigger: { trigger: '.skin__grid', start: 'top 80%', end: 'top 25%', scrub: true },
          },
        );
        gsap.from('.treat', {
          y: 40,
          opacity: 0,
          stagger: 0.1,
          duration: 0.9,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.treats', start: 'top 80%' },
        });
        // Count-up stats.
        gsap.utils.toArray<HTMLElement>('.stat__n').forEach((el) => {
          const to = Number(el.dataset.to);
          const decimals = Number(el.dataset.decimals || 0);
          const obj = { v: 0 };
          gsap.to(obj, {
            v: to,
            duration: 1.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 90%' },
            onUpdate: () => (el.textContent = obj.v.toFixed(decimals)),
          });
        });
      });
    },
    { scope: root },
  );

  const totalServices = business.categories.reduce((n, c) => n + c.services.length, 0);
  const openDays = business.hours.filter((h) => h.open !== null).length;

  return (
    <section className="skin" id="skin" ref={root}>
      <div className="container">
        <p className="eyebrow eyebrow--light">Advanced skin</p>
        <p className="statement">
          {STATEMENT.split(' ').map((w, i) => (
            <span className="w" key={i}>
              {w}{' '}
            </span>
          ))}
        </p>

        <div className="skin__grid">
          <div>
            <figure className="skin__photo">
              <CodeVideo slug="skin-treatments" label="Doodle animation: Jet Plasma smoothing fine lines" />
            </figure>
            <a className="btn btn--ghost btn--light skin__gallery" href="/gallery/#skin-treatments">
              See real results in the gallery
            </a>
          </div>
          <ul className="treats">
            {services.map((s) => (
              <li className="treat" key={s.name}>
                <div>
                  <h3>{s.name.replace('Biorepeel', 'BioRePeel')}</h3>
                  <p>{s.description.split(/(?<=\.)\s/)[0]}</p>
                </div>
                <div className="treat__price">
                  <b>{money(s.price)}</b>
                  <span>{duration(s.duration)}</span>
                </div>
              </li>
            ))}
            <li className="treats__ctas">
              <a className="btn btn--honey" {...book({ group: 'skin' })}>
                Book a skin treatment
              </a>
              <a className="link-arrow" href="/services/skin-treatments/">
                Learn about Jet Plasma
              </a>
            </li>
          </ul>
        </div>

        <dl className="stats">
          <div className="stat">
            <dt>Google rating</dt>
            <dd>
              <span className="stat__n" data-to={reviews.rating} data-decimals="1">
                {reviews.rating}
              </span>
              <small>★</small>
            </dd>
          </div>
          <div className="stat">
            <dt>Google reviews</dt>
            <dd>
              <span className="stat__n" data-to={reviews.count}>
                {reviews.count}
              </span>
            </dd>
          </div>
          <div className="stat">
            <dt>Services on the menu</dt>
            <dd>
              <span className="stat__n" data-to={totalServices}>
                {totalServices}
              </span>
            </dd>
          </div>
          <div className="stat">
            <dt>Days a week</dt>
            <dd>
              <span className="stat__n" data-to={openDays}>
                {openDays}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
