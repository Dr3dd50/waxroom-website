// Plasma hair restoration, looking down along a parting: the clear glass bulb
// applicator (violet plasma arcing inside) glides along the part, close to the
// scalp, while the head moves steadily beneath it. The pan runs at a constant
// speed and the hair repeats every P, so the loop has no seam. Tools only.
//
// References: plasma scalp treatment photos — clear glass mushroom/bulb
// applicator on a dark handle, violet arcs inside, run along the hair part.

import {
  MUTED, SKIN, SKIN_SHADE, PLASMA, TAU,
  stroke, fill, shape, spline, ellipse, rrect, rotate, translate, write, lerp, wave,
} from './doodle.js';

export const DURATION = 8;
const P = 432; // the scalp moves this far per loop, at a constant speed
const PART_Y = 470;
const HAIR = '#3B2A1E';
const STEP = 12;

function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
// how wide the part shows scalp: a little thinner in places, repeating every P
const partW = (wx) => 16 + 10 * (0.5 + 0.5 * Math.sin((TAU * wx) / P));

export function draw(ctx, t) {
  const pan = (P * t) / DURATION; // constant speed → seamless
  const sx = (wx) => wx - pan;

  // hair mass on both sides of the part, scalp showing along it
  fill(ctx, [[0, 0], [1600, 0], [1600, 900], [0, 900]], '#5A4130');
  const top = [], bot = [];
  for (let x = -20; x <= 1620; x += 12) {
    top.push([x, PART_Y - partW(x + pan)]);
    bot.push([x, PART_Y + partW(x + pan)]);
  }
  fill(ctx, [...top, ...bot.slice().reverse()], SKIN);
  fill(ctx, [...top, ...top.slice().reverse().map(([x, y]) => [x, y + 8])], SKIN_SHADE, 0.6);

  // strands, combed away from the part
  for (let wx = Math.floor((pan - 60) / STEP) * STEP; wx < pan + 1700; wx += STEP) {
    const i = ((Math.round(wx / STEP) % 36) + 36) % 36;
    for (const side of [-1, 1]) {
      const x = sx(wx) + hash(i, side) * 8;
      const y0 = PART_Y + side * partW(wx);
      const L = 380 + hash(side, i) * 120;
      const sway = (hash(i + 7, side) - 0.5) * 120;
      const pts = spline([[x, y0], [x + sway * 0.2, y0 + side * L * 0.35], [x + sway * 0.6, y0 + side * L * 0.7], [x + sway, y0 + side * L]], 6);
      stroke(ctx, pts, 1, t, { w: 3, color: hash(i, side + 3) > 0.7 ? '#7A5A42' : HAIR, seed: i * 2 + (side > 0 ? 1 : 0) });
    }
  }

  // the treated stretch just behind the bulb keeps a fading violet warmth
  const bx = 820, by = PART_Y;
  for (let k = 12; k >= 1; k--) {
    const x = bx - k * 34;
    ctx.save();
    ctx.globalAlpha *= (1 - k / 13) * 0.22;
    const g = ctx.createRadialGradient(x, by, 2, x, by, 50);
    g.addColorStop(0, PLASMA);
    g.addColorStop(1, 'rgba(155,123,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, by - 60, 120, 120);
    ctx.restore();
  }

  // glow where the bulb meets the scalp
  ctx.save();
  const glow = ctx.createRadialGradient(bx, by, 4, bx, by, 110);
  glow.addColorStop(0, 'rgba(200,184,255,0.9)');
  glow.addColorStop(0.5, 'rgba(155,123,255,0.35)');
  glow.addColorStop(1, 'rgba(155,123,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx - 120, by - 120, 240, 240);
  ctx.restore();

  // the applicator: clear glass bulb on a dark handle running off to the top-right
  // handle leaves the top of the dome toward the top-right corner
  const attach = [bx + 52, by - 92];
  const place = (pts) => translate(rotate(pts, 0, 0, 0.64), attach[0], attach[1]);
  shape(ctx, place(rrect(-26, -600, 52, 560, 24)), t, { fillColor: '#2A2622', w: 5, seed: 300 });
  shape(ctx, place(rrect(-34, -50, 68, 54, 12)), t, { fillColor: '#B9B2A8', w: 5, seed: 301 });
  // glass dome
  ctx.save();
  ctx.globalAlpha *= 0.35;
  fill(ctx, ellipse(bx, by - 30, 92, 74), '#E9E4FF');
  ctx.restore();
  stroke(ctx, ellipse(bx, by - 30, 92, 74), 1, t, { w: 5, seed: 302, color: '#8E86A8' });
  stroke(ctx, ellipse(bx, by + 30, 70, 16), 1, t, { w: 4, seed: 303, color: '#8E86A8' });
  stroke(ctx, spline([[bx - 60, by - 70], [bx - 40, by - 86], [bx - 12, by - 92]], 4), 1, t, { w: 4, seed: 304, color: '#FFFFFF' });
  // violet arcs inside the glass, from the electrode to the rim
  for (let k = 0; k < 6; k++) {
    const a0 = (TAU * k) / 6 + wave(t, DURATION, 16, k * 0.13) * 0.6;
    const r = 70;
    const pts = [[bx, by - 30]];
    for (let j = 1; j <= 4; j++) {
      const rr = (r * j) / 4;
      const jitter = wave(t, DURATION, 40 + k * 3, j * 0.21 + k * 0.07) * 9;
      pts.push([bx + Math.cos(a0) * rr + jitter, by - 30 + Math.sin(a0) * rr * 0.8 - jitter * 0.4]);
    }
    stroke(ctx, pts, 1, t, { w: 2.6, color: '#8E6CF5', seed: 320 + k });
  }
  fill(ctx, ellipse(bx, by - 30, 10, 10), '#CFC3FF');

  write(ctx, 'plasma along the part · no needles, no surgery', 800, 852, 1, t, { size: 50, rot: 0, color: '#F8F1E7' });
  void MUTED;
  void lerp;
}
