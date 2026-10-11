// Doodle toolkit for the code videos. Everything is a pure function of time `t`
// (seconds), so a scene renders the same frame every time and loops cleanly.
// Lines are steady, round-capped pen strokes.

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
// Pen width multiplier. The zoom camera sets it to 1/zoom while it draws the wide
// shot, so lines keep their weight on screen as the camera pushes in (the drawing
// gains detail rather than its strokes swelling into bars).
let LINE = 1;
/** Set the pen width multiplier; returns the previous one. */
export function lineScale(k) {
  const prev = LINE;
  LINE = k;
  return prev;
}
/** Draw the first `p` (0–1) of a path as a pen line, optionally dashed. (`t` and `seed` are kept for call-site symmetry.) */
export function stroke(ctx, pts, p, t, { w = 6, color = INK, alpha = 1, dash } = {}) {
  if (p <= 0 || pts.length < 2) return;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1], upto = total * clamp(p);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w * LINE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    let [x, y] = pts[i];
    if (lens[i] > upto) {
      // stop partway along this segment
      const k = (upto - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      x = lerp(pts[i - 1][0], x, k);
      y = lerp(pts[i - 1][1], y, k);
    }
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    if (lens[i] > upto) break;
  }
  ctx.stroke();
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
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.rect(left - 10, y - size, (w + 20) * clamp(p), size * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Paper background with a faint dot grid, like a sketchbook page. */
export function paper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(33,23,16,0.07)';
  for (let x = 40; x < W; x += 48) for (let y = 30; y < H; y += 48) ctx.fillRect(x, y, 3, 3);
}

// ── fills, shapes and loop helpers for the detailed scenes ─────────────────────
export const TAU = Math.PI * 2;
export const GLOVE = '#9DBCF2';
export const WOOD = '#E9CF9E';
export const SKIN = '#C68E63';
export const SKIN_SHADE = '#A9714A';
export const PLASMA = '#9B7BFF';

/** Solid fill of a closed point list. */
export function fill(ctx, pts, color, alpha = 1) {
  if (pts.length < 3) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Rounded rectangle as a closed point list (x, y = top-left). */
export function rrect(x, y, w, h, r, n = 6) {
  r = Math.min(r, w / 2, h / 2);
  const c = (cx, cy, a0) => arc(cx, cy, r, r, a0, a0 + Math.PI / 2, n);
  return [...c(x + w - r, y + r, -Math.PI / 2), ...c(x + w - r, y + h - r, 0), ...c(x + r, y + h - r, Math.PI / 2), ...c(x + r, y + r, Math.PI)];
}

export function rotate(pts, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** Outline + fill in one go: the usual doodle "coloured-in" shape. */
export function shape(ctx, pts, t, { fillColor, fillAlpha = 1, w = 5, color = INK, seed = 1, close = true } = {}) {
  if (fillColor) fill(ctx, pts, fillColor, fillAlpha);
  stroke(ctx, close ? [...pts, pts[0]] : pts, 1, t, { w, color, seed });
}

/** Periodic 0..1 phase of t for a loop of `duration`, optionally offset. */
export const phase = (t, duration, offset = 0) => (((t / duration + offset) % 1) + 1) % 1;
/** Smooth periodic wave with an integer number of cycles per loop (seam-free). */
export const wave = (t, duration, cycles = 1, offset = 0) => Math.sin(TAU * (cycles * t / duration + offset));
