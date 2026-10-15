// Yoni steam, the setup itself: a wooden steam stool with a cushioned ring seat,
// a pot of hot water and herbs (rose petals, lavender, greens) underneath, steam
// rising up through the opening; a bowl of dried herbs, a folded robe and a
// candle beside it. Steam wisps rise on staggered phases of the loop, herbs bob
// and the candle flickers in whole cycles, so the loop has no seam. Tools only.
//
// References: wooden yoni steam stools (U/ring seat, four legs, rails), ring
// cushions, steam pots with herbs, steam robes.

import {
  INK, MUTED, WOOD, TAU,
  stroke, fill, shape, spline, line, arc, ellipse, rrect, write, lerp, wave, phase,
} from './doodle.js';

export const DURATION = 8;
const STEAM = '#B9AEA2';

function stool(ctx, t) {
  // back legs first (slightly inset), then rails, then front legs and the seat
  shape(ctx, rrect(612, 400, 34, 380, 10), t, { fillColor: '#D9B985', w: 5, seed: 1 });
  shape(ctx, rrect(954, 400, 34, 380, 10), t, { fillColor: '#D9B985', w: 5, seed: 2 });
  shape(ctx, rrect(560, 650, 480, 26, 10), t, { fillColor: '#D9B985', w: 4, seed: 3 });
  shape(ctx, rrect(530, 410, 44, 420, 12), t, { fillColor: WOOD, w: 5, seed: 4 });
  shape(ctx, rrect(1026, 410, 44, 420, 12), t, { fillColor: WOOD, w: 5, seed: 5 });
  shape(ctx, rrect(560, 700, 480, 28, 10), t, { fillColor: WOOD, w: 4, seed: 6 });
  // seat board
  shape(ctx, rrect(490, 360, 620, 64, 22), t, { fillColor: WOOD, w: 6, seed: 7 });
  stroke(ctx, spline([[520, 392], [700, 386], [900, 394], [1080, 388]], 6), 1, t, { w: 2, color: '#C9A877', seed: 8 });
}

function cushion(ctx, t) {
  // ring cushion (seen from the front, so a flattened torus) with the opening
  shape(ctx, ellipse(800, 350, 230, 50), t, { fillColor: '#B48BD6', w: 5, seed: 20 });
  fill(ctx, ellipse(800, 344, 90, 18), '#6F4E8F');
  stroke(ctx, ellipse(800, 344, 90, 18), 1, t, { w: 4, seed: 21 });
  stroke(ctx, arc(800, 352, 200, 36, Math.PI * 0.1, Math.PI * 0.9, 16), 1, t, { w: 2, color: '#8E6AB0', seed: 22 });
}

function pot(ctx, t) {
  // ceramic steam pot with herb water, under the seat
  shape(ctx, spline([[650, 560], [660, 740], [700, 768], [900, 768], [940, 740], [950, 560]], 8), t, { fillColor: '#FFFFFF', w: 5, seed: 30 });
  shape(ctx, ellipse(800, 560, 150, 24), t, { fillColor: '#F1E4D1', w: 5, seed: 31 });
  fill(ctx, ellipse(800, 562, 130, 16), '#D9B66E', 0.85);
  // herbs floating, gently bobbing (whole cycles per loop)
  const herbs = [[730, 560, '#E58BA6'], [770, 566, '#7E8C5A'], [812, 558, '#9C7BC4'], [850, 566, '#E58BA6'], [880, 560, '#7E8C5A']];
  herbs.forEach(([x, y, c], i) => {
    const bob = wave(t, DURATION, 2, i * 0.2) * 2.5;
    fill(ctx, ellipse(x, y + bob, 14, 6), c);
    stroke(ctx, ellipse(x, y + bob, 14, 6), 1, t, { w: 2, color: INK, seed: 40 + i });
  });
  shape(ctx, rrect(636, 600, 22, 40, 8), t, { fillColor: '#FFFFFF', w: 4, seed: 33 });
  shape(ctx, rrect(942, 600, 22, 40, 8), t, { fillColor: '#FFFFFF', w: 4, seed: 34 });
}

function steam(ctx, t) {
  // wisps rise from the pot through the seat opening and above it
  const WISPS = 7;
  // hidden inside the seat, so the steam reads as rising through the opening
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1600, 332);
  ctx.rect(0, 426, 1600, 474);
  ctx.clip();
  for (let k = 0; k < WISPS; k++) {
    const ph = phase(t, DURATION, k / WISPS);
    const x0 = 720 + ((k * 37) % 160);
    const yStart = 560 - ph * 420;
    const len = 170;
    const pts = [];
    for (let j = 0; j <= 14; j++) {
      const y = yStart - (j / 14) * len;
      const sway = Math.sin(j * 0.6 + ph * TAU * 1 + k) * (8 + j * 1.8);
      pts.push([x0 + sway, y]);
    }
    const alpha = Math.sin(Math.PI * ph); // fades in at the pot and out at the top
    stroke(ctx, pts, 1, t, { w: 5, color: STEAM, seed: 60 + k, alpha: 0.9 * alpha });
  }
  ctx.restore();
}

export function draw(ctx, t) {
  // floor and rug
  stroke(ctx, line(0, 830, 1600, 830, 30), 1, t, { w: 4, color: MUTED, seed: 100 });
  shape(ctx, spline([[300, 800], [1300, 800], [1360, 870], [240, 870]], 4), t, { fillColor: '#EFE2CE', w: 4, seed: 101 });
  for (let i = 0; i < 9; i++) stroke(ctx, line(330 + i * 115, 812, 310 + i * 120, 860, 3), 1, t, { w: 2, color: '#D3BFA3', seed: 102 + i });

  // the steam goes behind the seat first, then the seat and cushion over it
  pot(ctx, t);
  stool(ctx, t);
  steam(ctx, t);
  cushion(ctx, t);

  // bowl of dried herbs
  shape(ctx, spline([[190, 760], [210, 812], [330, 812], [350, 760]], 6), t, { fillColor: '#C9A877', w: 5, seed: 110 });
  stroke(ctx, line(190, 760, 350, 760, 6), 1, t, { w: 5, seed: 111 });
  [[220, 750, '#E58BA6'], [250, 744, '#9C7BC4'], [282, 750, '#7E8C5A'], [312, 744, '#E58BA6'], [266, 736, '#9C7BC4']].forEach(([x, y, c], i) => {
    fill(ctx, ellipse(x, y, 16, 8), c);
    stroke(ctx, ellipse(x, y, 16, 8), 1, t, { w: 2, seed: 112 + i });
  });
  // folded robe
  shape(ctx, rrect(1180, 724, 250, 48, 14), t, { fillColor: '#FFFFFF', w: 5, seed: 120 });
  shape(ctx, rrect(1196, 684, 220, 44, 14), t, { fillColor: '#F4ECF8', w: 5, seed: 121 });
  stroke(ctx, line(1210, 704, 1400, 704, 6), 1, t, { w: 2, color: '#D9C9E6', seed: 122 });
  // candle with a flame that flickers in whole cycles
  shape(ctx, rrect(1460, 720, 60, 92, 10), t, { fillColor: '#FBF4E6', w: 5, seed: 130 });
  stroke(ctx, line(1490, 720, 1490, 706, 2), 1, t, { w: 3, seed: 131 });
  const fl = 1 + wave(t, DURATION, 12) * 0.12 + wave(t, DURATION, 19, 0.3) * 0.08;
  fill(ctx, spline([[1490, 704], [1478, 690], [1490, 704 - 34 * fl], [1502, 690], [1490, 704]], 4), '#F6C35B');
  fill(ctx, spline([[1490, 704], [1484, 694], [1490, 704 - 18 * fl], [1496, 694], [1490, 704]], 4), '#FFF1CC');

  write(ctx, 'warm herbal steam · a quiet hour for you', 800, 90, 1, t, { size: 52, rot: 0 });
  void lerp;
}
