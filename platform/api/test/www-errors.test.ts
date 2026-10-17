// On www, CloudFront swaps any 403 for the site's 404 page (a missing page comes back
// from S3 as a 403), so a 403 from the API would reach the website without its message.
// Nothing the website calls may answer 403.
//   npx tsx --test platform/api/test/www-errors.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const src = join(import.meta.dirname, '../src');
const files = ['routes/public.ts', ...readdirSync(join(src, 'services')).map((f) => `services/${f}`)];

test('the public routes and the services they call never answer 403', () => {
  for (const f of files) {
    const hits = readFileSync(join(src, f), 'utf8').split('\n').filter((l) => /HttpError\(\s*403|,\s*403\s*\)/.test(l));
    assert.deepEqual(hits, [], `${f} answers 403; use 409 (or 401 for sign-in), see platform/infra/stack.ts`);
  }
});
