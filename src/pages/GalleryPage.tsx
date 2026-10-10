import { useEffect, useRef, useState } from 'react';
import galleryJson from '../data/gallery.json';
import { GoogleRating } from '../components/ReviewCard';
import { SERVICE_GROUPS } from '../content/services';
import { business, reviews } from '../data';
import { gsap, ScrollTrigger, useGSAP } from '../lib/motion';
import { Visit } from '../sections/Visit';

type Post = {
  id: string;
  type: 'image' | 'video' | 'carousel';
  group: string;
  caption: string;
  alt: string | null;
  date: string;
  image: string;
  width: number | null;
  height: number | null;
  url: string;
};
const gallery = galleryJson as { handle: string; profileUrl: string; posts: Post[] };

const LABELS: Record<string, string> = Object.fromEntries([...SERVICE_GROUPS.map((g) => [g.key, g.label]), ['studio', 'In the studio']]);
// Service pages link here as /gallery/#<page-slug>; map that to its group.
const GROUP_FOR_HASH: Record<string, string> = Object.fromEntries(
  SERVICE_GROUPS.flatMap((g) => [[g.key, g.key], ...g.pages.map((p) => [p, g.key])]),
);
const FILTERS = ['all', ...SERVICE_GROUPS.map((g) => g.key), 'studio'].filter(
  (k) => k === 'all' || gallery.posts.some((p) => p.group === k),
);

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V10.5H7.8v3h2.6V21h3.1z" />
    </svg>
  );
}

function Socials() {
  return (
    <div className="socials">
      <a className="social social--ig" href={gallery.profileUrl} target="_blank" rel="noopener">
        <InstagramIcon />
        <span>
          <b>@{gallery.handle}</b>
          <small>Follow on Instagram</small>
        </span>
      </a>
      {business.facebook ? (
        <a className="social" href={business.facebook} target="_blank" rel="noopener">
          <FacebookIcon />
          <span>
            <b>The Wax Room Richmond</b>
            <small>Like us on Facebook</small>
          </span>
        </a>
      ) : null}
      <GoogleRating />
    </div>
  );
}

export function GalleryPage() {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Post | null>(null);

  // Arriving from a service page (#brows, #skin-treatments…) pre-selects its group.
  useEffect(() => {
    const fromHash = () => {
      const key = GROUP_FOR_HASH[location.hash.slice(1)];
      if (key && FILTERS.includes(key)) setFilter(key);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const choose = (key: string) => {
    setFilter(key);
    history.replaceState(null, '', key === 'all' ? location.pathname : `#${key}`);
  };

  const posts = filter === 'all' ? gallery.posts : gallery.posts.filter((p) => p.group === filter);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.set('.gal-card', { y: 40, opacity: 0 });
      ScrollTrigger.batch('.gal-card', {
        start: 'top 92%',
        onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, stagger: 0.06, duration: 0.8, ease: 'expo.out', overwrite: true }),
      });
      ScrollTrigger.refresh();
    },
    { scope: root, dependencies: [filter], revertOnUpdate: true },
  );

  const show = (p: Post) => {
    setOpen(p);
    dialog.current?.showModal();
  };
  const close = () => {
    dialog.current?.close();
    setOpen(null);
  };

  return (
    <div ref={root}>
      <section className="hero hero--service gal-hero">
        <div className="hero__inner">
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="/">Home</a> <span aria-hidden="true">/</span> <span aria-current="page">Gallery</span>
          </nav>
          <p className="eyebrow">Real clients · real results</p>
          <h1 className="display gal-hero__title">
            The <em>gallery.</em>
          </h1>
          <p className="hero__intro">
            Before-and-afters, client moments and a peek inside the studio, straight from our Instagram. Tap any post to
            see it in full.
          </p>
          <Socials />
        </div>
      </section>

      <section className="gal">
        <div className="container">
          <div className="tabs gal__filters" role="tablist" aria-label="Filter by service">
            {FILTERS.map((k) => (
              <button key={k} role="tab" className="tab" aria-selected={filter === k} onClick={() => choose(k)}>
                {k === 'all' ? 'Everything' : LABELS[k]}
                <span className="tab__count">
                  {k === 'all' ? gallery.posts.length : gallery.posts.filter((p) => p.group === k).length}
                </span>
              </button>
            ))}
          </div>
          <div className="gal__grid">
            {posts.map((p) => (
              <button key={p.id} className="gal-card" onClick={() => show(p)} aria-label={`Open post: ${p.caption || LABELS[p.group]}`}>
                <span className="gal-card__media" style={{ aspectRatio: p.width && p.height ? `${p.width} / ${Math.min(p.height, p.width * 1.4)}` : '4 / 5' }}>
                  <img src={p.image} alt={p.alt ?? ''} loading="lazy" />
                  {p.type !== 'image' ? (
                    <span className="gal-card__badge" aria-hidden="true">
                      {p.type === 'video' ? '▶' : '❐'}
                    </span>
                  ) : null}
                </span>
                <span className="gal-card__meta">
                  <span className="gal-card__group">{LABELS[p.group]}</span>
                  <span className="gal-card__date">{monthYear(p.date)}</span>
                </span>
                {p.caption ? <span className="gal-card__caption">{p.caption}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="gal-follow">
        <div className="container gal-follow__inner">
          <div>
            <p className="eyebrow eyebrow--light">Stay in the loop</p>
            <h2 className="display">
              Follow along <em>@{gallery.handle}</em>
            </h2>
            <p>New results, openings and specials go up on Instagram first. Tag us in your fresh-wax selfies.</p>
          </div>
          <div className="gal-follow__ctas">
            <a className="btn btn--honey" href={gallery.profileUrl} target="_blank" rel="noopener">
              Follow on Instagram
            </a>
            <a className="btn btn--ghost btn--light" href={reviews.writeReviewUrl} target="_blank" rel="noopener">
              Leave a Google review
            </a>
          </div>
        </div>
      </section>

      <Visit />

      <dialog className="lightbox" ref={dialog} onClose={() => setOpen(null)} onClick={(e) => e.target === dialog.current && close()}>
        {open ? (
          <div className="lightbox__inner">
            <button className="lightbox__close" onClick={close} aria-label="Close">
              ×
            </button>
            {/* Instagram's embed plays videos and carousels in place. */}
            <iframe className="lightbox__embed" src={`${open.url}embed/captioned/`} title={`Instagram post ${open.id}`} loading="lazy" allowFullScreen />
            <a className="link-arrow lightbox__link" href={open.url} target="_blank" rel="noopener">
              View on Instagram
            </a>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
