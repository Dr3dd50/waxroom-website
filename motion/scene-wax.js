// Hard wax, done the way it's actually done (close-up along a leg):
// spatula lifted from the warmer → wax laid in a strip WITH the hair growth,
// finished with a thick "lip" → wax sets (gloss dulls) →
// lifted, strip pulled fast, flat and AGAINST the growth → smooth skin.
// Then the leg slides one strip along and the spatula goes back in the pot, so
// the last frame is the first frame of the next section: a perfect loop.
//
// References: pro wax warmers (white body, steel well, front dial), wooden
// spatulas, translucent honey hard wax, nitrile gloves; hard-wax technique
// (apply with growth, ~45° spatula, lip at the end, pull parallel against growth).
// Only the tools are drawn: the strip's lip lifts and the strip peels back on its own.

import {
  MUTED, WOOD, SKIN, SKIN_SHADE, TAU,
  stroke, fill, shape, spline, line, arc, ellipse, rrect, rotate, translate, write,
  lerp, seg, prog, ease, clamp,
} from './doodle.js';
import { zoomLoop } from './camera.js';
import { BED_BLACK } from './face.js';

// The close-up's own loop; the full video adds a zoom in and out around it.
const CLOSE = 8;
export const DURATION = 10;
export const POSTER = 0; // the wide shot
const P = 560; // one strip / section width; the leg pans by exactly this per loop
const X0 = 470, X1 = X0 + P; // the section being waxed, in screen space at t=0
const MID = 488;
const WAX = '#E59A22';
const WAX_DEEP = '#C9780C';

const yTop = (wx) => 330 + 10 * Math.sin((TAU * wx) / P);
const yBot = (wx) => 646 + 12 * Math.sin((TAU * wx) / P + 2);

// Deterministic hair pattern that repeats every P in world space.
const HAIR_STEP = 28; // P / 20
function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ── timeline (seconds) ────────────────────────────────────────────────────────
const T = {
  lift: [0, 0.45], // spatula twirls up out of the warmer
  travel: [0.45, 0.95], // to the start of the section
  apply: [0.95, 2.35], // laying the strip with the growth
  exit: [2.35, 2.75], // flick up to form the lip, away
  back: [2.75, 3.3], // spatula back into the warmer
  set: [2.35, 3.5], // wax sets: gloss dulls
  flick: [3.7, 4.0], // lip lifted
  pull: [4.0, 4.38], // the fast pull
  away: [4.38, 4.9], // strip lifted away
  pan: [5.2, 7.4], // slide to the next section
};

const POT = { x: 1440, y: 150 };
// Below the leg, in close-up coordinates (the wide shot uses the same numbers, shrunk):
const SHELF_W = 374; // the cart's top shelf under the warmer
const SHEET_TOP = 600, BED_TOP = 756, BED_BOTTOM = 916; // sheet, then the black bed
const EMBOSS = P / 5, EMBOSS_Y = 836; // the bed's embossed texture (repeats with the pan)

function warmer(ctx, t) {
  shape(ctx, rrect(1318, 120, 244, 190, 26), t, { fillColor: '#FFFFFF', w: 5, seed: 200 });
  shape(ctx, ellipse(1440, 128, 110, 26), t, { fillColor: '#D8D2CA', w: 5, seed: 201 });
  fill(ctx, ellipse(1440, 132, 90, 18), WAX);
  stroke(ctx, arc(1440, 128, 70, 10, Math.PI * 1.1, Math.PI * 1.5, 8), 1, t, { w: 3, color: '#FFE7B0', seed: 202 });
  shape(ctx, ellipse(1440, 246, 26, 26), t, { fillColor: '#2A2622', w: 4, seed: 203 });
  stroke(ctx, line(1440, 246, 1452, 230, 3), 1, t, { w: 4, color: '#FFFFFF', seed: 204 });
  fill(ctx, ellipse(1510, 246, 7, 7), '#FF7A59');
  stroke(ctx, line(1340, 210, 1540, 210, 6), 1, t, { w: 3, color: MUTED, seed: 205 });
}

/** Wooden spatula drawn from its tip, angled. */
function spatula(ctx, t, tipX, tipY, ang, globSize) {
  const body = translate(rotate(rrect(-17, -430, 34, 430, 16), 0, 0, ang), tipX, tipY);
  shape(ctx, body, t, { fillColor: WOOD, w: 5, seed: 210 });
  const grain = translate(rotate(line(0, -60, 0, -400, 8), 0, 0, ang), tipX, tipY);
  stroke(ctx, grain, 1, t, { w: 2, color: '#C9A877', seed: 211 });
  if (globSize > 0.02) {
    const g = translate(rotate(ellipse(0, -18, 24 * globSize + 8, 30 * globSize + 8), 0, 0, ang), tipX, tipY);
    fill(ctx, g, WAX, 0.92);
    stroke(ctx, [...g, g[0]], 1, t, { w: 3, color: WAX_DEEP, seed: 212 });
  }
}

/** The wax strip between world x a and b (attached to the skin). */
function stripShape(a, b, lip) {
  const top = [], bot = [];
  for (let wx = a; wx <= b; wx += 14) {
    top.push([wx, yTop(wx) + 40]);
    bot.push([wx, yBot(wx) - 40]);
  }
  top.push([b, yTop(b) + 40]);
  bot.push([b, yBot(b) - 40]);
  // rounded leading end + a thicker lip at the far end
  const cap = arc(b, (yTop(b) + yBot(b)) / 2, 18 + lip * 14, (yBot(b) - yTop(b)) / 2 - 40, -Math.PI / 2, Math.PI / 2, 10);
  const tail = arc(a, (yTop(a) + yBot(a)) / 2, 16, (yBot(a) - yTop(a)) / 2 - 40, Math.PI / 2, Math.PI * 1.5, 10);
  return [...top, ...cap, ...bot.reverse(), ...tail];
}

/** The leg's hairs in close-up coordinates, panned by `pan`, skipping waxed world x. */
function hairs(ctx, t, pan, waxed, span = 1700, w = 2.4) {
  for (let wx = Math.floor((pan - 60) / HAIR_STEP) * HAIR_STEP; wx < pan + span; wx += HAIR_STEP) {
    if (waxed(wx)) continue;
    const col = (((Math.round(wx / HAIR_STEP) % 20) + 20) % 20);
    for (let row = 0; row < 7; row++) {
      const r = hash(col, row);
      const x = wx - pan + r * 16;
      const y = lerp(yTop(wx) + 34, yBot(wx) - 34, (row + 0.5) / 7) + (hash(row, col) - 0.5) * 22;
      // each hair: a short curved stroke leaning with the growth (toward the ankle, right)
      const len = 13 + hash(col + 3, row) * 9;
      const a = 0.45 + (hash(col, row + 5) - 0.5) * 0.5;
      const bend = (hash(row + 9, col) - 0.5) * 0.9;
      const mid = [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5];
      const end = [x + Math.cos(a + bend) * len, y + Math.sin(a + bend) * len];
      stroke(ctx, [[x, y], mid, end], 1, t, { w, seed: col * 13 + row });
    }
  }
}

function drawClose(ctx, t) {
  const pan = P * seg(t, T.pan[0], T.pan[1], ease.inOut);
  const sx = (wx) => wx - pan; // world → screen

  ctx.save();
  // the cart's top shelf under the warmer, behind the leg
  shape(ctx, rrect(POT.x - SHELF_W / 2, 306, SHELF_W, 34, 14), t, { fillColor: '#D8D2CA', w: 5, seed: 3 });
  // the sheet over the black waxing bed (embossed texture slides with the leg)
  fill(ctx, [[0, SHEET_TOP], [1600, SHEET_TOP], [1600, BED_TOP], [0, BED_TOP]], '#FFFFFF');
  fill(ctx, [[0, BED_TOP], [1600, BED_TOP], [1600, 900], [0, 900]], BED_BLACK);
  for (let k = Math.floor(pan / EMBOSS) - 1; k * EMBOSS < pan + 1700; k++) {
    stroke(ctx, ellipse(sx(k * EMBOSS + 40), EMBOSS_Y, 36, 22), 1, t, { w: 5, color: '#332E2A', seed: 4 + (k & 3) });
  }
  stroke(ctx, line(0, BED_TOP, 1600, BED_TOP, 20), 1, t, { w: 6, seed: 1 });
  for (let k = -1; k < 5; k++) {
    const fx = sx(k * P + 140);
    stroke(ctx, spline([[fx, 676], [fx + 40, 712], [fx + 30, 748]], 4), 1, t, { w: 3, color: MUTED, seed: 2 + ((k + 10) % 3) });
  }

  // the leg (world-space contour, periodic every P)
  const topPts = [], botPts = [];
  for (let x = -40; x <= 1640; x += 16) {
    topPts.push([x, yTop(x + pan)]);
    botPts.push([x, yBot(x + pan)]);
  }
  fill(ctx, [...topPts, ...botPts.slice().reverse()], SKIN);
  fill(ctx, [...botPts.map(([x, y]) => [x, y - 64]), ...botPts.slice().reverse()], SKIN_SHADE, 0.55);
  stroke(ctx, topPts, 1, t, { w: 6, seed: 10 });
  stroke(ctx, botPts, 1, t, { w: 6, seed: 11 });

  // where the strip is being pulled from (world x); hair inside the section
  // disappears behind the peel, and everything left of the section is smooth
  const peel = lerp(X1, X0, seg(t, T.pull[0], T.pull[1], ease.in));
  hairs(ctx, t, pan, (wx) => {
    const inSection = wx >= X0 && wx <= X1;
    return wx < X0 || (inSection && wx >= peel && t >= T.pull[0]) || (inSection && t >= T.pull[1]);
  });

  // ── the wax strip ──
  const applied = seg(t, T.apply[0], T.apply[1], ease.inOut);
  const lipLift = seg(t, T.flick[0], T.flick[1]);
  const setting = seg(t, T.set[0], T.set[1]);
  const waxVisible = t >= T.apply[0] && t < T.away[1];
  if (waxVisible) {
    const end = t < T.pull[0] ? lerp(X0 + 24, X1, applied) : peel;
    if (end > X0 + 4) {
      const s = stripShape(X0, end, t < T.apply[1] ? 0.4 : 1).map(([x, y]) => [sx(x), y]);
      fill(ctx, s, WAX, lerp(0.62, 0.86, setting));
      stroke(ctx, [...s, s[0]], 1, t, { w: 4, color: WAX_DEEP, seed: 300 });
      // gloss highlight on fresh wax, fading as it sets
      if (setting < 1) {
        const hl = [];
        for (let wx = X0 + 30; wx < end - 30; wx += 20) hl.push([sx(wx), yTop(wx) + 64]);
        stroke(ctx, hl, 1, t, { w: 6, color: '#FFF1CC', seed: 301, alpha: 0.75 * (1 - setting) });
      }
      // lip lifting at the far end before the pull
      if (t < T.pull[0] && lipLift > 0) {
        const cy = (yTop(X1) + yBot(X1)) / 2;
        const lip = rotate(rrect(sx(X1) - 26, cy - 90, 40, 180, 18), sx(X1) - 10, cy, -0.5 * lipLift);
        fill(ctx, lip, WAX_DEEP, 0.95);
      }
    }
    // the pulled-back flap folds over the remaining wax, hair caught in it
    if (t >= T.pull[0]) {
      const pulled = X1 - peel;
      const handW = peel - pulled; // the flap's free end, pulled back flat against the skin
      const lift = seg(t, T.away[0], T.away[1]);
      const dy = -26 - lift * 260, dx = -lift * 180;
      const flap = stripShape(Math.min(handW, peel - 6), peel, 1).map(([x, y]) => [sx(x) + dx, y + dy]);
      fill(ctx, flap, '#D98A12', 0.94 * (1 - lift * 0.6));
      stroke(ctx, [...flap, flap[0]], 1, t, { w: 4, color: WAX_DEEP, seed: 310, alpha: 1 - lift * 0.6 });
      for (let k = 0; k < 18; k++) {
        const fx = lerp(Math.min(handW, peel - 6), peel, (k + 0.5) / 18);
        const fy = lerp(yTop(fx) + 60, yBot(fx) - 60, hash(k, 7));
        stroke(ctx, [[sx(fx) + dx, fy + dy], [sx(fx) + dx - 12, fy + dy - 6]], 1, t, { w: 2.4, seed: 320 + k, alpha: 1 - lift });
      }
    }
  }

  ctx.restore();

  // ── the warmer and the spatula ──
  warmer(ctx, t);
  let tip, ang, glob = 0;
  const startX = sx(X0) + 10, endX = sx(X1);
  if (t < T.lift[1]) {
    const k = seg(t, T.lift[0], T.lift[1]);
    tip = [POT.x - 6 + Math.sin(k * TAU) * 10, POT.y - 4 - k * 70];
    ang = 0.38 + Math.sin(k * TAU * 1.5) * 0.12;
    glob = 1;
  } else if (t < T.travel[1]) {
    const k = seg(t, T.travel[0], T.travel[1]);
    tip = [lerp(POT.x - 6, startX, k), lerp(POT.y - 74, MID, ease.inOut(k)) - Math.sin(k * Math.PI) * 120];
    ang = lerp(0.38, 0.62, k);
    glob = 1;
  } else if (t < T.apply[1]) {
    const k = seg(t, T.apply[0], T.apply[1], ease.inOut);
    tip = [lerp(startX, endX, k), MID];
    ang = 0.62;
    glob = 1 - k;
  } else if (t < T.exit[1]) {
    const k = seg(t, T.exit[0], T.exit[1]);
    tip = [endX + k * 200, MID - ease.out(k) * 300];
    ang = 0.62 - k * 0.2;
  } else if (t < T.back[1]) {
    const k = seg(t, T.back[0], T.back[1]);
    tip = [lerp(endX + 200, POT.x - 6, k), lerp(MID - 300, POT.y - 4, ease.inOut(k))];
    ang = lerp(0.42, 0.38, k);
  } else {
    // resting in the warmer, wax reloading on the tip until it's picked up again
    tip = [POT.x - 6, POT.y - 4];
    ang = 0.38;
    glob = seg(t, 7.0, 7.9);
  }
  spatula(ctx, t, tip[0], tip[1], ang, glob);
  // the drip of honey wax trailing off the loaded spatula on its way over
  if (t >= T.lift[0] && t < T.apply[0] + 0.15) {
    const k = prog(t, 0, T.apply[0] + 0.15);
    stroke(ctx, spline([[tip[0], tip[1] + 8], [tip[0] - 6, tip[1] + 40 + k * 30], [tip[0] + 2, tip[1] + 70 + k * 40]], 6), 1, t, { w: 9, color: WAX, seed: 330 });
  }

  // ── what's happening, in the waxer's words ──
  const say = (text, a, b) => {
    const k = seg(t, a, a + 0.3) * (1 - seg(t, b - 0.3, b));
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha *= k;
      write(ctx, text, 800, 856, 1, t, { size: 50, rot: 0 });
      ctx.restore();
    }
  };
  say('apply with the hair growth →', 0.6, 2.6);
  say('let it set…', 2.6, 3.6);
  say('← pull fast, against the growth', 3.6, 5.0);
  say('smooth. on to the next section', 5.0, 7.6);
  void clamp;
}

// ── wide shot: the whole leg on the treatment bed, warmer on a cart behind it ──
// The close-up is the 1600×900 frame shrunk by ZOOM around TARGET. Everything inside
// that patch is drawn from the close-up's own geometry (leg outline, sheet, bed, cart
// shelf, warmer), so zooming in and out reads as one camera move, not two pictures.
// The patch spans the shin, knee to ankle; thigh and foot lie outside it.
const ZOOM = 2.4;
const L = 160; // the patch's left edge in the wide shot (just below the knee)
const AT = [L + 800 / ZOOM, 470];
const R = AT[0] + 800 / ZOOM; // right edge, short of the ankle
const DX = 190; // the whole wide shot shifts right so the leg sits mid-frame
const TARGET = [AT[0] + DX, AT[1]];
const wx = (x) => AT[0] + (x - 800) / ZOOM; // close-up → wide
const wy = (y) => AT[1] + (y - 450) / ZOOM;
const cx = (x) => 800 + (x - AT[0]) * ZOOM; // wide → close-up

function drawWide(ctx, t) {
  ctx.save();
  ctx.translate(DX, 0);
  const potBase = [wx(POT.x), wy(310)];
  const bedBot = wy(BED_BOTTOM);

  // floor; the cart (behind the bed); the bed with its sheet
  stroke(ctx, line(-DX - 40, 780, 1640 - DX, 780, 30), 1, t, { w: 4, color: MUTED });
  shape(ctx, rrect(potBase[0] - SHELF_W / 2 / ZOOM, wy(306), SHELF_W / ZOOM, 34 / ZOOM, 6), t, { fillColor: '#D8D2CA', w: 4 });
  stroke(ctx, line(potBase[0] - 66, potBase[1] + 12, potBase[0] - 66, 772, 6), 1, t, { w: 5 });
  stroke(ctx, line(potBase[0] + 66, potBase[1] + 12, potBase[0] + 66, 772, 6), 1, t, { w: 5 });
  shape(ctx, ellipse(potBase[0] - 66, 774, 9, 9), t, { fillColor: '#2A2622', w: 3 });
  shape(ctx, ellipse(potBase[0] + 66, 774, 9, 9), t, { fillColor: '#2A2622', w: 3 });
  const bedL = -DX - 60, bedR = 960;
  shape(ctx, rrect(bedL, wy(BED_TOP), bedR - bedL, bedBot - wy(BED_TOP), 14), t, { fillColor: BED_BLACK, w: 5 }); // the salon's black waxing bed
  for (let k = Math.floor(cx(bedL) / EMBOSS); wx(k * EMBOSS + 40) < bedR - 20; k++) {
    stroke(ctx, ellipse(wx(k * EMBOSS + 40), wy(EMBOSS_Y), 36 / ZOOM, 22 / ZOOM), 1, t, { w: 2.5, color: '#332E2A' });
  }
  stroke(ctx, line(90, bedBot, 90, 780, 4), 1, t, { w: 6 });
  stroke(ctx, line(880, bedBot, 880, 780, 4), 1, t, { w: 6 });
  fill(ctx, [[bedL, wy(SHEET_TOP)], [bedR - 10, wy(SHEET_TOP)], [bedR - 10, wy(BED_TOP)], [bedL, wy(BED_TOP)]], '#FFFFFF');
  stroke(ctx, line(bedL, wy(BED_TOP), bedR, wy(BED_TOP), 20), 1, t, { w: 3 });
  ctx.save();
  ctx.translate(wx(0), wy(0));
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  warmer(ctx, t);
  spatula(ctx, t, POT.x - 6, POT.y - 4, 0.38, 1);
  ctx.restore();

  // the leg, side view: thigh off to the left, knee, shin (the close-up's outline,
  // sampled), ankle, foot with toes up at the right
  const shinTop = [], shinBot = [];
  for (let x = L; x <= R + 0.1; x += 8) {
    shinTop.push([x, wy(yTop(cx(x)))]);
    shinBot.push([x, wy(yBot(cx(x)))]);
  }
  const [lt, lb] = [shinTop[0][1], shinBot[0][1]];
  const [rt, rb] = [shinTop[shinTop.length - 1][1], shinBot[shinBot.length - 1][1]];
  const legTop = [...spline([[-DX - 60, lt - 70], [L - 150, lt - 46], [L - 60, lt - 12], [L, lt]], 8), ...shinTop.slice(1), ...spline([[R, rt], [R + 30, rt + 8], [R + 52, rt + 20], [R + 72, rt + 6], [R + 90, rt - 70], [R + 108, rt - 92], [R + 126, rt - 70], [R + 134, rb - 30], [R + 126, rb]], 8).slice(1)];
  const legBot = [...spline([[R + 126, rb], [R + 60, rb + 2], [R, rb]], 8), ...shinBot.slice().reverse().slice(1), ...spline([[L, lb], [L - 80, lb + 4], [-DX - 60, lb + 8]], 8).slice(1)];
  fill(ctx, [...legTop, ...legBot], SKIN);
  fill(ctx, [...legBot.map(([x, y]) => [x, y - 64 / ZOOM]), ...legBot.slice().reverse()], SKIN_SHADE, 0.55);
  stroke(ctx, legTop, 1, t, { w: 5 });
  stroke(ctx, legBot, 1, t, { w: 5 });
  stroke(ctx, spline([[L - 26, lt + 40], [L - 10, lt + 62], [L - 20, lt + 86]], 4), 1, t, { w: 3, color: MUTED }); // knee
  stroke(ctx, spline([[R + 48, rt + 40], [R + 60, rt + 64]], 3), 1, t, { w: 3, color: MUTED }); // ankle bone
  // the close-up's own hairs (unwaxed from the section onward), shrunk to the wide shot
  ctx.save();
  ctx.beginPath();
  ctx.rect(L, 0, R - L + 20, 900);
  ctx.clip();
  ctx.translate(wx(0), wy(0));
  ctx.scale(1 / ZOOM, 1 / ZOOM);
  hairs(ctx, t, 0, (x) => x < X0, 1700, 4);
  ctx.restore();
  ctx.restore();
}

export function draw(ctx, t) {
  zoomLoop(ctx, t, { duration: DURATION, closeDuration: CLOSE, target: TARGET, zoom: ZOOM, wide: drawWide, close: drawClose });
}
