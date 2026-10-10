// The website build with our own booking (VITE_BOOKING=native), set from node
// so the same command works on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';

const { status } = spawnSync('npm run build', { stdio: 'inherit', shell: true, env: { ...process.env, VITE_BOOKING: 'native' } });
process.exit(status ?? 1);
