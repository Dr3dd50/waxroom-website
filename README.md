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
| Doodle code videos | `motion/` (canvas scenes rendered to MP4/WebM) | `node motion/render.mjs` |

Both sync scripts need `APIFY_TOKEN` in the environment. The
`Refresh Google reviews & menu` GitHub Action runs them daily and commits any
changes. Add an `APIFY_TOKEN` repository secret to enable it.

## Pages

- `/` — home
- `/services/<slug>/` — one in-depth page per category (see `src/content/services.ts`)
- `/mockups/services/` — temporary: the three home-page service layouts under review

## Doodle videos

Each page's looping video is drawn in code (`motion/scenes.js`), a pure function of
time on a canvas, the same approach as the ChurnMiser motion studies. To change one,
edit its scene, preview with `node motion/render.mjs --serve`, then re-render with
`node motion/render.mjs <scene>`.
