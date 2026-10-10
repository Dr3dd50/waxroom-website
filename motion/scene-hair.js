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
  INK, line,
} from './doodle.js';
import { zoomLoop } from './camera.js';

// The close-up's own loop; the full video adds a zoom in and out around it.
const CLOSE = 8;
export const DURATION = 10;
export const POSTER = 0; // the wide shot
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

/** The applicator: clear glass bulb on a dark handle running off to the top-right. */
function applicator(ctx, t, bx, by) {
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
    const a0 = (TAU * k) / 6 + wave(t, CLOSE, 16, k * 0.13) * 0.6;
    const r = 70;
    const pts = [[bx, by - 30]];
    for (let j = 1; j <= 4; j++) {
      const rr = (r * j) / 4;
      const jitter = wave(t, CLOSE, 40 + k * 3, j * 0.21 + k * 0.07) * 9;
      pts.push([bx + Math.cos(a0) * rr + jitter, by - 30 + Math.sin(a0) * rr * 0.8 - jitter * 0.4]);
    }
    stroke(ctx, pts, 1, t, { w: 2.6, color: '#8E6CF5', seed: 320 + k });
  }
  fill(ctx, ellipse(bx, by - 30, 10, 10), '#CFC3FF');

}

function drawClose(ctx, t) {
  const pan = (P * t) / CLOSE; // constant speed → seamless
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

  applicator(ctx, t, bx, by);

  write(ctx, 'plasma along the part · no needles, no surgery', 800, 852, 1, t, { size: 50, rot: 0, color: '#F8F1E7' });
  void MUTED;
  void lerp;
}

// ── wide shot: looking down on the client's head, nose to the right, the part
// running front to back, with the applicator resting on it ──
const ZOOM = 4.5;
const HEAD = [800, 440, 215, 170]; // centre and radii of the head seen from above
const TARGET = [790, HEAD[1] - (PART_Y - 450) / ZOOM];

// The skull from above is an egg: broad at the crown (left), narrower at the forehead.
const headHalf = (u) => HEAD[3] * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.14 * u);
const headOutline = () => Array.from({ length: 73 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  return [HEAD[0] + HEAD[2] * Math.cos(a), HEAD[1] + HEAD[3] * Math.sin(a) * (1 - 0.14 * Math.cos(a))];
});

function drawWide(ctx, t) {
  const [hx, hy, rx, ry] = HEAD;
  // shoulders under the salon cape, ears and the tip of the nose past the hair
  shape(ctx, rrect(626, hy - 380, 270, 760, 120), t, { fillColor: '#E3DCD2', w: 5 });
  stroke(ctx, spline([[690, hy - 300], [720, hy - 190]], 3), 1, t, { w: 3, color: MUTED });
  stroke(ctx, spline([[690, hy + 300], [720, hy + 190]], 3), 1, t, { w: 3, color: MUTED });
  shape(ctx, ellipse(830, hy - headHalf(30 / rx) + 4, 26, 16), t, { fillColor: SKIN_SHADE, w: 4 });
  shape(ctx, ellipse(830, hy + headHalf(30 / rx) - 4, 26, 16), t, { fillColor: SKIN_SHADE, w: 4 });
  shape(ctx, ellipse(hx + rx + 2, hy, 22, 18), t, { fillColor: SKIN, w: 4 });
  shape(ctx, headOutline(), t, { fillColor: '#5A4130', w: 6 });
  // hair combed out from the part to either side
  ctx.save();
  ctx.beginPath();
  headOutline().forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.clip();
  for (let x = hx - rx + 12; x < hx + rx - 10; x += 12) {
    const u = (x - hx) / rx;
    const half = headHalf(u) - 6;
    for (const side of [-1, 1]) {
      const pts = spline([[x, hy + side * 4], [x - 4, hy + side * half * 0.55], [x - 22 * (1 - u * u) - 6, hy + side * half]], 4);
      stroke(ctx, pts, 1, t, { w: 2.2, color: ((x * 7) % 5) > 3 ? '#7A5A42' : HAIR });
    }
  }
  ctx.restore();
  stroke(ctx, line(hx - rx + 30, hy, hx + rx - 24, hy, 12), 1, t, { w: 6, color: SKIN });
  stroke(ctx, headOutline(), 1, t, { w: 6, color: INK });

  // the applicator, drawn as in the close-up and shrunk to this scale
  ctx.save();
  ctx.translate(TARGET[0] - 800 / ZOOM, TARGET[1] - 450 / ZOOM);
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  const glow = ctx.createRadialGradient(820, PART_Y, 4, 820, PART_Y, 110);
  glow.addColorStop(0, 'rgba(200,184,255,0.9)');
  glow.addColorStop(1, 'rgba(155,123,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(700, PART_Y - 120, 240, 240);
  applicator(ctx, 0, 820, PART_Y);
  ctx.restore();
  write(ctx, 'hair restoration', 1210, 760, 1, t, { size: 46, color: MUTED, rot: 0 });
}

export function draw(ctx, t) {
  zoomLoop(ctx, t, { duration: DURATION, closeDuration: CLOSE, target: TARGET, zoom: ZOOM, wide: drawWide, close: drawClose });
}
