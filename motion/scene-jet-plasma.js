// Jet Plasma facial, front-on: the client lies back on a pillow, face toward us
// (her chin toward the esthetician), headband on, eyes closed. The JETT plasma
// pen comes in from our side and glides its flat "shower" disc
// in slow circles over her cheek while a violet plasma glow crackles in the gap.
// Every motion completes a whole number of cycles per loop, so the last frame
// flows straight into the first.
//
// Reference: JETT Plasma Lift handpiece — thick white pen, dark display panel,
// rear cable, screw-on applicators (silver cones, gold needle, flat shower disc).

import {
  INK, HONEY, PLASMA, TAU,
  stroke, shape, spline, arc, rrect, rotate, translate, write, lerp, wave,
} from './doodle.js';
import { drawClient } from './face.js';

export const DURATION = 8;
const LAPS = 2; // circles the pen makes per loop

// Where the disc glides: her cheek on our right.
const CHEEK = { x: 892, y: 548, rx: 34, ry: 22 };

// Pen built pointing straight up from its tip at (0, 0), then rotated. It comes in
// from our side (lower right), the side the esthetician works from.
const PEN_ANGLE = 2.5;
function penParts(tipX, tipY) {
  const place = (pts) => translate(rotate(pts, 0, 0, PEN_ANGLE), tipX, tipY);
  return {
    disc: place(rrect(-46, -14, 92, 18, 8)),
    neck: place(rrect(-15, -58, 30, 46, 8)),
    collar: place(rrect(-26, -78, 52, 22, 8)),
    body: place(rrect(-32, -520, 64, 444, 30)),
    panel: place(rrect(-15, -250, 30, 120, 10)),
    tail: place([[0, -520]])[0],
    at: (x, y) => place([[x, y]])[0],
  };
}

export function draw(ctx, t) {
  const a = TAU * LAPS * (t / DURATION);
  const tipX = CHEEK.x + Math.cos(a) * CHEEK.rx;
  const tipY = CHEEK.y + Math.sin(a) * CHEEK.ry;

  drawClient(ctx, t);

  // glow trail where the disc has just passed (analytic, so the loop is seamless)
  for (let k = 9; k >= 1; k--) {
    const b = a - k * 0.18;
    const x = CHEEK.x + Math.cos(b) * CHEEK.rx, y = CHEEK.y + Math.sin(b) * CHEEK.ry;
    ctx.save();
    ctx.globalAlpha *= (1 - k / 10) * 0.2;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 40);
    g.addColorStop(0, PLASMA);
    g.addColorStop(1, 'rgba(155,123,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, y - 60, 120, 120);
    ctx.restore();
  }

  // the pen and its cable (off the bottom-right corner)
  const pen = penParts(tipX, tipY);
  const tail = pen.tail;
  stroke(ctx, spline([tail, [tail[0] + 40, tail[1] + 60], [1520, 860 + wave(t, DURATION, LAPS) * 10], [1640, 900]], 12), 1, t, { w: 7, seed: 80 });
  shape(ctx, pen.body, t, { fillColor: '#FFFFFF', w: 6, seed: 81 });
  shape(ctx, pen.panel, t, { fillColor: '#2A2622', w: 4, seed: 82 });
  // display: intensity "04" and a level meter that pulses 8 times per loop
  const lvl = 0.5 + 0.5 * (0.5 + 0.5 * wave(t, DURATION, 8));
  for (let i = 0; i < 5; i++) {
    const c0 = pen.at(-7, -150 - i * 13), c1 = pen.at(7, -150 - i * 13);
    stroke(ctx, [c0, c1], 1, t, { w: 5, color: i / 5 < lvl ? '#7DE3B0' : '#4A4440', seed: 83 + i });
  }
  const d = pen.at(0, -222);
  ctx.save();
  ctx.translate(d[0], d[1]);
  ctx.rotate(PEN_ANGLE + Math.PI / 2);
  ctx.fillStyle = '#7DE3B0';
  ctx.font = '600 26px Hand';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('04', 0, 0);
  ctx.restore();
  shape(ctx, pen.collar, t, { fillColor: '#D8D2CA', w: 5, seed: 88 });
  shape(ctx, pen.neck, t, { fillColor: '#B9B2A8', w: 5, seed: 89 });
  shape(ctx, pen.disc, t, { fillColor: '#F2EEE8', w: 5, seed: 90 });

  // plasma in the gap between disc and skin: a violet glow with crackling micro-arcs
  const under = pen.at(0, 10);
  ctx.save();
  const glow = ctx.createRadialGradient(under[0], under[1], 4, under[0], under[1], 64);
  glow.addColorStop(0, 'rgba(196,178,255,0.95)');
  glow.addColorStop(0.45, 'rgba(155,123,255,0.42)');
  glow.addColorStop(1, 'rgba(155,123,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(under[0] - 80, under[1] - 80, 160, 160);
  ctx.restore();
  for (let k = 0; k < 7; k++) {
    const s0 = pen.at(-36 + k * 12, 4);
    const e = pen.at(-36 + k * 12 + Math.sin(t * 50 + k * 3) * 5, 20);
    stroke(ctx, [s0, [lerp(s0[0], e[0], 0.5) + Math.sin(t * 70 + k) * 4, lerp(s0[1], e[1], 0.5)], e], 1, t, { w: 2.5, color: '#7B5CF0', seed: 100 + k });
  }


  write(ctx, 'Jet Plasma · no needles · no downtime', 800, 64, 1, t, { size: 50, color: INK, rot: 0 });
  stroke(ctx, arc(800, 30, 300, 14, Math.PI * 0.12, Math.PI * 0.88, 20).map(([x, y]) => [x, y + 64]), 1, t, { w: 4, color: HONEY, seed: 110 });
}
