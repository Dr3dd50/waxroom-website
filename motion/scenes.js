// One doodle scene per service page. Each is 8 s: draw on (~0–5 s), hold while
// the lines boil, then fade to blank paper so the video loops without a seam.
// Keep the main subject inside x 520–1080 / y 200–720: pages crop the frame
// (wide bands crop top and bottom; phones crop the sides).

import {
  W, H, INK, HONEY, HONEY_DEEP, HONEY_PALE, MUTED,
  seg, prog, lerp, ease, line, arc, ellipse, spline, bezier, translate,
  stroke, hatch, write, sparkle, tick, loopFade,
} from './doodle.js';

export const DURATION = 8;
const FADE = 0.9;

const SAGE = '#7E8C5A';

// Sample a polyline's y at x (points sorted by x).
function yAt(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const k = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1);
      return lerp(pts[i - 1][1], pts[i][1], k);
    }
  }
  return pts[pts.length - 1][1];
}

function rotated(pts, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

// ── Brazilian & intimate waxing: wax pot, stick dips, honey ribbon ─────────────
function brazilian(ctx, t) {
  const rim = ellipse(800, 470, 170, 42);
  const body = [
    ...line(632, 474, 652, 690, 10),
    ...arc(800, 690, 148, 30, Math.PI, 0, 24).reverse().map(([x, y]) => [x, 2 * 690 - y]),
    ...line(948, 690, 968, 474, 10),
  ];
  stroke(ctx, rim, seg(t, 0.1, 1.1), t, { w: 7, seed: 1 });
  stroke(ctx, body, seg(t, 0.5, 1.7), t, { w: 7, seed: 2 });
  hatch(ctx, ellipse(800, 476, 150, 30), seg(t, 1.5, 2.3), t, { color: HONEY, gap: 13, seed: 5 });
  // label band on the pot
  write(ctx, 'warm wax', 800, 590, seg(t, 1.8, 2.5), t, { size: 46, color: MUTED });

  // the stick: drawn dipped, then lifted and tilted
  const lift = seg(t, 2.9, 3.6, ease.back);
  const stickBase = [[0, 0], [300, -18], [312, -2], [312, 26], [300, 42], [0, 30], [0, 0]];
  const dipX = 860, dipY = 470;
  const ang = lerp(-0.95, -0.55, lift);
  const sx = dipX + lerp(0, 40, lift), sy = dipY + lerp(0, -170, lift);
  const stick = rotated(translate(stickBase, sx - 312, sy - 12), sx, sy, ang + Math.PI);
  stroke(ctx, spline(stick, 3), seg(t, 2.2, 2.9), t, { w: 6, seed: 3 });
  // wax coating the tip after the lift
  const tip = rotated([[sx - 6, sy - 6]], sx, sy, 0)[0];
  if (t > 3.3) {
    ctx.save();
    ctx.globalAlpha *= prog(t, 3.3, 3.6);
    ctx.fillStyle = HONEY;
    ctx.beginPath();
    ctx.ellipse(tip[0], tip[1] + 8, 30, 22, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // honey ribbon falling back into the pot, folding over itself
  const ribbon = spline([
    [tip[0], tip[1] + 24], [tip[0] - 8, tip[1] + 90], [tip[0] - 30, 400], [tip[0] - 10, 440],
    [tip[0] - 50, 452], [tip[0] - 20, 462],
  ], 10);
  stroke(ctx, ribbon, seg(t, 3.6, 4.6), t, { w: 14, color: HONEY, seed: 7, jit: 1 });

  write(ctx, 'smooth for weeks', 800, 210, seg(t, 4.2, 5.2), t, { size: 80 });
  tick(ctx, 1120, 205, 22, seg(t, 5.1, 5.5), t);
  sparkle(ctx, 500, 330, 22, seg(t, 4.8, 5.4), t, { seed: 11 });
  sparkle(ctx, 1110, 520, 18, seg(t, 5.0, 5.6), t, { seed: 13 });
  sparkle(ctx, 560, 640, 14, seg(t, 5.2, 5.8), t, { seed: 15 });
}

// ── Body waxing: a leg, a wax strip sweeps along it, hair disappears ──────────
function body(ctx, t) {
  const top = spline([[230, 520], [480, 488], [740, 506], [980, 530], [1190, 546]], 14);
  const foot = spline([[1190, 546], [1300, 520], [1372, 548], [1392, 590], [1330, 612], [1190, 606]], 8);
  const bottom = spline([[1190, 606], [980, 612], [740, 618], [480, 630], [230, 650]], 14);
  stroke(ctx, top, seg(t, 0.1, 1.2), t, { w: 7, seed: 1 });
  stroke(ctx, foot, seg(t, 1.0, 1.6), t, { w: 7, seed: 2 });
  stroke(ctx, bottom, seg(t, 0.4, 1.5), t, { w: 7, seed: 3 });
  // knee crease
  stroke(ctx, spline([[740, 540], [760, 560], [748, 584]], 6), seg(t, 1.4, 1.8), t, { w: 5, seed: 4, color: MUTED });

  const sweep = lerp(250, 1210, seg(t, 2.6, 4.4, ease.inOut));
  // hair along the top of the leg, gone wherever the strip has passed
  for (let i = 0, x = 290; x < 1170; x += 38, i++) {
    if (t > 2.6 && x < sweep - 60) continue;
    const y = yAt(top, x);
    stroke(ctx, [[x, y - 2], [x + 6, y - 16], [x + 14, y - 26]], seg(t, 1.6 + i * 0.03, 2.0 + i * 0.03), t, { w: 4, seed: 20 + i });
  }
  // the wax strip riding along the leg
  if (t > 2.2) {
    const sy = yAt(top, sweep) - 20;
    const strip = [[sweep - 120, sy - 38], [sweep + 60, sy - 46], [sweep + 66, sy + 30], [sweep - 114, sy + 38], [sweep - 120, sy - 38]];
    hatch(ctx, strip, seg(t, 2.2, 2.6), t, { color: HONEY_PALE, gap: 12, w: 8, seed: 40 });
    stroke(ctx, strip, seg(t, 2.2, 2.6), t, { w: 6, seed: 41 });
  }
  write(ctx, 'lip to toe', 800, 250, seg(t, 4.3, 5.1), t, { size: 84 });
  for (let i = 0; i < 4; i++) {
    const x = 380 + i * 230;
    sparkle(ctx, x, yAt(top, x) - 60, 16, seg(t, 4.6 + i * 0.12, 5.1 + i * 0.12), t, { seed: 60 + i });
  }
}

// ── Brows: map start / arch / tail, then draw the brow hair by hair ───────────
function brows(ctx, t) {
  // eye
  stroke(ctx, spline([[600, 560], [700, 500], [820, 494], [940, 536], [990, 566]], 10), seg(t, 0.1, 0.9), t, { w: 7, seed: 1 });
  stroke(ctx, spline([[600, 560], [720, 610], [860, 612], [990, 566]], 10), seg(t, 0.4, 1.1), t, { w: 6, seed: 2 });
  stroke(ctx, ellipse(800, 552, 46, 46), seg(t, 0.8, 1.3), t, { w: 6, seed: 3 });
  hatch(ctx, ellipse(800, 552, 22, 22), seg(t, 1.2, 1.5), t, { color: INK, gap: 8, w: 6, seed: 4 });

  // mapping guides, dashed
  const guides = [
    [[600, 700], [600, 330], 'start'],
    [[560, 760], [880, 330], 'arch'],
    [[560, 760], [1040, 380], 'tail'],
  ];
  guides.forEach(([a, b, label], i) => {
    const n = 14;
    for (let k = 0; k < n; k += 2) {
      const p0 = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)];
      const p1 = [lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n)];
      stroke(ctx, line(p0[0], p0[1], p1[0], p1[1], 2), seg(t, 1.3 + i * 0.35 + k * 0.03, 1.5 + i * 0.35 + k * 0.03), t, { w: 3, color: MUTED, seed: 10 + i * 20 + k });
    }
    write(ctx, label, b[0] + (i === 0 ? -40 : 40), b[1] - 34, seg(t, 1.8 + i * 0.3, 2.3 + i * 0.3), t, { size: 42, color: HONEY_DEEP });
  });

  // the brow, laid in short hair strokes from start to tail
  const brow = spline([[606, 430], [720, 392], [870, 370], [960, 384], [1030, 410]], 16);
  const hairs = 46;
  for (let i = 0; i < hairs; i++) {
    const k = i / (hairs - 1);
    const [x, y] = brow[Math.round(k * (brow.length - 1))];
    const thick = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 18 + 6;
    const lean = lerp(-1.25, -0.35, k);
    const len = thick + 14;
    const p = seg(t, 2.6 + k * 1.6, 2.8 + k * 1.6);
    stroke(ctx, [[x - 4, y + thick * 0.5], [x + Math.cos(lean) * len * 0.5, y + thick * 0.5 + Math.sin(lean) * len * 0.5], [x + Math.cos(lean) * len, y + thick * 0.5 + Math.sin(lean) * len]], p, t, { w: 4, seed: 100 + i });
  }
  write(ctx, 'framed.', 800, 200, seg(t, 4.5, 5.2), t, { size: 84 });
  sparkle(ctx, 1080, 300, 18, seg(t, 5.0, 5.5), t, { seed: 77 });
}

// ── Lashes: a closed eye gets lashes one at a time, tweezers following ────────
function lashes(ctx, t) {
  const lid = spline([[560, 470], [680, 528], [800, 546], [920, 528], [1040, 470]], 14);
  stroke(ctx, lid, seg(t, 0.2, 1.0), t, { w: 8, seed: 1 });
  stroke(ctx, spline([[600, 452], [800, 420], [1000, 452]], 10), seg(t, 0.6, 1.2), t, { w: 4, seed: 2, color: MUTED });
  write(ctx, 'one lash at a time', 800, 220, seg(t, 0.4, 1.4), t, { size: 76 });

  const n = 24;
  let tipNow = null;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const [x, y] = lid[Math.round(lerp(4, lid.length - 5, k))];
    const out = lerp(-0.9, 0.9, k); // fan outwards
    const natural = 34, ext = 74 + Math.sin(Math.PI * k) * 26;
    const dir = Math.PI / 2 + out * 0.9;
    const pts = (len) => bezier([x, y + 4], [x + Math.cos(dir) * len * 0.4, y + len * 0.5], [x + Math.cos(dir) * len * 0.8, y + len * 0.85], [x + Math.cos(dir) * len + out * 10, y + len * 0.9], 10);
    const a = 1.2 + k * 1.4;
    stroke(ctx, pts(natural), seg(t, a, a + 0.12), t, { w: 4, seed: 10 + i, color: MUTED });
    const b = 2.7 + k * 1.9;
    const pe = seg(t, b, b + 0.14);
    stroke(ctx, pts(ext), pe, t, { w: 5, seed: 40 + i });
    if (pe > 0 && pe < 1) tipNow = pts(ext)[10];
  }
  // tweezers hovering at the lash being placed
  if (t > 2.6 && t < 4.9) {
    const [tx, ty] = tipNow ?? [1000, 600];
    const g = 0.5 + Math.sin(t * 20) * 0.5;
    stroke(ctx, line(tx + 6, ty + 4, tx + 150, ty + 170, 6), 1, t, { w: 6, seed: 90, color: INK });
    stroke(ctx, line(tx + 14 + g * 6, ty, tx + 172, ty + 150, 6), 1, t, { w: 6, seed: 91, color: INK });
  }
  sparkle(ctx, 1090, 420, 20, seg(t, 4.9, 5.4), t, { seed: 99 });
  sparkle(ctx, 520, 430, 14, seg(t, 5.1, 5.6), t, { seed: 98 });
}

// ── Jet Plasma & skin: a wand passes over skin and the lines smooth out ───────
function skin(ctx, t) {
  const card = spline([[470, 360], [1130, 350], [1150, 700], [460, 712], [470, 360]], 6);
  stroke(ctx, card, seg(t, 0.1, 0.9), t, { w: 6, seed: 1, color: MUTED });
  const pass = lerp(430, 1180, seg(t, 2.4, 4.4, ease.inOut));
  for (let r = 0; r < 5; r++) {
    const y0 = 420 + r * 62;
    const pts = [];
    for (let x = 510; x <= 1090; x += 12) {
      const smooth = t > 2.4 && x < pass ? 0.12 : 1;
      pts.push([x, y0 + Math.sin(x / 26 + r * 1.7) * 14 * smooth]);
    }
    stroke(ctx, pts, seg(t, 0.6 + r * 0.15, 1.6 + r * 0.15), t, { w: 5, seed: 10 + r });
  }
  // the wand
  if (t > 1.8) {
    const wx = pass, wy = 260;
    const wand = [[wx - 10, wy + 20], [wx + 120, wy - 150], [wx + 150, wy - 128], [wx + 14, wy + 34], [wx - 10, wy + 20]];
    stroke(ctx, wand, seg(t, 1.8, 2.3), t, { w: 6, seed: 20 });
    hatch(ctx, wand, seg(t, 2.1, 2.4), t, { color: HONEY_PALE, gap: 10, w: 7, seed: 21 });
    // plasma arcs from the tip to the skin
    if (t > 2.4 && t < 4.5) {
      for (let k = 0; k < 3; k++) {
        const zig = [];
        for (let j = 0; j <= 6; j++) zig.push([wx + 2 + (j % 2 ? 12 : -12) * (k - 1) + Math.sin(t * 40 + j + k) * 6, wy + 30 + j * ((392 - wy) / 6)]);
        stroke(ctx, zig, 1, t, { w: 4, color: HONEY, seed: 30 + k, jit: 4 });
      }
    }
  }
  write(ctx, 'smooth & bright', 800, 790, seg(t, 4.4, 5.2), t, { size: 76 });
  sparkle(ctx, 560, 300, 20, seg(t, 4.6, 5.1), t, { seed: 50 });
  sparkle(ctx, 1080, 300, 16, seg(t, 4.8, 5.3), t, { seed: 51 });
  sparkle(ctx, 1180, 560, 14, seg(t, 5.0, 5.5), t, { seed: 52 });
}

// ── Yoni steam: a bowl of herbs and slow rising steam ──────────────────────────
function steam(ctx, t) {
  stroke(ctx, ellipse(800, 600, 210, 46), seg(t, 0.1, 1.0), t, { w: 7, seed: 1 });
  stroke(ctx, arc(800, 600, 210, 170, 0, Math.PI, 30), seg(t, 0.5, 1.4), t, { w: 7, seed: 2 });
  hatch(ctx, ellipse(800, 604, 186, 32), seg(t, 1.2, 1.9), t, { color: HONEY_PALE, gap: 12, w: 8, seed: 3 });
  // herbs floating on the surface
  [[700, 598, -0.4], [820, 590, 0.3], [900, 606, -0.1], [760, 610, 0.8]].forEach(([x, y, r], i) => {
    const leaf = rotated(spline([[x - 30, y], [x, y - 14], [x + 30, y], [x, y + 14], [x - 30, y]], 6), x, y, r);
    stroke(ctx, leaf, seg(t, 1.6 + i * 0.15, 2.0 + i * 0.15), t, { w: 4, color: SAGE, seed: 10 + i });
    stroke(ctx, rotated(line(x - 26, y, x + 26, y, 4), x, y, r), seg(t, 1.8 + i * 0.15, 2.1 + i * 0.15), t, { w: 3, color: SAGE, seed: 20 + i });
  });
  // steam wisps: each draws upward and keeps drifting while the scene holds
  for (let w = 0; w < 3; w++) {
    const x0 = 720 + w * 80;
    const drift = (t - 2) * 0.9 + w;
    const pts = [];
    for (let j = 0; j <= 16; j++) {
      const y = 540 - j * 22;
      pts.push([x0 + Math.sin(j * 0.55 + drift * 2.2 + w) * (12 + j * 1.6), y]);
    }
    stroke(ctx, pts, seg(t, 2.2 + w * 0.3, 3.6 + w * 0.3), t, { w: 5, color: MUTED, seed: 40 + w, jit: 1.2 });
  }
  write(ctx, 'pause. breathe.', 800, 170, seg(t, 3.8, 4.8), t, { size: 80 });
  sparkle(ctx, 1040, 420, 16, seg(t, 4.8, 5.3), t, { seed: 60 });
}

// ── Hair restoration: a crown of hair grows in fuller ─────────────────────────
function hair(ctx, t) {
  const scalp = arc(800, 1060, 470, 420, Math.PI * 1.18, Math.PI * 1.82, 60);
  stroke(ctx, scalp, seg(t, 0.1, 1.1), t, { w: 8, seed: 1 });
  const strands = 64;
  for (let i = 0; i < strands; i++) {
    const k = (i * 0.618) % 1; // spread evenly but out of order
    const idx = Math.round(lerp(4, scalp.length - 5, k));
    const [x, y] = scalp[idx];
    const normal = Math.atan2(y - 1060, x - 800);
    const early = i < 14;
    const start = early ? 1.0 + i * 0.07 : 3.0 + (i - 14) * 0.03;
    const len = (early ? 60 : 110) + ((i * 37) % 40);
    const curl = (i % 2 ? 1 : -1) * 0.35;
    const p1 = [x + Math.cos(normal) * len * 0.5, y + Math.sin(normal) * len * 0.5];
    const p2 = [x + Math.cos(normal + curl) * len, y + Math.sin(normal + curl) * len];
    stroke(ctx, spline([[x, y], p1, p2], 6), seg(t, start, start + 0.5), t, { w: early ? 4 : 5, seed: 10 + i, color: early ? MUTED : INK });
  }
  // plasma sparkle over the scalp between the sparse and full phases
  for (let i = 0; i < 6; i++) {
    const [x, y] = scalp[10 + i * 8];
    sparkle(ctx, x, y - 30, 14, seg(t, 2.2 + i * 0.1, 2.6 + i * 0.1) * (1 - seg(t, 3.2, 3.6)), t, { seed: 80 + i });
  }
  write(ctx, 'fuller-looking hair', 800, 190, seg(t, 4.4, 5.3), t, { size: 76 });
}

const DRAW = {
  'brazilian-waxing': brazilian,
  'body-waxing': body,
  brows,
  'lash-extensions': lashes,
  'skin-treatments': skin,
  'yoni-steam': steam,
  'hair-restoration': hair,
};

export const SCENES = Object.keys(DRAW);

export function drawScene(ctx, name, t) {
  loopFade(ctx, t, DURATION, FADE, () => DRAW[name](ctx, t));
}

export { W, H };
