// Zoom-in / zoom-out framing for close-up scenes, so the viewer first sees what
// the close-up is of (the whole head, face or leg), then the procedure up close,
// then the wide shot again. The loop starts and ends on the same wide frame.
//
// The close-up is drawn into the patch of the wide shot it represents (a
// 1600×900 frame shrunk by `zoom` around `target`) and fades in as the camera
// arrives, so the two read as one continuous picture.

import { W, H, PAPER, clamp, ease, lerp } from './doodle.js';

/**
 * @param {object} o
 * @param {number} o.duration       whole loop, seconds
 * @param {number} o.closeDuration  length of the close-up's own loop, seconds
 * @param {[number, number]} o.target  wide-shot point the close-up is centred on
 * @param {number} o.zoom           how much the camera magnifies at full zoom
 * @param {(ctx, t) => void} o.wide   draws the wide shot (static: it must look the same at both ends)
 * @param {(ctx, t) => void} o.close  draws the close-up loop (its t=0 and t=closeDuration must match)
 * @param {number[]} [o.times]       [zoomInStart, zoomInEnd, zoomOutStart, zoomOutEnd]
 */
export function zoomLoop(ctx, t, o) {
  const [inA, inB, outA, outB] = o.times ?? [0.4, 1.6, o.duration - 1.4, o.duration - 0.3];
  const k = t < inB ? ease.inOut(clamp((t - inA) / (inB - inA))) : ease.inOut(1 - clamp((t - outA) / (outB - outA)));
  // Exponential zoom feels like a steady push in; the target slides to the centre as we arrive.
  const s = Math.pow(o.zoom, k);
  const [tx, ty] = o.target;
  const sx = lerp(tx, W / 2, k), sy = lerp(ty, H / 2, k);
  const closeT = o.closeDuration * clamp((t - inB) / (outA - inB));

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(s, s);
  ctx.translate(-tx, -ty);
  o.wide(ctx, t);

  // The close-up fades in through a soft oval that widens to cover the frame,
  // so it never shows as a hard-edged box over the wide shot.
  const a = clamp((k - 0.55) / 0.45);
  if (a > 0) {
    const close = closeLayer(ctx.canvas);
    const c = close.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    o.close(c, closeT);
    if (a < 1) {
      const r = lerp(120, 1300, ease.inOut(a));
      c.globalCompositeOperation = 'destination-in';
      c.translate(W / 2, H / 2);
      c.scale(1, H / W);
      const g = c.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(-W, -W, 2 * W, 2 * W);
    }
    ctx.save();
    ctx.globalAlpha *= ease.out(a);
    ctx.translate(tx - W / 2 / o.zoom, ty - H / 2 / o.zoom);
    ctx.scale(1 / o.zoom, 1 / o.zoom);
    ctx.drawImage(close, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

let layer;
/** One reusable offscreen canvas for the close-up. */
function closeLayer(main) {
  if (!layer) {
    layer = main.ownerDocument.createElement('canvas');
    layer.width = W;
    layer.height = H;
  }
  return layer;
}
