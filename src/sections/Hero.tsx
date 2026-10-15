import { useEffect, useRef, useState } from 'react';
import { FlipWord, HALF_FLIP_MS } from '../components/FlipWord';
import { Sparkles } from '../components/Sparkles';
import { gsap, useGSAP } from '../lib/motion';
import { openServicesMenu } from '../lib/menu';
import { useBookLink } from '../lib/booking';

// "Get your ___ ___." Only the two words flip. The line underneath explains the
// treatment that phrase is promoting, drawn from the salon's own descriptions.
const PHRASES: { noun: string; verb: string; service: string; learn: string }[] = [
  {
    noun: 'wax',
    verb: 'done',
    service: 'Brazilian wax',
    learn: 'Waxing lifts hair from the root, so smoothness lasts for weeks, and regular visits mean finer, softer regrowth.',
  },
  {
    noun: 'brows',
    verb: 'snatched',
    service: 'Eyebrow wax',
    learn: 'A brow wax shapes to your natural arch, cleaning up strays in minutes so your brows frame your eyes.',
  },
  {
    noun: 'lashes',
    verb: 'extended',
    service: 'Lash extensions',
    learn: 'Extensions are bonded to your natural lashes one by one, and regular fills keep the set full as lashes shed.',
  },
  {
    noun: 'wrinkles',
    verb: 'removed',
    service: 'Jet Plasma facial',
    learn: 'Jet Plasma uses plasma energy to stimulate collagen and tighten skin, softening fine lines with no numbing and no downtime.',
  },
  {
    noun: 'skin',
    verb: 'resurfaced',
    service: 'BioRePeel',
    learn: 'BioRePeel is a medical-grade peel made with vitamins and amino acids. It resurfaces and fades pigmentation with little to no peeling.',
  },
  {
    noun: 'steam',
    verb: 'on',
    service: 'Yoni steam',
    learn: 'A yoni steam is a seated session over warm herbal steam, a quiet ritual made for relaxation and restoring calm.',
  },
  {
    noun: 'hair',
    verb: 'restored',
    service: 'Jet Plasma hair restoration',
    learn: 'Plasma energy stimulates the scalp to encourage thicker, fuller-looking hair, with no needles and no surgery.',
  },
  {
    noun: 'brows',
    verb: 'laminated',
    service: 'Brow lamination',
    learn: 'Lamination sets brow hairs in a brushed-up shape for weeks, so thin or unruly brows look fuller and stay put.',
  },
  {
    noun: 'glow',
    verb: 'back',
    service: 'Vajacial',
    learn: 'A vajacial is a facial for your bikini line. It cleanses, exfoliates and calms skin to help reduce ingrown hairs.',
  },
  {
    noun: 'confidence',
    verb: 'back',
    service: 'New client ritual',
    learn: 'New here? Your first Brazilian comes with a complimentary Yoni Steam (up to 1 hour), a gentle start to self-care.',
  },
];
const INTERVAL_MS = 3400;

export function Hero() {
  const book = useBookLink();
  const root = useRef<HTMLElement>(null);
  const [i, setI] = useState(0);
  // The explainer changes as the flip lands, not before it starts.
  const [learnIndex, setLearnIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setI((n) => (n + 1) % PHRASES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setLearnIndex(i), HALF_FLIP_MS);
    return () => window.clearTimeout(t);
  }, [i]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'expo.out', duration: 1.2 } })
          .from('.hero__logo', { scale: 0.85, opacity: 0, duration: 1.6 })
          .from('.hero__reveal', { y: 30, opacity: 0, stagger: 0.1 }, '<0.3');

        // Scroll-out: the copy lifts away. The logo stays solid until the header logo takes over.
        gsap.to('.hero__copy', {
          yPercent: -12,
          opacity: 0.2,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'center center', end: 'bottom top', scrub: true },
        });
      });
    },
    { scope: root },
  );

  const phrase = PHRASES[i];
  const learn = PHRASES[learnIndex];

  return (
    <section className="hero" id="top" ref={root}>
      <Sparkles density={0.00004} />
      <div className="hero__inner">
        <img className="hero__logo" src="/logo.png" alt="The Wax Room" width={424} height={360} />
        <div className="hero__copy">
          <p className="eyebrow hero__reveal">Midlothian · Richmond, VA</p>
          <h1 className="hero__title hero__reveal">
            <span className="sr-only">
              Get your {PHRASES.map((p) => `${p.noun} ${p.verb}`).join(', ')} at The Wax Room.
            </span>
            <span className="hero__static" aria-hidden="true">
              Get your{' '}
            </span>
            <span className="hero__flips" aria-hidden="true">
              <FlipWord word={phrase.noun} />{' '}
              <FlipWord word={phrase.verb} delay={150} />
            </span>
          </h1>
          <div className="hero__learn hero__reveal">
            <p key={learnIndex} className="hero__learn-text">
              <span className="hero__learn-label">{learn.service}</span>
              {learn.learn}
            </p>
          </div>
          <div className="hero__ctas hero__reveal">
            <a className="btn btn--honey" {...book()}>
              Book your appointment
            </a>
            <a
              className="btn btn--ghost"
              href="#menu"
              onClick={(e) => {
                e.preventDefault();
                openServicesMenu();
              }}
            >
              See the menu
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
