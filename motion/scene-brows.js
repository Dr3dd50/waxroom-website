// Brow mapping, front-on, the way brow artists do it: a pre-inked mapping string
// comes off its spool and is snapped across the face to leave fine guide lines:
// centre line, brow starts (straight up from the nose), arches (nose → centre of
// the eye), tails (nose → outer corner), then top and bottom guides. A spoolie
// brushes each brow up along the map, and a cotton pad wipes the lines away,
// which returns to the very first frame: a perfect loop. Tools only.
//
// References: pre-inked mapping string on a spool (white/pink), brow mapping
// photos (centre, start, arch, tail lines), spoolie brush, cotton rounds.

import {
  MUTED, SKIN, SKIN_SHADE, TAU,
  stroke, fill, shape, spline, line, ellipse, rrect, rotate, translate, write, lerp, seg, ease,
} from './doodle.js';

export const DURATION = 8;
const CX = 800;
const STRING = '#E86A8E';
const MARK = '#FFFFFF';

// Viewer-left brow; the right one is its mirror image.
const BROW_PATH = spline([[688, 424], [610, 398], [520, 368], [462, 356], [400, 368], [346, 392]], 10);
const widthAt = (u) => (u < 0.62 ? lerp(46, 30, u / 0.62) : lerp(30, 8, (u - 0.62) / 0.38));
const mirror = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);

function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** The brow, hair by hair. `lift(x)` (0..1) brushes hairs more upright near the spoolie. */
function brow(ctx, t, side, lift) {
  const N = 70;
  for (let i = 0; i < N; i++) {
    const u = (i + hash(i, side) * 0.8) / N;
    const idx = Math.min(BROW_PATH.length - 2, Math.floor(u * (BROW_PATH.length - 1)));
    const [px, py] = BROW_PATH[idx];
    const [qx, qy] = BROW_PATH[idx + 1];
    const w = widthAt(u);
    for (let r = 0; r < 3; r++) {
      const off = (hash(i, r + side * 7) - 0.5) * w;
      let x = px + (qx - px) * 0.5, y = py + (qy - py) * 0.5 + off;
      // natural growth: upright at the start, sweeping toward the tail further along
      let ang = lerp(-1.45, -0.25, Math.min(1, u * 1.3)) + (hash(r, i) - 0.5) * 0.3;
      if (side) [x] = mirror([[x, y]])[0];
      const L = lerp(30, 18, u) + hash(i + r, 3) * 8;
      const up = lift(x);
      ang = lerp(ang, -1.5, up * 0.7);
      const dir = side ? -1 : 1;
      const ex = x - dir * Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
      stroke(ctx, [[x, y], [lerp(x, ex, 0.5) - dir * 2, lerp(y, ey, 0.5)], [ex, ey]], 1, t, { w: 3, seed: 1000 * side + i * 3 + r, color: '#3B2A1E' });
    }
  }
}

function eye(ctx, t, side) {
  const lid = spline([[400, 540], [460, 560], [540, 566], [620, 552], [650, 540]], 8);
  const pts = side ? mirror(lid) : lid;
  stroke(ctx, pts, 1, t, { w: 6, seed: 50 + side });
  for (let i = 0; i < 10; i++) {
    const [x, y] = pts[4 + i * 3];
    const lean = (x - CX) * 0.03;
    stroke(ctx, [[x, y], [x + lean * 0.5, y + 12], [x + lean, y + 22]], 1, t, { w: 3, seed: 60 + side * 20 + i });
  }
  stroke(ctx, (side ? mirror : (p) => p)(spline([[420, 500], [520, 484], [630, 500]], 6)), 1, t, { w: 3, color: MUTED, seed: 70 + side });
}

/** Mapping-string spool with the string feeding out. */
function spool(ctx, t) {
  shape(ctx, rrect(1420, 640, 110, 190, 24), t, { fillColor: '#1F1A16', w: 5, seed: 80 });
  shape(ctx, ellipse(1475, 642, 55, 14), t, { fillColor: '#3A332D', w: 4, seed: 81 });
  ctx.save();
  ctx.fillStyle = '#F8F1E7';
  ctx.font = '600 30px Hand';
  ctx.textAlign = 'center';
  ctx.fillText('mapping', 1475, 718);
  ctx.fillText('string', 1475, 750);
  ctx.restore();
}

/** One snap of the string: taut along a→b (fed from the spool), then a quick twang. */
function snap(ctx, t, a, b, t0, seed) {
  const taut = seg(t, t0, t0 + 0.25) * (1 - seg(t, t0 + 0.55, t0 + 0.7));
  if (taut <= 0) return;
  const twang = t > t0 + 0.32 && t < t0 + 0.55 ? Math.sin((t - t0) * 90) * 10 * (1 - seg(t, t0 + 0.32, t0 + 0.55)) : 0;
  // held taut a little past both ends of the guide it leaves
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const ext = 60 / len;
  const a2 = [a[0] - dx * ext, a[1] - dy * ext], b2 = [b[0] + dx * ext, b[1] + dy * ext];
  const mid = [(a[0] + b[0]) / 2 + twang, (a[1] + b[1]) / 2];
  ctx.save();
  ctx.globalAlpha *= taut;
  stroke(ctx, spline([a2, mid, b2], 10), 1, t, { w: 4, color: STRING, seed });
  ctx.restore();
}

export function draw(ctx, t) {
  // skin, headband, nose
  fill(ctx, [[0, 0], [1600, 0], [1600, 900], [0, 900]], SKIN);
  shape(ctx, spline([[-20, 0], [1620, 0], [1620, 120], [800, 150], [-20, 120]], 8), t, { fillColor: '#FFFFFF', w: 5, seed: 1 });
  fill(ctx, spline([[740, 600], [730, 760], [700, 860], [900, 860], [870, 760], [860, 600]], 6), SKIN_SHADE, 0.35);
  stroke(ctx, spline([[748, 540], [738, 700], [712, 830]], 6), 1, t, { w: 4, color: MUTED, seed: 2 });
  stroke(ctx, spline([[852, 540], [862, 700], [888, 830]], 6), 1, t, { w: 4, color: MUTED, seed: 3 });
  stroke(ctx, spline([[700, 870], [760, 888], [800, 880]], 4), 1, t, { w: 4, seed: 4 });
  stroke(ctx, spline([[800, 880], [840, 888], [900, 870]], 4), 1, t, { w: 4, seed: 5 });
  eye(ctx, t, 0);
  eye(ctx, t, 1);

  // the spoolie: brushes along each brow, lifting hairs as it passes
  const brushL = seg(t, 4.4, 5.1, ease.inOut), brushR = seg(t, 5.1, 5.8, ease.inOut);
  const brushX = t < 5.1 ? lerp(700, 330, brushL) : lerp(900, 1270, brushR);
  const brushing = t >= 4.3 && t < 5.9;
  const lift = (x) => (brushing ? Math.max(0, 1 - Math.abs(x - brushX) / 90) : 0);
  brow(ctx, t, 0, lift);
  brow(ctx, t, 1, lift);

  // guide lines left by the string; wiped off by the cotton pad at the end
  const wipe = seg(t, 6.0, 7.3, ease.inOut);
  const padX = lerp(150, 1450, wipe);
  const N1 = [732, 820], N2 = [868, 820]; // sides of the nose
  const lines = [
    [[CX, 150], [CX, 900], 0.3],
    [[688, 860], [688, 260], 1.1], [[912, 860], [912, 260], 1.1],
    [N1, [440, 270], 1.9], [N2, [1160, 270], 1.9],
    [N1, [300, 330], 2.7], [N2, [1300, 330], 2.7],
    [[300, 336], [1300, 336], 3.5], [[300, 436], [1300, 436], 3.9],
  ];
  lines.forEach(([a, b, t0], i) => {
    const drawn = seg(t, t0 + 0.42, t0 + 0.5);
    if (drawn <= 0) return;
    // the pad erases each line as it sweeps past
    const gone = Math.min(1, Math.max(0, (padX - Math.min(a[0], b[0]) + 40) / (Math.abs(a[0] - b[0]) + 80)));
    const alpha = drawn * (t >= 6.0 ? 1 - gone : 1);
    if (alpha > 0.01) stroke(ctx, line(a[0], a[1], b[0], b[1], 24), 1, t, { w: 3.5, color: MARK, seed: 200 + i, alpha: 0.95 * alpha });
  });
  lines.forEach(([a, b, t0], i) => snap(ctx, t, a, b, t0, 300 + i * 2));

  if (brushing) {
    const y = t < 5.1 ? lerp(410, 380, brushL) : lerp(410, 380, brushR);
    const dir = t < 5.1 ? 1 : -1;
    const head = rotate(rrect(brushX - 16, y - 70, 32, 90, 14), brushX, y, 0.2 * dir);
    fill(ctx, head, '#2A2622', 0.9);
    for (let k = 0; k < 9; k++) {
      const yy = y - 64 + k * 10;
      stroke(ctx, rotate([[brushX - 20, yy], [brushX + 20, yy + 4]], brushX, y, 0.2 * dir), 1, t, { w: 3, color: '#2A2622', seed: 400 + k });
    }
    shape(ctx, rotate(rrect(brushX - 7, y - 380, 14, 310, 7), brushX, y, 0.2 * dir), t, { fillColor: '#FFFFFF', w: 4, seed: 410 });
  }

  // cotton pad wiping the map away
  if (t > 5.9 && t < 7.4) {
    const k = seg(t, 5.9, 6.1) * (1 - seg(t, 7.25, 7.4));
    ctx.save();
    ctx.globalAlpha *= k;
    const y = 470 + Math.sin(wipe * TAU * 2) * 90;
    shape(ctx, ellipse(padX, y, 78, 78), t, { fillColor: '#FFFFFF', w: 4, seed: 420 });
    stroke(ctx, ellipse(padX, y, 56, 56), 1, t, { w: 2, color: '#E5DED4', seed: 421 });
    ctx.restore();
  }

  spool(ctx, t);

  const say = (text, a, b) => {
    const k = seg(t, a, a + 0.3) * (1 - seg(t, b - 0.3, b));
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= k;
      write(ctx, text, 800, 210, 1, t, { size: 52, rot: 0 });
      ctx.restore();
    }
  };
  say('mapped to your face: start, arch, tail', 0.4, 4.3);
  say('brushed up along the map', 4.3, 5.9);
  say('lines wiped away', 5.9, 7.5);
  void translate;
}
