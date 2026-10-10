import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;

// Breathing room between the header and a section's first line after a jump.
const GAP = 24;

/** Smooth scrolling (Lenis) driven by GSAP's ticker so ScrollTrigger stays in sync. */
export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/**
 * Scroll so as much of a section as possible is in view: its content (not its empty
 * top padding) starts just under the header, or sits centred below the header when
 * the whole section fits on screen.
 */
export function scrollToHash(hash: string) {
  const el = document.querySelector(hash);
  if (!(el instanceof HTMLElement)) return;
  const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0;
  const style = getComputedStyle(el);
  const padTop = parseFloat(style.paddingTop) || 0;
  const rect = el.getBoundingClientRect();
  const content = rect.height - padTop - (parseFloat(style.paddingBottom) || 0);
  const room = window.innerHeight - header;
  const lead = content + 2 * GAP <= room ? (room - content) / 2 : GAP;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const top = Math.max(0, Math.min(max, window.scrollY + rect.top + padTop - header - lead));
  if (lenis) lenis.scrollTo(top);
  else window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/** Same-page "#section" links anywhere on the site use the measured scroll above. */
export function handleHashLinks() {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = (e.target as Element).closest?.('a[href]');
    const href = a?.getAttribute('href') ?? '';
    const hash = href.startsWith('#') ? href : href.startsWith('/#') && location.pathname === '/' ? href.slice(1) : '';
    if (hash.length < 2 || !document.querySelector(hash)) return;
    e.preventDefault();
    scrollToHash(hash);
    history.replaceState(null, '', hash);
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
