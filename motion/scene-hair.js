// Jet Plasma hair restoration, looking down on a thinning part: the handpiece's
// flat nozzle glides along the part, lifts away, and the hair grows back in: the
// part narrows, new hairs sprout and lengthen and the scalp stops showing
// through. The handpiece then comes back to where it started. The close-up sits
// inside a zoom from the whole head, which is the same at both ends, so the
// video loops seamlessly. Tools only.
//
// References: The Wax Room's Jet Plasma handpiece (their facial video) and their
// hair restoration before/after (a thin, wide part on the crown filling in).

import {
  SKIN, SKIN_SHADE, PLASMA, TAU,
  stroke, fill, shape, spline, ellipse, rrect, write, lerp, seg, ease, clamp,
  MUTED, INK, line,
} from './doodle.js';
import { zoomLoop } from './camera.js';
import { plasmaHandpiece, plasmaGlow } from './plasma-device.js';

// The close-up's own timeline; the full video adds a zoom in and out around it.
const CLOSE = 8;
export const DURATION = 10;
export const POSTER = 0; // the wide shot
const PART_Y = 470;
const HAIR = '#3B2A1E';
// what shows under the strands: scalp through thin hair, then the hair filling in
const THIN = '#94735A', FULL = '#64493A';
const STEP = 12;
const PASS = { from: 250, to: 1350, y: 482 }; // the nozzle's run along the part
const T = { glide: [0.3, 4.6], lift: [4.6, 5.2], grow: [5.0, 7.0], back: [7.0, 7.9] };

function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
/** Regrowth at screen x and time t: 0 thin, 1 full. It follows the pass, left to right. */
const grown = (x, t) => ease.inOut(clamp((t - T.grow[0] - (x / 1600) * 0.5) / (T.grow[1] - T.grow[0] - 0.5)));
// how much scalp the part shows: wide while thin, narrow once grown, a little uneven
const partW = (x, g) => lerp(50, 12, g) + 6 * (0.5 + 0.5 * Math.sin((TAU * x) / 432));

/** Where the nozzle is at close-up time t (null while it's away from the scalp). */
function nozzleAt(t) {
  const away = [1900, -300];
  if (t < T.lift[0]) return { pos: [lerp(PASS.from, PASS.to, seg(t, ...T.glide)), PASS.y], on: true };
  if (t < T.back[0]) {
    const k = seg(t, ...T.lift, ease.in);
    return { pos: [lerp(PASS.to, away[0], k), lerp(PASS.y, away[1], k)], on: false };
  }
  const k = seg(t, ...T.back, ease.out);
  return { pos: [lerp(away[0], PASS.from, k), lerp(away[1], PASS.y, k)], on: k > 0.98 };
}

/** The handpiece with its nozzle at (x, y), its body running off to the top-right. */
function applicator(ctx, t, [x, y], on) {
  if (on) plasmaGlow(ctx, t, x, y, { loop: CLOSE, size: 1.2 });
  plasmaHandpiece(ctx, t, x, y, { angle: 0.64, scale: 0.8, cable: [[x + 440, y - 560], [x + 700, y - 700], [x + 1000, y - 760]] });
}

function drawClose(ctx, t) {
  // under the hair: scalp shows through while it's thin
  const under = ctx.createLinearGradient(0, 0, 1600, 0);
  under.addColorStop(0, lerpColor(THIN, FULL, grown(0, t)));
  under.addColorStop(1, lerpColor(THIN, FULL, grown(1600, t)));
  fill(ctx, [[0, 0], [1600, 0], [1600, 900], [0, 900]], under);
  const top = [], bot = [];
  for (let x = -20; x <= 1620; x += 12) {
    top.push([x, PART_Y - partW(x, grown(x, t))]);
    bot.push([x, PART_Y + partW(x, grown(x, t))]);
  }
  fill(ctx, [...top, ...bot.slice().reverse()], SKIN);
  fill(ctx, [...top, ...top.slice().reverse().map(([x, y]) => [x, y + 8])], SKIN_SHADE, 0.6);

  // strands, combed away from the part: one in three is there from the start,
  // the rest sprout at the part and lengthen as the hair grows in
  for (let n = -2; n * STEP < 1640; n++) {
    const i = ((n % 36) + 36) % 36;
    const regrowing = n % 3 !== 0;
    for (const side of [-1, 1]) {
      const x = n * STEP + hash(i, side) * 8;
      const g = grown(x, t);
      const k = regrowing ? clamp(g * 1.25 - hash(i + 3, side) * 0.25) : 1;
      if (k < 0.02) continue;
      const y0 = PART_Y + side * partW(x, g);
      const L = (380 + hash(side, i) * 120) * (regrowing ? lerp(0.05, 1, k) : 1);
      const sway = (hash(i + 7, side) - 0.5) * 120 * (regrowing ? k : 1);
      const pts = spline([[x, y0], [x + sway * 0.2, y0 + side * L * 0.35], [x + sway * 0.6, y0 + side * L * 0.7], [x + sway, y0 + side * L]], 6);
      stroke(ctx, pts, 1, t, { w: 3, color: hash(i, side + 3) > 0.7 ? '#7A5A42' : HAIR });
    }
  }

  // the treated stretch behind the nozzle keeps a violet warmth, fading once it lifts
  const noz = nozzleAt(t);
  const reach = t < T.lift[0] ? noz.pos[0] : PASS.to;
  const warm = 1 - seg(t, T.lift[0], T.grow[0] + 0.8);
  for (let x = PASS.from; x < reach && warm > 0; x += 30) {
    ctx.save();
    ctx.globalAlpha *= warm * 0.2 * clamp(1 - (reach - x) / 900, 0.25);
    const g = ctx.createRadialGradient(x, PART_Y, 2, x, PART_Y, 50);
    g.addColorStop(0, PLASMA);
    g.addColorStop(1, 'rgba(155,123,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, PART_Y - 60, 120, 120);
    ctx.restore();
  }

  applicator(ctx, t, noz.pos, noz.on);

  const say = (text, a, b) => {
    const k = seg(t, a, a + 0.3) * (1 - seg(t, b - 0.3, b));
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= k;
      write(ctx, text, 800, 852, 1, t, { size: 50, rot: 0, color: '#F8F1E7' });
      ctx.restore();
    }
  };
  say('Jet Plasma along a thinning part', 0, 4.8);
  say('follicles wake up → fuller hair over a series', 5.0, 8.2);
}

/** Mix two #rrggbb colours. */
function lerpColor(a, b, k) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',')})`;
}

// ── wide shot: looking down on the client's head, nose to the right, the part
// running front to back, with the applicator resting on it ──
// The close-up is the 1600×900 frame shrunk by ZOOM around TARGET: at 6× that patch
// (267×150) lies wholly inside the head, so every corner of the close-up is hair,
// as it is in the wide shot, and the zoom never shows the shoulders through it.
const ZOOM = 6;
const HEAD = [800, 440, 215, 170]; // centre and radii of the head seen from above
const TARGET = [800, HEAD[1] - (PART_Y - 450) / ZOOM];

// The skull from above is an egg: broad at the crown (left), narrower at the forehead.
const headHalf = (u) => HEAD[3] * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.14 * u);
const headOutline = () => Array.from({ length: 73 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  return [HEAD[0] + HEAD[2] * Math.cos(a), HEAD[1] + HEAD[3] * Math.sin(a) * (1 - 0.14 * Math.cos(a))];
});

function drawWide(ctx, t) {
  const [hx, hy, rx] = HEAD;
  // shoulders under the salon cape, ears and the tip of the nose past the hair
  shape(ctx, rrect(626, hy - 380, 270, 760, 120), t, { fillColor: '#E3DCD2', w: 5 });
  stroke(ctx, spline([[690, hy - 300], [720, hy - 190]], 3), 1, t, { w: 3, color: MUTED });
  stroke(ctx, spline([[690, hy + 300], [720, hy + 190]], 3), 1, t, { w: 3, color: MUTED });
  shape(ctx, ellipse(830, hy - headHalf(30 / rx) + 4, 26, 16), t, { fillColor: SKIN_SHADE, w: 4 });
  shape(ctx, ellipse(830, hy + headHalf(30 / rx) - 4, 26, 16), t, { fillColor: SKIN_SHADE, w: 4 });
  shape(ctx, ellipse(hx + rx + 2, hy, 22, 18), t, { fillColor: SKIN, w: 4 });
  // halfway between thin and full: the wide shot opens and closes the loop, and the close-up
  // starts thin and ends full, so it sits between the two
  shape(ctx, headOutline(), t, { fillColor: lerpColor(THIN, FULL, 0.5), w: 6 });
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
  // the part, as wide as the close-up shows it before the hair grows in
  stroke(ctx, line(hx - rx + 30, hy, hx + rx - 24, hy, 12), 1, t, { w: (2 * partW(800, 0)) / ZOOM, color: SKIN });
  stroke(ctx, headOutline(), 1, t, { w: 6, color: INK });

  // the handpiece, drawn as in the close-up and shrunk to this scale
  ctx.save();
  ctx.translate(TARGET[0] - 800 / ZOOM, TARGET[1] - 450 / ZOOM);
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  applicator(ctx, 0, nozzleAt(0).pos, true);
  ctx.restore();
  write(ctx, 'hair restoration', 1210, 760, 1, t, { size: 46, color: MUTED, rot: 0 });
}

export function draw(ctx, t) {
  zoomLoop(ctx, t, { duration: DURATION, closeDuration: CLOSE, target: TARGET, zoom: ZOOM, wide: drawWide, close: drawClose });
}
