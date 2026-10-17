// New packages since the last install (after a git pull, say): install them before
// building or deploying, or the build stops on a missing package. `npm ci` installs
// exactly what package-lock.json lists and never rewrites it, so the next git pull
// isn't blocked by a local lockfile change.
//   node scripts/ensure-packages.mjs     (deploy:live, dev:all and cdk run it for you)
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, utimesSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function ensurePackages(root = resolve(import.meta.dirname, '..')) {
  const lock = resolve(root, 'package-lock.json');
  const installed = resolve(root, 'node_modules/.package-lock.json');
  if (existsSync(installed) && statSync(lock).mtimeMs <= statSync(installed).mtimeMs) return;
  // cdk reads the app's output, so progress goes to stderr
  console.error('Packages changed since the last install: running npm ci…');
  const r = spawnSync('npm ci', { cwd: root, stdio: ['ignore', process.stderr, 'inherit'], shell: true });
  if (r.status) process.exit(r.status);
  if (existsSync(installed)) utimesSync(installed, new Date(), new Date()); // installed as of now, even if npm changed nothing
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ensurePackages();
