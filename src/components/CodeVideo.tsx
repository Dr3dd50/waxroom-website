import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * A looping doodle video (rendered by motion/render.mjs into public/videos/).
 * Plays only while on screen; with reduced motion it stays on the poster frame,
 * which is the finished drawing.
 */
export function CodeVideo({ slug, label, className = '' }: { slug: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current!;
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={`code-video ${className}`}
      poster={`/videos/${slug}.jpg`}
      muted
      loop
      playsInline
      // decorative loops: no picture-in-picture, casting or other browser buttons over them
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
      preload="metadata"
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <source src={`/videos/${slug}.webm`} type="video/webm" />
      <source src={`/videos/${slug}.mp4`} type="video/mp4" />
    </video>
  );
}
