// Doodle toolkit for the code videos. Everything is a pure function of time `t`
// (seconds), so a scene renders the same frame every time and loops cleanly.
// Lines "boil" (re-jitter a few times a second) like hand-drawn animation.

export const W = 1600, H = 900, FPS = 30;

export const PAPER = '#F8F1E7';
export const INK = '#211710';
export const HONEY = '#E39A1E';
export const HONEY_DEEP = '#D78306';
export const HONEY_PALE = '#FBE3A6';
export const MUTED = '#9C8A76';

// ── timing ──────────────────────────────────────────────────────────────────
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in: (t) => t * t * t,
  back: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};
/** Eased 0→1 between times a and b. */
export const seg = (t, a, b, e = ease.inOut) => e(prog(t, a, b));

// Deterministic noise so boiling lines are reproducible frame to frame.
function hash(n) {
  n = (n << 13) ^ n;
  return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}
const BOIL_RATE = 8; // re-jitters per second
export const boilFrame = (t) => Math.floor(t * BOIL_RATE);

// ── shapes as point lists ───────────────────────────────────────────────────
export function line(x0, y0, x1, y1, n = 16) {
  return Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(y0, y1, i / n)]);
}
export function arc(cx, cy, rx, ry, a0, a1, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / n);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}
export const ellipse = (cx, cy, rx, ry, start = -Math.PI / 2, n = 64) => arc(cx, cy, rx, ry, start, start + Math.PI * 2.04, n);
export function bezier(p0, p1, p2, p3, n = 40) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  });
}
/** Smooth path through points (Catmull-Rom). */
export function spline(points, per = 12) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
      ));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
export const translate = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// ── drawing ─────────────────────────────────────────────────────────────────
/**
 * Draw the first `p` (0–1) of a path in a wobbly pen line.
 * `seed` keeps each stroke's wobble distinct; `jit` is the boil amplitude in px.
 */
export function stroke(ctx, pts, p, t, { w = 6, color = INK, seed = 1, jit = 1.6, alpha = 1 } = {}) {
  if (p <= 0 || pts.length < 2) return;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1], upto = total * clamp(p);
  const b = boilFrame(t);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    let [x, y] = pts[i];
    if (lens[i] > upto) {
      // stop partway along this segment
      const k = (upto - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      x = lerp(pts[i - 1][0], x, k);
      y = lerp(pts[i - 1][1], y, k);
    }
    x += hash(seed * 7919 + i * 31 + b * 101) * jit;
    y += hash(seed * 104729 + i * 17 + b * 211) * jit;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    if (lens[i] > upto) break;
  }
  ctx.stroke();
  ctx.restore();
}

/** Marker-style hatch fill inside a closed shape, revealed by `p`. */
export function hatch(ctx, shape, p, t, { color = HONEY, gap = 14, angle = -0.6, w = 9, seed = 3, alpha = 0.9 } = {}) {
  if (p <= 0) return;
  const xs = shape.map((q) => q[0]), ys = shape.map((q) => q[1]);
  const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
  ctx.save();
  ctx.beginPath();
  shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  const span = (x1 - x0) + (y1 - y0);
  const count = Math.ceil(span / gap);
  const shown = Math.floor(count * clamp(p));
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let i = 0; i < shown; i++) {
    const ox = x0 + i * gap;
    const a = [ox, y1], b2 = [ox + dx * span, y1 + dy * span];
    stroke(ctx, line(a[0], a[1], b2[0], b2[1], 6), 1, t, { color, w, seed: seed + i, jit: 2.2, alpha });
  }
  ctx.restore();
}

/** Handwritten text revealed left to right. */
export function write(ctx, text, x, y, p, t, { size = 64, color = INK, align = 'center', rot = -0.03 } = {}) {
  if (p <= 0) return;
  ctx.save();
  ctx.font = `600 ${size}px Hand`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const j = hash(boilFrame(t) * 13 + text.length) * 1.2;
  ctx.translate(x, y + j);
  ctx.rotate(rot);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.rect(left - 10, y - size, (w + 20) * clamp(p), size * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Four-point sparkle that pops in with `p`. */
export function sparkle(ctx, x, y, s, p, t, { color = HONEY, seed = 9 } = {}) {
  if (p <= 0) return;
  const k = ease.back(clamp(p)) * s;
  stroke(ctx, line(x, y - k, x, y + k, 4), 1, t, { color, w: 5, seed, jit: 1 });
  stroke(ctx, line(x - k, y, x + k, y, 4), 1, t, { color, w: 5, seed: seed + 1, jit: 1 });
}

/** Little "✓" tick. */
export function tick(ctx, x, y, s, p, t, opts = {}) {
  stroke(ctx, [[x - s, y], [x - s * 0.3, y + s * 0.7], [x + s, y - s * 0.9]], p, t, { w: 7, color: HONEY_DEEP, ...opts });
}

/** Paper background with a faint dot grid, like a sketchbook page. */
export function paper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(33,23,16,0.07)';
  for (let x = 40; x < W; x += 48) for (let y = 30; y < H; y += 48) ctx.fillRect(x, y, 3, 3);
}

/**
 * Wraps a scene so it loops seamlessly: draws on, holds, then the whole page fades
 * back to blank paper over the last `fade` seconds, matching frame 0.
 */
export function loopFade(ctx, t, duration, fade, draw) {
  paper(ctx);
  const a = 1 - prog(t, duration - fade, duration - 0.1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  draw();
  ctx.restore();
}
