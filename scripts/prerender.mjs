// Renders every route to static HTML after `vite build`, so each service page is
// a real, indexable document with its own title, description and canonical URL.
// Also writes sitemap.xml and robots.txt. Run via `npm run build`.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const ssrEntry = resolve(root, 'dist-ssr/entry-server.js');

const { render, PRERENDER_PATHS } = await import(pathToFileURL(ssrEntry).href);
const template = await readFile(resolve(dist, 'index.html'), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const path of PRERENDER_PATHS) {
  const { html, head } = render(path);
  const page = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(head.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(head.description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(head.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(head.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${head.canonical}$2`)
    .replace('</head>', `  <link rel="canonical" href="${head.canonical}" />\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  const outDir = resolve(dist, `.${path}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'index.html'), page);
  console.log(`prerendered ${path}`);
}

const site = 'https://www.waxroomrichmond.com';
await writeFile(
  resolve(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PRERENDER_PATHS.map(
    (p) => `  <url><loc>${site}${p}</loc></url>`,
  ).join('\n')}\n</urlset>\n`,
);
await writeFile(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await rm(resolve(root, 'dist-ssr'), { recursive: true, force: true });
