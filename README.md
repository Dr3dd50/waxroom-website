# The Wax Room — waxroomrichmond.com

Marketing site for The Wax Room (Midlothian, VA). Vite + React + GSAP, pre-rendered
to static HTML per page. Booking stays on GlossGenius.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, build, pre-render every page into dist/
npm run preview    # serve dist/
```

## Where content comes from

| Data | Source | Refresh |
|---|---|---|
| Services, prices, durations, memberships, packages, team, hours | GlossGenius booking site, via Apify | `npm run sync:menu` |
| 5-star Google reviews, rating, review count | Google Business Profile, via Apify | `npm run sync:reviews` |
| Service page copy (intro, what to expect, aftercare, FAQs) | `src/content/services.ts` | edit by hand |
| Gallery (photos and posts) | Instagram @waxroomrichmond, via Apify | `npm run sync:instagram` |
| Doodle code videos | `motion/` (canvas scenes rendered to MP4/WebM) | `node motion/render.mjs` |

The sync scripts need `APIFY_TOKEN` in the environment. The
`Refresh Google reviews, menu & gallery` GitHub Action runs them daily and commits any
changes. Add an `APIFY_TOKEN` repository secret to enable it.

## Pages

- `/` — home
- `/services/<slug>/` — one in-depth page per category (see `src/content/services.ts`)
- `/gallery/` — real results from Instagram (`npm run sync:instagram`)
- `/lp/<slug>/` — Meta ad landing pages (`src/content/adLandingPages.ts`): a service page
  re-cut for paid traffic, with no site menu and every button booking. Prerendered with
  `noindex` and kept out of the sitemap. `/lp/jet-plasma/` is the first.

## SEO tracking (DataForSEO)

What to track lives in `seo/config.json`. Waxing and Jet Plasma come first, and the
area is greater Richmond, weighted to Midlothian and the counties around it. Both
scripts need `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`, the API credentials from
app.dataforseo.com → API Access. Pass `--dry-run` to see what a run would do and
roughly what it would cost, without spending anything.

| Command | What it does | Output | Cost |
|---|---|---|---|
| `npm run seo:keywords` | Monthly Google searches for every service × area keyword (Richmond-Petersburg DMA), totalled per page and per *proposed* page | `seo/KEYWORDS.md`, `seo/data/keyword-volumes.json` | ~$0.09 a run; run it when the keyword list changes |
| `npm run seo:rankings` | Our Google Maps position from every point of two 5×5 grids (Midlothian at 1.5 mi spacing, greater Richmond at 4 mi), plus our Google search rank and map-pack spot from the studio | `seo/RANKINGS.md`, `seo/data/rankings/<date>.json` | ~$1.50 a run |
| `npm run test:seo` | Unit tests for both | | free |

Both run on GitHub, so nothing needs installing locally. The `SEO rankings` Action
runs `seo:rankings` every Monday. The `SEO keyword study` Action runs `seo:keywords`
whenever the keyword list or script changes, or by hand (Actions → SEO keyword
study → Run workflow). Each commits its report to the branch it ran on. Add
`DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` repository secrets to enable them;
until those exist, they skip.

## Doodle videos

Each page's looping video is drawn in code (`motion/scenes.js`), a pure function of
time on a canvas, the same approach as the ChurnMiser motion studies. To change one,
edit its scene, preview with `node motion/render.mjs --serve`, then re-render with
`node motion/render.mjs <scene>`.
