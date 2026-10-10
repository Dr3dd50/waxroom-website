// Everything at once for local work and demos:
//   API        http://localhost:8787/api  (sample data, payments and texts simulated)
//   Website    http://localhost:5173      (our own booking: the "native" version)
//   Dashboard  http://localhost:5174      (owner: waxroomrichmond@gmail.com / waxroom-demo)
// Add `--glossgenius` to run the website as the live version instead.
import { spawn } from 'node:child_process';

const native = !process.argv.includes('--glossgenius');
const procs = [
  ['api', 'npx', ['tsx', 'watch', 'platform/api/src/server.ts'], {}],
  ['site', 'npx', ['vite', '--port', '5173', '--host', '0.0.0.0'], native ? { VITE_BOOKING: 'native' } : {}],
  ['dash', 'npx', ['vite', '--config', 'dashboard/vite.config.ts', '--host', '0.0.0.0'], {}],
];
const colors = { api: 33, site: 36, dash: 35 };
const children = procs.map(([name, cmd, args, env]) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = (buf) => buf.toString().split('\n').filter(Boolean).forEach((l) => console.log(`\x1b[${colors[name]}m${name.padEnd(4)}\x1b[0m ${l}`));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  return child;
});
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
