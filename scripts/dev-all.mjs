// Everything at once for local work and demos:
//   API        http://localhost:8787/api  (sample data, payments and texts simulated)
//   Website    http://localhost:5173      (as it goes live: Book buttons open GlossGenius)
//   Website    http://localhost:5175      (after the switch: our own booking)
//   Dashboard  http://localhost:5174      (owner: waxroomrichmond@gmail.com / waxroom-demo)
// Tools run straight through node rather than npx, so this works the same on
// Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ensurePackages } from './ensure-packages.mjs';

const root = resolve(import.meta.dirname, '..');

// New packages since the last install (after a git pull, say): install them first.
ensurePackages(root);
const tsx = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');

const procs = [
  ['api', [tsx, 'watch', 'platform/api/src/server.ts'], {}],
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
