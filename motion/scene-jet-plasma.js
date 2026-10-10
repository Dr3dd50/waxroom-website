// Jet Plasma facial, front-on: the client lies back on the salon's black waxing
// bed, face toward us (her chin toward the esthetician), headband on, eyes closed.
// The handpiece glides its flat nozzle in slow circles over her cheek while a
// violet plasma glow crackles where it meets the skin. The video opens on the
// whole bed, zooms in to the face for the treatment and zooms back out.
// Every motion completes a whole number of cycles per loop, so the last frame
// flows straight into the first. Tools only.
//
// Reference: The Wax Room's own Jet Plasma Facial video (the handpiece, the bed).

import { PAPER, HONEY, MUTED, SKIN, SKIN_SHADE, PLASMA, TAU, stroke, shape, spline, arc, rrect, ellipse, write, wave } from './doodle.js';
import { drawClient } from './face.js';
import { zoomLoop } from './camera.js';
import { plasmaHandpiece, plasmaGlow } from './plasma-device.js';

// The close-up's own loop; the full video adds a zoom in and out around it.
const CLOSE = 8;
export const DURATION = 10;
export const POSTER = 0; // the wide shot
const LAPS = 2; // circles the nozzle makes per close-up loop

// Where the nozzle glides: her cheek on our right.
const CHEEK = { x: 892, y: 548, rx: 34, ry: 22 };
// The handpiece comes in from our side (lower right), the side the esthetician works from.
const ANGLE = 2.5;
const CONSOLE = [2150, 1150]; // the plasma unit on its cart, beside the bed (off-frame in the close-up)

/** Her arms and the blanket below the towel: only seen in the wide shot. */
function drawBody(ctx, t) {
  shape(ctx, spline([[300, 905], [800, 900], [1300, 905], [1320, 1600], [1290, 2560], [310, 2560], [280, 1600], [300, 905]], 8), t, { fillColor: '#E3DCD2', w: 5 });
  stroke(ctx, spline([[520, 1100], [560, 1500], [540, 1900]], 6), 1, t, { w: 3, color: MUTED });
  stroke(ctx, spline([[1080, 1100], [1040, 1500], [1060, 1900]], 6), 1, t, { w: 3, color: MUTED });
  for (const side of [-1, 1]) {
    const x = 800 + side * 470;
    shape(ctx, spline([[x - 50, 900], [x - 56, 1300], [x - 40, 1640], [x + 40, 1640], [x + 56, 1300], [x + 50, 900]], 6), t, { fillColor: SKIN, w: 5 });
    shape(ctx, ellipse(x, 1690, 46, 64), t, { fillColor: SKIN_SHADE, w: 5 });
  }
}

/** The plasma unit on a cart at the side of the bed. */
function drawConsole(ctx, t) {
  const [cx, cy] = CONSOLE;
  shape(ctx, rrect(cx - 210, cy - 160, 420, 320, 26), t, { fillColor: '#D8D2CA', w: 6 });
  shape(ctx, rrect(cx - 150, cy - 120, 300, 190, 22), t, { fillColor: '#FFFFFF', w: 6 });
  shape(ctx, rrect(cx - 120, cy - 95, 160, 110, 12), t, { fillColor: '#2A2622', w: 5 });
  stroke(ctx, spline([[cx - 100, cy - 40], [cx - 70, cy - 70], [cx - 40, cy - 30], [cx - 10, cy - 60], [cx + 20, cy - 40]], 6), 1, t, { w: 4, color: PLASMA });
  shape(ctx, ellipse(cx + 90, cy - 40, 26, 26), t, { fillColor: '#C9CDD2', w: 5 });
}

function drawClose(ctx, t, { wide = false } = {}) {
  const a = TAU * LAPS * (t / CLOSE);
  const tipX = CHEEK.x + Math.cos(a) * CHEEK.rx;
  const tipY = CHEEK.y + Math.sin(a) * CHEEK.ry;

  drawClient(ctx, t, { bed: true });
  if (wide) {
    drawBody(ctx, t);
    drawConsole(ctx, t);
  }

  // glow trail where the nozzle has just passed (analytic, so the loop is seamless)
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

  plasmaGlow(ctx, t, tipX, tipY, { loop: CLOSE });
  plasmaHandpiece(ctx, t, tipX, tipY, {
    angle: ANGLE,
    scale: 0.7,
    cable: [[1520, 900 + wave(t, CLOSE, LAPS) * 10], [1760, 1020], [1960, 1110], [CONSOLE[0] - 60, CONSOLE[1] - 20]],
  });

  if (!wide) {
    write(ctx, 'Jet Plasma · no needles · no downtime', 800, 64, 1, t, { size: 50, color: PAPER, rot: 0 }); // light on the black bed
    stroke(ctx, arc(800, 30, 300, 14, Math.PI * 0.12, Math.PI * 0.88, 20).map(([x, y]) => [x, y + 64]), 1, t, { w: 4, color: HONEY });
  }
}

// ── wide shot: the whole bed from above, the console on its cart beside it ──
const ZOOM = 2.4;
const TARGET = [800, 300];

function drawWide(ctx, t) {
  ctx.save();
  ctx.translate(TARGET[0] - 800 / ZOOM, TARGET[1] - 450 / ZOOM);
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  drawClose(ctx, 0, { wide: true });
  ctx.restore();
  write(ctx, 'Jet Plasma facial', 300, 640, 1, t, { size: 46, color: MUTED, rot: 0 });
}

export function draw(ctx, t) {
  zoomLoop(ctx, t, { duration: DURATION, closeDuration: CLOSE, target: TARGET, zoom: ZOOM, wide: drawWide, close: drawClose });
}
