// Pulls recent @waxroomrichmond Instagram posts via Apify for the gallery page.
// Instagram media URLs expire, so each post's cover image is downloaded and
// resized into public/gallery/; videos play from Instagram's own embed.
// Writes src/data/gallery.json.
//
//   APIFY_TOKEN=... node scripts/sync-instagram.mjs
//   node scripts/sync-instagram.mjs --input saved-dataset.json

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { datasetFromArgsOr, writeJson } from './lib/apify.mjs';

const HANDLE = 'waxroomrichmond';
const LIMIT = 60;
const OUT_JSON = new URL('../src/data/gallery.json', import.meta.url).pathname;
const OUT_DIR = new URL('../public/gallery/', import.meta.url).pathname;
// People who should no longer appear on the site.
const EXCLUDE = /\bshae\b/i;

// Caption → service group (keys match SERVICE_GROUPS in src/content/services.ts).
// Hashtags are stripped first: nearly every post is tagged #804brazilianwax.
const HAIR = /hair restoration|restoration hair|thinning (crown|hair)|thicker, fuller|plasma hair|\bwigs?\b|lace (unit|install)/i;
const GROUPS = [
  ['hair', HAIR],
  ['brows', /brow|henna/i],
  ['lashes', /lash/i],
  ['wellness', /yoni|steam|womb|stretch|wellness/i],
  ['skin', /plasma|facial|peel|collagen|wrinkle|fine lines|skin ?care|pigment|acne/i],
  ['waxing', /brazilian|bikini|\bwax|ingrown|underarm|\blegs?\b|manzilian|exfoliat/i],
];

function classify(text, hashtags) {
  if (HAIR.test(text)) return 'hair';
  const hits = GROUPS.filter(([, re]) => re.test(text)).map(([g]) => g);
  if (hits.length >= 3) return 'studio'; // a "we do it all" post
  if (hits.length) return hits[0];
  // Nothing in the caption: the hashtags say what the post is promoting.
  return hashtags.some((h) => /brazilian|wax/i.test(h)) ? 'waxing' : 'studio';
}

const items = await datasetFromArgsOr('apify/instagram-scraper', {
  directUrls: [`https://www.instagram.com/${HANDLE}/`],
  resultsType: 'posts',
  resultsLimit: LIMIT,
  addParentData: false,
});

mkdirSync(OUT_DIR, { recursive: true });
const posts = [];
for (const p of items) {
  const caption = (p.caption ?? '').trim();
  if (!p.shortCode || EXCLUDE.test(caption)) continue;
  const text = caption.replace(/#[\w]+/g, ' ').replace(/\s+/g, ' ').trim();
  // The salon's own name contains "wax"; don't let it decide the group.
  const forMatching = text.replace(/the wax ?room|waxroom\w*/gi, ' ');
  const group = classify(forMatching, p.hashtags ?? []);
  const cover = p.displayUrl ?? p.childPosts?.[0]?.displayUrl;
  if (!cover) continue;

  const file = `${p.shortCode}.jpg`;
  if (!existsSync(OUT_DIR + file)) {
    const res = await fetch(cover);
    if (!res.ok) {
      console.warn(`skip ${p.shortCode}: image ${res.status}`);
      continue;
    }
    const tmp = `${OUT_DIR}.${p.shortCode}.src`;
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', 'scale=720:-2', '-q:v', '5', OUT_DIR + file]);
    rmSync(tmp);
    if (ff.status !== 0) {
      console.warn(`skip ${p.shortCode}: ffmpeg failed`);
      continue;
    }
  }
  posts.push({
    id: p.shortCode,
    type: p.type === 'Video' ? 'video' : p.type === 'Sidecar' ? 'carousel' : 'image',
    group,
    caption: text.length > 220 ? `${text.slice(0, 217).replace(/\s+\S*$/, '')}…` : text,
    alt: p.alt ?? null,
    date: p.timestamp,
    image: `/gallery/${file}`,
    width: p.dimensionsWidth ?? null,
    height: p.dimensionsHeight ?? null,
    url: `https://www.instagram.com/p/${p.shortCode}/`,
  });
}

if (posts.length === 0) throw new Error('No Instagram posts; leaving the gallery untouched.');
posts.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

// Drop images for posts that fell out of the feed.
const keep = new Set(posts.map((p) => `${p.id}.jpg`));
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.jpg') && !keep.has(f)) rmSync(OUT_DIR + f);

await writeJson(OUT_JSON, { handle: HANDLE, profileUrl: `https://www.instagram.com/${HANDLE}/`, posts });
const counts = posts.reduce((m, p) => ((m[p.group] = (m[p.group] ?? 0) + 1), m), {});
console.log(`${posts.length} posts`, counts);
