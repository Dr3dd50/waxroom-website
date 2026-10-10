// Renders the doodle scenes to looping MP4 + WebM (plus a poster frame) in public/videos/.
// Same approach as the ChurnMiser motion studies: the scene is a pure function of
// time drawn to a canvas; headless Chromium steps it frame by frame into ffmpeg.
//
//   node motion/render.mjs                 # every scene
//   node motion/render.mjs brows lashes    # just these
//   node motion/render.mjs --stills        # a few PNGs per scene into motion/out/ for a quick check
//   node motion/render.mjs --serve         # live preview at http://localhost:8124
//
// Needs playwright-core (or playwright) and ffmpeg with libx264.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS = path.resolve(here, '../public/videos');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const only = args.filter((a) => !a.startsWith('--'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const p = path.join(here, rel === '/' ? 'index.html' : rel);
  if (!p.startsWith(here) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(flags.has('--serve') ? 8124 : 0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
if (flags.has('--serve')) {
  console.log(`preview: ${base}`);
  await new Promise(() => {});
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of ['playwright-core', 'playwright']) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error('playwright not found: npm i -D playwright-core');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch(
  fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {},
);
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => {
  console.error('page error:', e);
  process.exit(1);
});

const { SCENES } = await import('./scenes.js');
const names = only.length ? only : SCENES;
fs.mkdirSync(VIDEOS, { recursive: true });

for (const name of names) {
  await page.goto(`${base}?render&scene=${name}`);
  await page.waitForFunction(() => window.ready === true);
  const FRAMES = await page.evaluate(() => window.FRAMES);
  const grab = async (f) => Buffer.from((await page.evaluate((f) => window.frame(f), f)).split(',')[1], 'base64');

  if (flags.has('--stills')) {
    const dir = path.join(here, 'out', name);
    fs.mkdirSync(dir, { recursive: true });
    for (const s of (process.env.AT ? process.env.AT.split(',').map(Number) : [0, 1, 2.5, 4, 5.6, 7.96])) fs.writeFileSync(path.join(dir, `t${s}.png`), await grab(Math.round(s * 30)));
    console.log(`stills → motion/out/${name}`);
    continue;
  }

  // Poster: the finished drawing, shown before the video loads or with reduced motion.
  fs.writeFileSync(path.join(here, 'out-poster.png'), await grab(Math.round(5.8 * 30)));
  await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(here, 'out-poster.png'), '-vf', 'scale=1280:-2', '-q:v', '4', path.join(VIDEOS, `${name}.jpg`)]);
  fs.unlinkSync(path.join(here, 'out-poster.png'));

  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', path.join(VIDEOS, `${name}.mp4`),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    const buf = await grab(f);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  // VP9/WebM too: browsers without H.264 (Chromium builds, some Linux Firefox) pick this.
  await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(VIDEOS, `${name}.mp4`), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-an', path.join(VIDEOS, `${name}.webm`)]);
  const kb = Math.round(fs.statSync(path.join(VIDEOS, `${name}.mp4`)).size / 1024);
  console.log(`${name}.mp4  ${FRAMES} frames  ${kb} KB  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

function run(cmd, a) {
  return new Promise((r, j) => spawn(cmd, a, { stdio: 'inherit' }).on('close', (c) => (c ? j(new Error(`${cmd} ${c}`)) : r())));
}

await browser.close();
server.close();
