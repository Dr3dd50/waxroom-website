// The client lying back on a pillow, seen front-on (chin toward the viewer):
// headband on, eyes closed, towel over her shoulders. Shared by the scenes that
// show her face (Jet Plasma, and the wide shot that opens the lash video).

import { MUTED, SKIN, SKIN_SHADE, stroke, fill, shape, spline, ellipse, rrect } from './doodle.js';

export const CX = 800; // face centre line
// Face outline: forehead at top (towards the pillow), chin at the bottom (towards us).
export const FACE = spline([
  [CX, 236], [884, 246], [948, 290], [982, 370], [990, 450], [980, 540], [952, 620],
  [904, 684], [846, 722], [CX, 732], [754, 722], [696, 684], [648, 620], [620, 540],
  [610, 450], [618, 370], [652, 290], [716, 246], [CX, 236],
], 6);
export const EAR_L = spline([[614, 440], [586, 430], [578, 476], [590, 524], [618, 536]], 5);
export const EAR_R = spline([[986, 440], [1014, 430], [1022, 476], [1010, 524], [982, 536]], 5);
export const NECK = [[700, 690], [690, 790], [910, 790], [900, 690]];
export const PILLOW = spline([[430, 300], [520, 150], [800, 112], [1080, 150], [1170, 300], [1150, 640], [1040, 700], [560, 700], [450, 640], [430, 300]], 6);
// Hair spread on the pillow around the head.
export const HAIR = [
  spline([[612, 420], [560, 340], [570, 240], [650, 172], [760, 150]], 6),
  spline([[988, 420], [1040, 340], [1030, 240], [950, 172], [840, 150]], 6),
  spline([[600, 500], [530, 420], [500, 320], [530, 220]], 6),
  spline([[1000, 500], [1070, 420], [1100, 320], [1070, 220]], 6),
  spline([[606, 560], [540, 560], [500, 500]], 5),
  spline([[994, 560], [1060, 560], [1100, 500]], 5),
  spline([[700, 168], [800, 156], [900, 168]], 5),
];
// Spa headband across the hairline.
export const BAND = [
  ...spline([[628, 330], [700, 276], [800, 262], [900, 276], [972, 330]], 8),
  ...spline([[972, 330], [968, 372]], 2),
  ...spline([[968, 372], [900, 322], [800, 306], [700, 322], [632, 372]], 8),
  ...spline([[632, 372], [628, 330]], 2),
];

export const BROW_L = spline([[676, 410], [712, 398], [758, 404]], 5);
export const BROW_R = spline([[842, 404], [888, 398], [924, 410]], 5);
export const EYE_L = spline([[680, 448], [704, 460], [736, 462], [760, 452]], 6);
export const EYE_R = spline([[840, 452], [864, 462], [896, 460], [920, 448]], 6);
/** Under-eye gel pad for lash work: its top edge follows the right eye's lash line. */
export const PAD_R = spline([[836, 455], [864, 464], [896, 462], [924, 450], [946, 472], [920, 504], [872, 514], [838, 500], [830, 476], [836, 455]], 6);
export const NOSE = spline([[790, 432], [784, 500], [776, 548]], 5);
export const NOSTRILS = [
  spline([[766, 556], [780, 566], [794, 562]], 4),
  spline([[806, 562], [820, 566], [834, 556]], 4),
];
export const LIPS_TOP = spline([[748, 618], [776, 606], [800, 612], [824, 606], [852, 618]], 6);
export const LIPS_MID = spline([[748, 620], [800, 626], [852, 620]], 6);
export const LIPS_BOT = spline([[756, 624], [800, 648], [844, 624]], 6);
// The fine lines the treatment softens.
export const LINES = [
  spline([[668, 452], [648, 446]], 2), spline([[668, 462], [648, 470]], 2), // crow's feet L
  spline([[932, 452], [952, 446]], 2), spline([[932, 462], [952, 470]], 2), // crow's feet R
  spline([[700, 478], [730, 486], [760, 482]], 4), spline([[840, 482], [870, 486], [900, 478]], 4), // under-eye
  spline([[758, 560], [742, 592], [744, 620]], 4), spline([[842, 560], [858, 592], [856, 620]], 4), // smile lines
];


// The salon's black waxing bed, head end at the top. It runs on past the bottom of
// the frame so a zoomed-out shot can show her whole length on it.
export const BED = rrect(180, 40, 1240, 2560, 90);
export const BED_BLACK = '#1E1B19';

/** The black bed with its faint embossed-leather texture. */
export function drawBed(ctx, t) {
  shape(ctx, BED, t, { fillColor: BED_BLACK, w: 6 });
  ctx.save();
  ctx.beginPath();
  BED.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.clip();
  ctx.strokeStyle = '#332E2A';
  ctx.lineWidth = 3;
  for (let y = 70, r = 0; y < 2600; y += 46, r++) {
    for (let x = 200 + (r % 2) * 30; x < 1420; x += 60) {
      const j = Math.sin(x * 12.9898 + y * 78.233) * 6;
      ctx.beginPath();
      ctx.ellipse(x + j, y, 22, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw the client. `underEyePad` adds the white gel pad lash artists tape under her eye; `lines` the fine lines Jet Plasma softens; `bed` the black waxing bed under her. */
export function drawClient(ctx, t, { underEyePad = false, lines = true, bed = false } = {}) {
  if (bed) drawBed(ctx, t);
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
  // the lash artist's gel pad sits right under the lash line, the lashes lying over it
  if (underEyePad) shape(ctx, PAD_R, t, { fillColor: '#FFFFFF', w: 3, seed: 90 });
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
  if (lines) LINES.forEach((l, i) => stroke(ctx, l, 1, t, { w: 3, color: MUTED, seed: 60 + i }));

}
