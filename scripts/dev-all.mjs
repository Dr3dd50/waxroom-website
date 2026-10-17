// Everything at once for local work and demos:
//   API        http://localhost:8787/api  (sample data, texts simulated; payments simulated,
//                                          or Stripe test mode with keys in .env.local)
//   Website    http://localhost:5173      (as it goes live: Book buttons open GlossGenius)
//   Website    http://localhost:5175      (after the switch: our own booking)
//   Dashboard  http://localhost:5174      (owner: waxroomrichmond@gmail.com / waxroom-demo)
// Tools run straight through node rather than npx, so this works the same on
// Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensurePackages } from './ensure-packages.mjs';

const root = resolve(import.meta.dirname, '..');

/**
 * Stripe test keys for the local API, from .env.local (git ignores *.local):
 *   STRIPE_SECRET_KEY=sk_test_…
 *   STRIPE_PUBLISHABLE_KEY=pk_test_…
 * Only these two are read, and only test keys: live keys would charge real cards.
 */
function stripeTestKeys() {
  const file = resolve(root, '.env.local');
  if (!existsSync(file)) return {};
  const keys = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(STRIPE_SECRET_KEY|STRIPE_PUBLISHABLE_KEY)\s*=\s*['"]?([^'"\s]+)/);
    if (m) keys[m[1]] = m[2];
  }
  if (Object.values(keys).some((v) => !/^(sk|pk|rk)_test_/.test(v))) {
    console.error('.env.local: only Stripe test keys (sk_test_…, pk_test_…) run locally. Payments stay simulated.');
    return {};
  }
  if (keys.STRIPE_SECRET_KEY && keys.STRIPE_PUBLISHABLE_KEY) return keys;
  if (Object.keys(keys).length) console.error('.env.local: both STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are needed. Payments stay simulated.');
  return {};
}

// New packages since the last install (after a git pull, say): install them first.
ensurePackages(root);
const tsx = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');

const procs = [
  ['api', [tsx, 'watch', 'platform/api/src/server.ts'], stripeTestKeys()],
  ['site', [vite, '--port', '5173', '--strictPort'], {}],
  ['book', [vite, '--port', '5175', '--strictPort'], { VITE_BOOKING: 'native' }],
  ['dash', [vite, '--config', 'dashboard/vite.config.ts'], {}],
];
const colors = { api: 33, site: 36, book: 32, dash: 35 };
const children = procs.map(([name, args, env]) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = (buf) => buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`\x1b[${colors[name]}m${name.padEnd(4)}\x1b[0m ${l}`));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  child.on('error', (e) => console.error(`${name}: ${e.message}`));
  child.on('exit', (code) => code && console.error(`${name} stopped (exit ${code})`));
  return child;
});
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
