// The Wax Room's Jet Plasma handpiece, drawn from their own treatment video:
// a chunky white body with a purple label and a small dark screen, a black cable
// plugged into the top, a slim white neck with a chrome button, a ribbed grey
// collar and a short flat nozzle that rests on the skin. Used for the facial and
// the hair restoration scenes.

import { TAU, stroke, shape, spline, rrect, ellipse, wave } from './doodle.js';

const BODY = spline([
  [-26, -262], [-62, -300], [-82, -360], [-86, -470], [-82, -580], [-58, -640], [0, -660],
  [58, -640], [82, -580], [86, -470], [82, -360], [62, -300], [26, -262],
], 6);

/**
 * Draw the handpiece with its nozzle face centred on (x, y).
 * @param angle  rotation (radians, clockwise) of the body away from straight up
 * @param scale  overall size; 1 is about 720 px from nozzle to cable boot
 * @param cable  points (in the same space as x, y) the cable runs through after the boot
 */
export function plasmaHandpiece(ctx, t, x, y, { angle = 0, scale = 1, cable = [] } = {}) {
  // cable first, from the boot out to wherever the caller routes it (world space)
  const toWorld = (px, py) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [x + (px * c - py * s) * scale, y + (px * s + py * c) * scale];
  };
  if (cable.length) {
    stroke(ctx, spline([toWorld(0, -720), toWorld(0, -800), ...cable], 12), 1, t, { w: 9 * Math.max(scale, 0.35), color: '#1F1A16' });
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  shape(ctx, rrect(-15, -724, 30, 70, 9), t, { fillColor: '#1F1A16', w: 5 }); // cable boot
  shape(ctx, BODY, t, { fillColor: '#FFFFFF', w: 6 });
  shape(ctx, rrect(-70, -560, 84, 150, 6), t, { fillColor: '#B24FD8', w: 4 }); // purple label
  shape(ctx, rrect(30, -566, 40, 160, 10), t, { fillColor: '#2A2622', w: 4 }); // screen
  stroke(ctx, [[40, -520], [50, -530], [60, -520]], 1, t, { w: 3, color: '#7DE3B0' });
  stroke(ctx, [[40, -490], [60, -490]], 1, t, { w: 3, color: '#7DE3B0' });
  shape(ctx, rrect(-26, -280, 52, 210, 20), t, { fillColor: '#FFFFFF', w: 5 }); // neck
  shape(ctx, ellipse(14, -176, 9, 15), t, { fillColor: '#C9CDD2', w: 4 }); // chrome button
  shape(ctx, rrect(-36, -82, 72, 52, 8), t, { fillColor: '#BDB7AF', w: 5 }); // ribbed collar
  for (let k = 0; k < 4; k++) stroke(ctx, [[-36, -70 + k * 11], [36, -70 + k * 11]], 1, t, { w: 3, color: '#8E877E' });
  shape(ctx, rrect(-32, -32, 64, 32, 6), t, { fillColor: '#F2EEE8', w: 5 }); // flat nozzle
  ctx.restore();
}

/**
 * The plasma where the nozzle meets the skin: a violet glow and crackling micro-arcs.
 * `loop` is the scene's loop length so the crackle is seamless.
 */
export function plasmaGlow(ctx, t, x, y, { loop, size = 1 } = {}) {
  ctx.save();
  const r = 70 * size;
  const glow = ctx.createRadialGradient(x, y, 4, x, y, r);
  glow.addColorStop(0, 'rgba(196,178,255,0.95)');
  glow.addColorStop(0.45, 'rgba(155,123,255,0.42)');
  glow.addColorStop(1, 'rgba(155,123,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
  for (let k = 0; k < 7; k++) {
    const a = (TAU * k) / 7;
    const j = wave(t, loop, 40 + k * 3, k * 0.17) * 5 * size;
    const s0 = [x + Math.cos(a) * 6 * size, y + Math.sin(a) * 4 * size];
    const e = [x + Math.cos(a) * 34 * size + j, y + Math.sin(a) * 18 * size - j * 0.5];
    stroke(ctx, [s0, [(s0[0] + e[0]) / 2 + j, (s0[1] + e[1]) / 2 - j], e], 1, t, { w: 2.5 * size, color: '#7B5CF0' });
  }
}
