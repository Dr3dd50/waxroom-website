// Minimal Apify client: run an Actor synchronously and return its dataset items.
// Token comes from APIFY_TOKEN (or APIFY_KEY). Docs: https://docs.apify.com/api/v2

import { readFile, writeFile } from 'node:fs/promises';

export function getToken() {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_KEY;
  if (!token) {
    throw new Error('Set APIFY_TOKEN (or APIFY_KEY) to run this script, or pass --input <dataset.json>.');
  }
  return token;
}

export async function runActor(actorId, input, { timeoutSecs = 290 } = {}) {
  const url = new URL(`https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/run-sync-get-dataset-items`);
  url.searchParams.set('timeout', String(timeoutSecs));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    throw new Error(`Apify ${actorId} failed (${res.status}): ${JSON.stringify(body)?.slice(0, 500)}`);
  }
  return body;
}

/** Use a saved dataset when `--input file.json` is passed, otherwise run the Actor. */
export async function datasetFromArgsOr(actorId, input) {
  const i = process.argv.indexOf('--input');
  if (i !== -1) return JSON.parse(await readFile(process.argv[i + 1], 'utf8'));
  return runActor(actorId, input);
}

export async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${path}`);
}
