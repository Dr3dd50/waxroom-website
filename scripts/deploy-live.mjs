// Put the website on www.waxroomrichmond.com as it is hosted today: the CloudFront
// distribution that answers for the domain, and the S3 bucket behind it. Since the switch
// from GlossGenius it's the version with our own booking, whose pages call the booking
// system on the staff domain (www has no /api of its own).
//
//   npm run deploy:live            build, upload, refresh the CDN
//   npm run deploy:live -- --check only show which distribution and bucket it would use
//
// Needs the AWS CLI, signed in as a user that may write to that bucket and create
// CloudFront invalidations. Works the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensurePackages } from './ensure-packages.mjs';

const DOMAIN = 'www.waxroomrichmond.com';
const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', ...opts });
  if (r.error || r.status) {
    if (opts.quiet) process.stderr.write(r.stderr ?? '');
    throw new Error(`Failed: ${cmd}`);
  }
  return r.stdout ?? '';
}
const aws = (args) => JSON.parse(run(`aws ${args} --output json`, { quiet: true }) || 'null');

const API = 'https://staff.waxroomrichmond.com';

try {
  run('aws --version', { quiet: true });
} catch {
  console.error('The AWS CLI is needed: https://aws.amazon.com/cli/ , then `aws configure`.');
  process.exit(1);
}

// The distribution answering for the domain, and the S3 bucket (and folder) behind it.
const list = aws('cloudfront list-distributions');
const dist = (list?.DistributionList?.Items ?? []).find((d) => (d.Aliases?.Items ?? []).includes(DOMAIN));
if (!dist) {
  console.error(`No CloudFront distribution in this account answers for ${DOMAIN}.`);
  process.exit(1);
}
const origin = dist.Origins.Items.find((o) => /\.s3[.-]/.test(o.DomainName));
if (!origin) {
  console.error(`Distribution ${dist.Id} doesn't serve the site from S3 (${dist.Origins.Items.map((o) => o.DomainName).join(', ')}).`);
  process.exit(1);
}
const bucket = origin.DomainName.replace(/\.s3([.-][a-z0-9-]+)*\.amazonaws\.com$/, '');
const target = `s3://${bucket}${origin.OriginPath || ''}`;
console.log(`${DOMAIN} → CloudFront ${dist.Id} → ${target}`);
if (check) process.exit(0);

// Our own booking, once the booking system says it's open (the dashboard's switch from
// GlossGenius); before that the site's Book buttons would lead nowhere.
const live = await fetch(`${API}/api/public/config`).then((r) => r.json()).catch(() => null);
if (live?.booking !== 'open') {
  console.error(`The booking system at ${API} isn't open yet (${live ? `booking: ${live.booking}` : 'no answer'}). Switch over in the dashboard first.`);
  process.exit(1);
}
// and it must already let www call it (the API from this code, deployed with `npx cdk deploy`)
const pre = await fetch(`${API}/api/public/config`, { method: 'OPTIONS', headers: { Origin: `https://${DOMAIN}`, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }).catch(() => null);
if (pre?.headers.get('access-control-allow-origin') !== `https://${DOMAIN}`) {
  console.error(`The booking system doesn't accept calls from ${DOMAIN} yet. Deploy it first: npm run build:native, npm run build:dashboard, npx cdk deploy.`);
  process.exit(1);
}
ensurePackages(root); // after a git pull that added a package
run('npm run build', { env: { ...process.env, VITE_BOOKING: 'native', VITE_API_URL: API } });
const mode = JSON.parse(readFileSync(resolve(root, 'dist/booking-mode.json'), 'utf8')).booking;
if (mode !== 'native') {
  console.error(`dist/ was built with ${mode} booking.`);
  process.exit(1);
}

// Hashed files never change, so browsers keep them; pages are checked every visit.
// Nothing is deleted, so a visitor mid-visit on the old pages still gets their files.
run(`aws s3 sync dist/assets "${target}/assets" --cache-control "public, max-age=31536000, immutable" --only-show-errors`);
run(`aws s3 sync dist "${target}" --exclude "assets/*" --cache-control "public, max-age=0, must-revalidate" --only-show-errors`);
const inv = aws(`cloudfront create-invalidation --distribution-id ${dist.Id} --paths "/*"`);
console.log(`Uploaded. CloudFront is refreshing (invalidation ${inv?.Invalidation?.Id}); the new pages show within a few minutes.`);
