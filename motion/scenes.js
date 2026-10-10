// Registry of the doodle code videos: one researched, tools-only scene per
// service page, each a seamless loop (its last frame flows into its first).
// Render with `node motion/render.mjs [scene…]`.

import { paper } from './doodle.js';
import * as wax from './scene-wax.js';
import * as jetPlasma from './scene-jet-plasma.js';
import * as lashScene from './scene-lashes.js';
import * as browScene from './scene-brows.js';
import * as hairScene from './scene-hair.js';
import * as steamScene from './scene-steam.js';

export { W, H } from './doodle.js';

const SCENE = {
  'brazilian-waxing': wax,
  'body-waxing': wax,
  brows: browScene,
  'lash-extensions': lashScene,
  'skin-treatments': jetPlasma,
  'yoni-steam': steamScene,
  'hair-restoration': hairScene,
};

export const SCENES = Object.keys(SCENE);
export const durationOf = (name) => SCENE[name].DURATION;
/** Poster time: a scene with a zoom opens on its wide shot, so its poster is that frame too. */
export const posterOf = (name) => SCENE[name].POSTER ?? 5.8;

export function drawScene(ctx, name, t) {
  paper(ctx);
  SCENE[name].draw(ctx, t);
}
