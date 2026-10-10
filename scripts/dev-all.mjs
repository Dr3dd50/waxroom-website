// Everything at once for local work and demos:
//   API        http://localhost:8787/api  (sample data, payments and texts simulated)
//   Website    http://localhost:5173      (as it goes live: Book buttons open GlossGenius)
//   Website    http://localhost:5175      (after the switch: our own booking)
//   Dashboard  http://localhost:5174      (owner: waxroomrichmond@gmail.com / waxroom-demo)
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'npx', ['tsx', 'watch', 'platform/api/src/server.ts'], {}],
  ['site', 'npx', ['vite', '--port', '5173', '--strictPort', '--host', '0.0.0.0'], {}],
  ['book', 'npx', ['vite', '--port', '5175', '--strictPort', '--host', '0.0.0.0'], { VITE_BOOKING: 'native' }],
  ['dash', 'npx', ['vite', '--config', 'dashboard/vite.config.ts', '--host', '0.0.0.0'], {}],
];
const colors = { api: 33, site: 36, book: 32, dash: 35 };
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
