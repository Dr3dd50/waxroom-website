import { useRef } from 'react';
import { reviews } from '../data';
import { GoogleRating, ReviewCard } from '../components/ReviewCard';
import { gsap, useGSAP } from '../lib/motion';

// Newest 5-star reviews that fit nicely on a card. The list itself is
// refreshed from Google by scripts/fetch-reviews.mjs.
const PICKS = reviews.reviews.filter((r) => r.text.length >= 60 && r.text.length <= 320).slice(0, 24);
const ROWS = [PICKS.filter((_, i) => i % 2 === 0), PICKS.filter((_, i) => i % 2 === 1)];

export function Reviews() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.reviews__score > *', {
          y: 50,
          opacity: 0,
          stagger: 0.1,
          duration: 1,
          ease: 'expo.out',
          scrollTrigger: { trigger: root.current, start: 'top 75%' },
        });
        gsap.from('.reviews__rows', {
          y: 80,
          opacity: 0,
          duration: 1.2,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.reviews__rows', start: 'top 90%' },
        });
      });
    },
    { scope: root },
  );

  return (
    <section className="reviews" id="reviews" ref={root}>
      <div className="container reviews__head">
        <div className="reviews__score">
          <p className="eyebrow">Real reviews from Google</p>
          <h2 className="display">
            Rated <em>{reviews.rating}</em> by our clients.
          </h2>
          <GoogleRating />
          <p className="muted">
            These are real reviews from our Google Business Profile, updated automatically as new 5-star reviews come in.
          </p>
          <div className="reviews__ctas">
            <a className="btn btn--dark" href={reviews.writeReviewUrl} target="_blank" rel="noopener">
              Leave us a review
            </a>
            <a className="link-arrow" href={reviews.profileUrl} target="_blank" rel="noopener">
              Read all {reviews.count} on Google
            </a>
          </div>
        </div>
      </div>
      <div className="reviews__rows">
        {ROWS.map((row, n) => (
          <div className={`reviews__row ${n ? 'reviews__row--rev' : ''}`} key={n}>
            <div className="reviews__track">
              {[...row, ...row].map((r, i) => (
                <div key={`${r.id}-${i}`} aria-hidden={i >= row.length}>
                  <ReviewCard r={r} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
