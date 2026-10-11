import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * A looping doodle video (rendered by motion/render.mjs into public/videos/).
 *
 * The video itself never enters the page: it plays off-page and each frame is
 * painted onto a canvas. Browsers and extensions float their own buttons
 * (picture-in-picture, "next", pop-out) over any video element a visitor hovers,
 * whatever attributes it carries; a canvas is just a picture to them.
 *
 * Plays only while on screen. Until the first frame, and with reduced motion,
 * the poster (the finished drawing) shows underneath.
 */
export function CodeVideo({ slug, label, className = '' }: { slug: string; label: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const c = canvas.current!;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('playsinline', '');
    v.src = `/videos/${slug}.${v.canPlayType('video/webm; codecs="vp9"') ? 'webm' : 'mp4'}`;

    // fill the box like object-fit: cover, at the screen's pixel density
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(r.width * d));
      c.height = Math.max(1, Math.round(r.height * d));
    };
    const paint = () => {
      if (v.readyState < 2 || !v.videoWidth) return;
      const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
      const w = v.videoWidth * s;
      const h = v.videoHeight * s;
      ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
    };
    let raf = 0;
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      v.play().catch(() => {});
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      v.pause();
      cancelAnimationFrame(raf);
    };

    fit();
    const ro = new ResizeObserver(() => (fit(), paint()));
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.25 });
    io.observe(c);
    return () => {
      io.disconnect();
      ro.disconnect();
      stop();
      v.removeAttribute('src');
      v.load();
    };
  }, [slug]);

  return (
    <div className={`code-video ${className}`} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <img src={`/videos/${slug}.jpg`} alt="" decoding="async" />
      <canvas ref={canvas} />
    </div>
  );
}
