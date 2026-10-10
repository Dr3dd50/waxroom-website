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
export const DURATION = 8;

const SCENE_DRAW = {
  'brazilian-waxing': wax.draw,
  'body-waxing': wax.draw,
  brows: browScene.draw,
  'lash-extensions': lashScene.draw,
  'skin-treatments': jetPlasma.draw,
  'yoni-steam': steamScene.draw,
  'hair-restoration': hairScene.draw,
};

export const SCENES = Object.keys(SCENE_DRAW);

export function drawScene(ctx, name, t) {
  paper(ctx);
  SCENE_DRAW[name](ctx, t);
}
