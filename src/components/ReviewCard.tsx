import { reviews, type Review } from '../data';

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Stars filled to the exact rating (e.g. 4.7 fills 94%). */
export function RatingStars({ rating, className = '' }: { rating: number; className?: string }) {
  return (
    <span className={`rating-stars ${className}`} role="img" aria-label={`${rating} out of 5 stars`}>
      <span className="rating-stars__base">★★★★★</span>
      <span className="rating-stars__fill" style={{ width: `${(rating / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

/** The Business Profile's live rating, linking to the Google listing. */
export function GoogleRating({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`g-rating ${compact ? 'g-rating--compact' : ''}`} href={reviews.profileUrl} target="_blank" rel="noopener">
      <GoogleG size={compact ? 20 : 30} />
      <span className="g-rating__score">{reviews.rating.toFixed(1)}</span>
      <span className="g-rating__meta">
        <RatingStars rating={reviews.rating} />
        <span>
          {reviews.count} reviews <span className="g-rating__src">· Google Business Profile</span>
        </span>
      </span>
    </a>
  );
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function ago(iso: string) {
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days > -7) return rtf.format(days, 'day');
  if (days > -60) return rtf.format(Math.round(days / 7), 'week');
  if (days > -365) return rtf.format(Math.round(days / 30), 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

export function ReviewCard({ r, highlight }: { r: Review; highlight?: RegExp }) {
  // Mark the words that matched this page's service, e.g. "lash" on the lash page.
  let text: React.ReactNode = r.text;
  if (highlight) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const m of r.text.matchAll(new RegExp(highlight.source, 'gi'))) {
      parts.push(r.text.slice(last, m.index), <mark key={m.index}>{m[0]}</mark>);
      last = m.index + m[0].length;
    }
    parts.push(r.text.slice(last));
    text = parts;
  }
  return (
    <figure className="review">
      <div className="review__top">
        <span className="stars" aria-label="5 out of 5 stars">★★★★★</span>
        <GoogleG />
      </div>
      <blockquote>“{text}”</blockquote>
      <figcaption>
        <span className="review__avatar" aria-hidden="true">
          {r.name[0]}
        </span>
        <span>
          <b>{r.name}</b>
          <small>Google review · {ago(r.date)}</small>
        </span>
      </figcaption>
    </figure>
  );
}
