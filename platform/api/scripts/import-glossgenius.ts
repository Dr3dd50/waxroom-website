// Import a GlossGenius export from the command line (the dashboard does the same
// under Settings → Online booking). See services/importer.ts for what it does.
//
//   npx tsx platform/api/scripts/import-glossgenius.ts --clients clients.csv [--appointments appointments.csv] [--dry-run]
import { readFileSync } from 'node:fs';
import { makeStore } from '../src/app';
import { importGlossGenius } from '../src/services/importer';
import type { Settings } from '../src/types';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes('--dry-run');
const clients = arg('--clients'), appointments = arg('--appointments');
if (!clients && !appointments) {
  console.log('Usage: --clients clients.csv [--appointments appointments.csv] [--dry-run]');
  process.exit(1);
}

const store = await makeStore();
const report = await importGlossGenius(store, { clients: clients && readFileSync(clients, 'utf8'), appointments: appointments && readFileSync(appointments, 'utf8') }, { dryRun });
if (report.clients) console.log(`Clients: ${report.clients.added} added, ${report.clients.matched} matched, ${report.clients.skipped} skipped (banned or no phone/name).`);
if (report.appointments) {
  const a = report.appointments;
  console.log(`Appointments: ${a.added} added, ${a.updated} updated, ${a.unchanged} unchanged, ${a.unmatched} couldn't be matched.`);
  if (a.problems.length) console.log('Check these by hand:\n  ' + a.problems.join('\n  '));
}
if (dryRun) console.log('(dry run: nothing saved)');
else {
  const s = (await store.get<Settings>('settings', 'settings'))!;
  await store.put('settings', { ...s, glossGeniusImport: { ...s.glossGeniusImport, ...report, by: 'command line' } });
}
