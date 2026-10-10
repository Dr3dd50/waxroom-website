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
  INK, MUTED, HONEY, SKIN, SKIN_SHADE, PLASMA, TAU,
  stroke, fill, shape, spline, arc, ellipse, rrect, rotate, translate, write, lerp, wave,
} from './doodle.js';

export const DURATION = 8;
const LAPS = 2; // circles the pen makes per loop

const CX = 800; // face centre line
// Face outline: forehead at top (towards the pillow), chin at the bottom (towards us).
const FACE = spline([
  [CX, 236], [884, 246], [948, 290], [982, 370], [990, 450], [980, 540], [952, 620],
  [904, 684], [846, 722], [CX, 732], [754, 722], [696, 684], [648, 620], [620, 540],
  [610, 450], [618, 370], [652, 290], [716, 246], [CX, 236],
], 6);
const EAR_L = spline([[614, 440], [586, 430], [578, 476], [590, 524], [618, 536]], 5);
const EAR_R = spline([[986, 440], [1014, 430], [1022, 476], [1010, 524], [982, 536]], 5);
const NECK = [[700, 690], [690, 790], [910, 790], [900, 690]];
const PILLOW = spline([[430, 300], [520, 150], [800, 112], [1080, 150], [1170, 300], [1150, 640], [1040, 700], [560, 700], [450, 640], [430, 300]], 6);
// Hair spread on the pillow around the head.
const HAIR = [
  spline([[612, 420], [560, 340], [570, 240], [650, 172], [760, 150]], 6),
  spline([[988, 420], [1040, 340], [1030, 240], [950, 172], [840, 150]], 6),
  spline([[600, 500], [530, 420], [500, 320], [530, 220]], 6),
  spline([[1000, 500], [1070, 420], [1100, 320], [1070, 220]], 6),
  spline([[606, 560], [540, 560], [500, 500]], 5),
  spline([[994, 560], [1060, 560], [1100, 500]], 5),
  spline([[700, 168], [800, 156], [900, 168]], 5),
];
// Spa headband across the hairline.
const BAND = [
  ...spline([[628, 330], [700, 276], [800, 262], [900, 276], [972, 330]], 8),
  ...spline([[972, 330], [968, 372]], 2),
  ...spline([[968, 372], [900, 322], [800, 306], [700, 322], [632, 372]], 8),
  ...spline([[632, 372], [628, 330]], 2),
];

const BROW_L = spline([[676, 410], [712, 398], [758, 404]], 5);
const BROW_R = spline([[842, 404], [888, 398], [924, 410]], 5);
const EYE_L = spline([[680, 448], [704, 460], [736, 462], [760, 452]], 6);
const EYE_R = spline([[840, 452], [864, 462], [896, 460], [920, 448]], 6);
const NOSE = spline([[790, 432], [784, 500], [776, 548]], 5);
const NOSTRILS = [
  spline([[766, 556], [780, 566], [794, 562]], 4),
  spline([[806, 562], [820, 566], [834, 556]], 4),
];
const LIPS_TOP = spline([[748, 618], [776, 606], [800, 612], [824, 606], [852, 618]], 6);
const LIPS_MID = spline([[748, 620], [800, 626], [852, 620]], 6);
const LIPS_BOT = spline([[756, 624], [800, 648], [844, 624]], 6);
// The fine lines the treatment softens.
const LINES = [
  spline([[668, 452], [648, 446]], 2), spline([[668, 462], [648, 470]], 2), // crow's feet L
  spline([[932, 452], [952, 446]], 2), spline([[932, 462], [952, 470]], 2), // crow's feet R
  spline([[700, 478], [730, 486], [760, 482]], 4), spline([[840, 482], [870, 486], [900, 478]], 4), // under-eye
  spline([[758, 560], [742, 592], [744, 620]], 4), spline([[842, 560], [858, 592], [856, 620]], 4), // smile lines
];

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

  // pillow, hair, neck and the towel over her shoulders
  shape(ctx, PILLOW, t, { fillColor: '#FFFFFF', w: 5, seed: 1 });
  HAIR.forEach((h, i) => stroke(ctx, h, 1, t, { w: 5, seed: 10 + i }));
  fill(ctx, NECK, SKIN);
  fill(ctx, NECK, SKIN_SHADE, 0.45);
  stroke(ctx, [[700, 690], [692, 800]], 1, t, { w: 5, seed: 20 });
  stroke(ctx, [[900, 690], [908, 800]], 1, t, { w: 5, seed: 21 });
  const towel = spline([[320, 900], [380, 820], [560, 784], [800, 800], [1040, 784], [1220, 820], [1280, 900]], 8);
  shape(ctx, [...towel, [1280, 920], [320, 920]], t, { fillColor: '#FFFFFF', w: 5, seed: 22 });
  stroke(ctx, spline([[680, 820], [800, 846], [920, 820]], 5), 1, t, { w: 3, color: MUTED, seed: 23 });

  // face
  shape(ctx, EAR_L, t, { fillColor: SKIN_SHADE, w: 4, seed: 24, close: false });
  shape(ctx, EAR_R, t, { fillColor: SKIN_SHADE, w: 4, seed: 25, close: false });
  shape(ctx, FACE, t, { fillColor: SKIN, w: 6, seed: 26 });
  fill(ctx, ellipse(CX, 712, 90, 16), SKIN_SHADE, 0.5);
  shape(ctx, BAND, t, { fillColor: '#FFFFFF', w: 5, seed: 27 });
  stroke(ctx, BROW_L, 1, t, { w: 7, seed: 28 });
  stroke(ctx, BROW_R, 1, t, { w: 7, seed: 29 });
  [EYE_L, EYE_R].forEach((eye, e) => {
    stroke(ctx, eye, 1, t, { w: 5, seed: 30 + e });
    for (let i = 0; i < 7; i++) {
      const [x, y] = eye[3 + i * 2];
      const out = e === 0 ? -1 : 1;
      stroke(ctx, [[x, y], [x + out * (i - 3) * 1.5, y + 11]], 1, t, { w: 3, seed: 40 + e * 10 + i });
    }
  });
  stroke(ctx, NOSE, 1, t, { w: 4, seed: 33 });
  NOSTRILS.forEach((n, i) => stroke(ctx, n, 1, t, { w: 4, seed: 34 + i }));
  fill(ctx, [...LIPS_TOP, ...LIPS_BOT.slice().reverse()], '#E9A9A0', 0.85);
  stroke(ctx, LIPS_TOP, 1, t, { w: 4, seed: 36 });
  stroke(ctx, LIPS_MID, 1, t, { w: 4, seed: 37 });
  stroke(ctx, LIPS_BOT, 1, t, { w: 4, seed: 38 });
  LINES.forEach((l, i) => stroke(ctx, l, 1, t, { w: 3, color: MUTED, seed: 60 + i }));

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
