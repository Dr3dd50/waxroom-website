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

  // The close-up fades in with soft edges on all four sides, so neither its rectangle
  // nor the wide shot behind it shows: the feather is wide while the camera travels
  // and shrinks to nothing exactly as the close-up fills the frame.
  const a = clamp((k - 0.55) / 0.45);
  if (a > 0) {
    const close = closeLayer(ctx.canvas);
    const c = close.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    o.close(c, closeT);
    const f = 460 * (1 - ease.inOut(a)); // feather width, close-up pixels
    if (f > 0.5) {
      c.globalCompositeOperation = 'destination-in';
      for (const [x1, y1, len] of [[W, 0, W], [0, H, H]]) {
        const g = c.createLinearGradient(0, 0, x1, y1);
        const e = Math.min(f / len, 0.5);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(e, 'rgba(0,0,0,1)');
        g.addColorStop(1 - e, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
      }
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
