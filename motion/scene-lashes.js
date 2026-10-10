// Classic lash extensions, close up from the head of the bed (the artist's view):
// lower lashes taped under a white gel pad, upper natural lashes lying over it.
// A straight isolation tweezer parts the lashes to isolate ONE natural lash, an
// L-shaped tweezer brings in an extension, bonds it a little above the lash
// line (never on the skin) and lets go. Then the view slides one lash along to
// the next, so the last frame is the first frame of the next lash: a perfect loop.
// Tools only, no hands.
//
// References: isolation tweezers (straight, fine tips), L/curved placement
// tweezers, under-eye gel pads, extension length ~2x the natural lash.

import {
  INK, MUTED, SKIN, SKIN_SHADE, TAU,
  stroke, fill, shape, spline, line, bezier, lerp, seg, ease, write,
} from './doodle.js';

export const DURATION = 8;
const S = 110; // spacing between natural lashes (world px); the view pans one lash per loop
const XC = S * 7; // the lash being worked on (screen x at t=0), on the lash grid
const T = {
  isoIn: [0.2, 1.0],
  placeIn: [1.0, 2.2],
  bond: [2.2, 3.6],
  release: [3.6, 4.0],
  placeOut: [4.0, 4.8],
  isoOut: [4.4, 5.0],
  pan: [5.2, 7.5],
};

// Gentle waviness repeats every S, the distance panned per loop, so the seam lines up.
const lashY = (wx) => 360 + 3 * Math.sin((TAU * wx) / S);
const lidCrease = (wx) => 170 + 4 * Math.sin((TAU * wx) / S + 1);
const padTop = (wx) => lashY(wx) + 26;

/** A lash as a curve from its root: natural lashes short, extensions long and bold. */
function lashCurve(x, y, len, lean, curl) {
  return bezier([x, y], [x + lean * 0.3, y + len * 0.45], [x + lean * 0.8 + curl, y + len * 0.85], [x + lean + curl * 1.6, y + len], 10);
}

/** Straight tweezer: two long blades from `from` to tips near `to`, tips `gap` apart. */
function tweezerStraight(ctx, t, tipX, tipY, ang, gap, seed) {
  const L = 560;
  const dx = Math.cos(ang), dy = Math.sin(ang); // direction from tip back to the handle
  const nx = -dy, ny = dx;
  const back = [tipX + dx * L, tipY + dy * L];
  const a = [[tipX + nx * gap * 0.5, tipY + ny * gap * 0.5], [back[0] + nx * 26, back[1] + ny * 26]];
  const b = [[tipX - nx * gap * 0.5, tipY - ny * gap * 0.5], [back[0] - nx * 26, back[1] - ny * 26]];
  // blades as thin filled wedges
  fill(ctx, [a[0], a[1], [a[1][0] + nx * 22, a[1][1] + ny * 22], [a[0][0] + nx * 4, a[0][1] + ny * 4]], '#3A3530');
  fill(ctx, [b[0], b[1], [b[1][0] - nx * 22, b[1][1] - ny * 22], [b[0][0] - nx * 4, b[0][1] - ny * 4]], '#3A3530');
  stroke(ctx, [a[0], a[1]], 1, t, { w: 3, seed, color: INK });
  stroke(ctx, [b[0], b[1]], 1, t, { w: 3, seed: seed + 1, color: INK });
  stroke(ctx, [[a[0][0] + dx * 260 + nx * 10, a[0][1] + dy * 260 + ny * 10], [a[0][0] + dx * 360 + nx * 12, a[0][1] + dy * 360 + ny * 12]], 1, t, { w: 2, color: '#C9C2B8', seed: seed + 2 });
}

/** L-shaped placement tweezer: long handle, a bend, and short angled tips. */
function tweezerL(ctx, t, tipX, tipY, seed) {
  // tips point down-left; the bend sits up-right of the tips, the handle runs to the top-right corner
  const bend = [tipX + 40, tipY - 56];
  const end = [bend[0] + 480, bend[1] - 420];
  const blade = (off, s) => {
    const pts = [[tipX + off, tipY], [bend[0] + off, bend[1] + off * 0.4], [end[0] + off * 2.4, end[1] + off * 1.4]];
    fill(ctx, [...pts, ...pts.slice().reverse().map(([x, y]) => [x + 14, y + 10])], '#B8924A');
    stroke(ctx, pts, 1, t, { w: 3, seed: s, color: INK });
  };
  blade(-8, seed);
  blade(8, seed + 1);
}

export function draw(ctx, t) {
  const pan = S * seg(t, T.pan[0], T.pan[1], ease.inOut);
  const sx = (wx) => wx - pan;
  const cur = XC; // world x of the lash being worked on this loop

  // eyelid skin above the lash line, gel pad below
  const lid = [], pad = [], crease = [];
  for (let x = -40; x <= 1640; x += 16) {
    lid.push([x, lashY(x + pan)]);
    pad.push([x, padTop(x + pan)]);
    crease.push([x, lidCrease(x + pan)]);
  }
  fill(ctx, [[-40, 0], [1640, 0], ...lid.slice().reverse()], SKIN);
  fill(ctx, [...crease, [1640, 0], [-40, 0]], SKIN_SHADE, 0.35);
  stroke(ctx, crease, 1, t, { w: 4, color: MUTED, seed: 1 });
  fill(ctx, [...pad, [1640, 900], [-40, 900]], '#FFFFFF');
  stroke(ctx, pad, 1, t, { w: 4, color: MUTED, seed: 2 });
  stroke(ctx, lid, 1, t, { w: 9, seed: 3 });
  // gel pad edge detail
  stroke(ctx, pad.map(([x, y]) => [x, y + 26]), 1, t, { w: 2, color: '#E6E0D8', seed: 4 });

  // which neighbours the isolation tweezer is pushing aside
  const iso = seg(t, T.isoIn[0] + 0.4, T.isoIn[1]) * (1 - seg(t, T.isoOut[0], T.isoOut[1]));

  // natural lashes, and extensions on every lash already done (world x < current,
  // plus the current one once it has been bonded)
  const bonded = seg(t, T.bond[0], T.bond[0] + 0.3);
  for (let wx = Math.floor((pan - 200) / S) * S; wx < pan + 1800; wx += S) {
    const x = sx(wx), y = lashY(wx);
    const k = Math.round(wx / S);
    const spread = wx === cur - S ? -1 : wx === cur + S ? 1 : 0;
    const push = spread * iso * 46;
    for (let j = -1; j <= 1; j++) {
      // a few natural lashes per follicle group, slightly fanned
      // every group is drawn the same (the pan is one group per loop, so any
      // per-group variation would show as a jump at the seam); the boiling line
      // keeps them from looking copy-pasted
      const lx = x + j * 30;
      const len = j === 0 ? 200 : 176 + j * 8;
      const lean = (lx - 800) * 0.05 + j * 6 + push;
      if (j === 0) {
        // the main lash of the group is the one that gets an extension
        const done = wx < cur || (wx === cur && t >= T.bond[0]);
        // the isolated lash: a soft honey highlight while it's held apart
        if (wx === cur && iso > 0.01) {
          stroke(ctx, lashCurve(lx, y + 2, len, lean, 10), 1, t, { w: 18, seed: 90, color: '#F6C35B', alpha: 0.55 * iso });
        }
        stroke(ctx, lashCurve(lx, y + 2, len, lean, 10), 1, t, { w: 4.4, seed: 100 + k * 3 + j, color: '#2B231C' });
        if (done) {
          const a = wx === cur ? bonded : 1;
          stroke(ctx, lashCurve(lx + 1, y + 16, 360, lean * 1.6 + 12, 26), 1, t, { w: 8, seed: 300 + k, color: INK, alpha: a });
        }
      } else {
        stroke(ctx, lashCurve(lx, y + 2, len * 0.9, lean, 8), 1, t, { w: 3.6, seed: 100 + k * 3 + j, color: '#2B231C' });
      }
    }
  }

  // ── isolation tweezer (left hand side): parts the lashes either side of the target ──
  const isoK = seg(t, T.isoIn[0], T.isoIn[1], ease.out) * (1 - seg(t, T.isoOut[0], T.isoOut[1], ease.in));
  if (isoK > 0.001) {
    const tipX = lerp(-160, sx(cur) - 2, isoK), tipY = lerp(40, lashY(cur) + 150, isoK);
    tweezerStraight(ctx, t, tipX, tipY, -2.3, 40 + iso * 70, 400);
  }

  // ── placement tweezer (right hand side) with an extension in its tips ──
  const inK = seg(t, T.placeIn[0], T.placeIn[1], ease.inOut);
  const outK = seg(t, T.placeOut[0], T.placeOut[1], ease.inOut);
  const target = [sx(cur) + 52, lashY(cur) + 190];
  const parked = [1720, -160];
  const pos = t < T.placeOut[0] ? [lerp(parked[0], target[0], inK), lerp(parked[1], target[1], inK)] : [lerp(target[0], parked[0], outK), lerp(target[1], parked[1], outK)];
  // a slight settle while the bond takes
  const settle = Math.sin(TAU * 2 * seg(t, T.bond[0], T.bond[1])) * 3 * (1 - seg(t, T.bond[1] - 0.2, T.bond[1]));
  if (inK > 0.001 && outK < 0.999) {
    const holding = t < T.release[0];
    if (holding) {
      // extension held at mid-length, a drop of adhesive on its base
      const ex = sx(cur) + 1 + (pos[0] - target[0]), ey = lashY(cur) + 16 + (pos[1] - target[1]) + settle;
      stroke(ctx, lashCurve(ex, ey, 360, 12, 26), 1, t, { w: 8, seed: 500, color: INK });
      fill(ctx, [[ex - 6, ey - 4], [ex + 6, ey - 4], [ex + 5, ey + 12], [ex - 5, ey + 12]], '#F4F1EA', 0.95);
    }
    tweezerL(ctx, t, pos[0], pos[1] + settle, 600);
  }

  // what's happening
  const say = (text, a, b) => {
    const k = seg(t, a, a + 0.3) * (1 - seg(t, b - 0.3, b));
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= k;
      write(ctx, text, 800, 846, 1, t, { size: 50, rot: 0 });
      ctx.restore();
    }
  };
  say('isolate one natural lash', 0.4, 2.2);
  say('one extension, bonded just above the lash line', 2.2, 4.6);
  say('→ on to the next lash', 4.8, 7.6);
  void line;
  void shape;
  void spline;
}
