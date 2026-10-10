import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * A looping doodle video (rendered by motion/render.mjs into public/videos/).
 * Plays only while on screen; with reduced motion it stays on the poster frame,
 * which is the finished drawing.
 */
export function CodeVideo({
  slug,
  label,
  className = '',
  startAt = 0,
}: {
  slug: string;
  label: string;
  className?: string;
  /** Seconds into the loop to begin, so grids of videos aren't all blank at once. */
  startAt?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current!;
    if (prefersReducedMotion()) return;
    let started = false;
    const play = () => {
      if (!started && startAt) {
        started = true;
        if (v.readyState >= 1) v.currentTime = startAt;
        else v.addEventListener('loadedmetadata', () => (v.currentTime = startAt), { once: true });
      }
      v.play().catch(() => {});
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) play();
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [startAt]);

  return (
    <video
      ref={ref}
      className={`code-video ${className}`}
      poster={`/videos/${slug}.jpg`}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <source src={`/videos/${slug}.webm`} type="video/webm" />
      <source src={`/videos/${slug}.mp4`} type="video/mp4" />
    </video>
  );
}
