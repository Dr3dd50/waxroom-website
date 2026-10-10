import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/** Gold flecks drifting upward, echoing the sparkles in the logo. */
export function Sparkles({ density = 0.00009 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const colors = ['#F6C35B', '#E39A1E', '#D78306', '#FBE3A6'];
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    type P = { x: number; y: number; r: number; vy: number; vx: number; tw: number; c: string; star: boolean };
    let parts: P[] = [];

    const spawn = (y = Math.random() * h): P => ({
      x: Math.random() * w,
      y,
      r: 0.6 + Math.random() * 2.2,
      vy: 0.15 + Math.random() * 0.45,
      vx: (Math.random() - 0.5) * 0.2,
      tw: Math.random() * Math.PI * 2,
      c: colors[(Math.random() * colors.length) | 0],
      star: Math.random() < 0.18,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: Math.round(w * h * density) }, () => spawn());
    };

    const drawStar = (p: P, a: number) => {
      const s = p.r * 2.6;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
      ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
      ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
      ctx.fill();
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.vy;
        p.x += p.vx;
        p.tw += 0.03;
        if (p.y < -10) Object.assign(p, spawn(h + 10));
        const a = 0.35 + Math.sin(p.tw) * 0.35;
        if (p.star) drawStar(p, Math.max(a, 0.1));
        else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (visible) raf = requestAnimationFrame(frame);
    };

    resize();
    if (prefersReducedMotion()) {
      frame();
      cancelAnimationFrame(raf);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    });
    io.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [density]);

  return <canvas ref={ref} className="sparkles" aria-hidden="true" />;
}
