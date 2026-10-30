// The video editor's plumbing: upload, start, progress, the finished files, and who
// can see what. A stand-in editor writes what platform/editor/edit.py writes, so this runs
// without Python or ffmpeg (platform/editor/test_edit.py covers the editing itself).
//   npx tsx --test platform/api/test/edits.test.ts
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'wr-edits-'));
process.env.DATA_FILE = join(dir, 'store.json');
process.env.EDITS_DIR = join(dir, 'edits');
process.env.DEMO_DATA = 'false';
process.env.OWNER_PASSWORD = 'owner-pass-123';
// run as `sh <this> <source> <out dir> [flags]`; fails when asked for no captions
const fake = join(dir, 'fake-editor.sh');
writeFileSync(
  fake,
  `#!/bin/sh
out="$2"
case "$*" in *--no-captions*) echo "Couldn't read that video." >&2; exit 1;; esac
echo '{"stage":"Rendering","pct":0.5}' > "$out/progress.json"
sleep 0.3
printf 'edited:%s' "$(cat "$1")" > "$out/edited.mp4"
printf '1\\n00:00:00,000 --> 00:00:01,000\\nHi\\n' > "$out/captions.srt"
echo '{"durationIn":10,"durationOut":8,"cuts":2,"removedSeconds":2,"captions":1,"words":1,"transcript":"Hi","sfx":[],"size":[1080,1920],"seconds":1,"files":["edited.mp4","captions.srt"]}' > "$out/report.json"
`,
);
chmodSync(fake, 0o755);
process.env.EDITOR_PYTHON = 'sh';

const { config } = await import('../src/config');
config.editor.script = fake;
const { makeApp, makeStore } = await import('../src/app');
const store = await makeStore();
const app = makeApp(store);

let cookie = '';
async function call(method: string, path: string, body?: unknown, raw?: string) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': raw === undefined ? 'application/json' : 'video/mp4', cookie },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, json: json as any, headers: res.headers };
}
const login = (email: string, password: string) => call('POST', '/staff/login', { email, password });
async function waitFor(id: string, status: string) {
  for (let i = 0; i < 50; i++) {
    const e = (await call('GET', `/staff/edits/${id}`)).json;
    if (e.status === status) return e;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never ${status}`);
}

test('signed out, the editor isn’t there', async () => {
  assert.equal((await call('GET', '/staff/edits')).status, 401);
});

test('an employee uploads, edits and downloads a video; the owner sees it, other employees don’t', async () => {
  await login('waxroomrichmond@gmail.com', 'owner-pass-123');
  const team = (await call('GET', '/staff/bootstrap')).json.staff.filter((s: any) => s.role === 'employee');
  await call('PATCH', `/staff/team/${team[0].id}`, { email: 'one@example.com', password: 'employee-pass' });
  await call('PATCH', `/staff/team/${team[1].id}`, { email: 'two@example.com', password: 'employee-pass' });

  await login('one@example.com', 'employee-pass');
  assert.equal((await call('POST', '/staff/edits', { name: 'notes.txt', bytes: 5, type: 'text/plain' })).status, 400);
  const made = (await call('POST', '/staff/edits', { name: 'Brow lamination.mov', bytes: 9, type: 'video/quicktime', options: { sfx: false, pace: 'tight' } })).json;
  assert.deepEqual(made.edit.options, { cut: true, captions: true, sfx: false, pace: 'tight' });
  assert.equal(made.upload.url, `/api/staff/edits/${made.edit.id}/source`);
  const id = made.edit.id;

  assert.equal((await call('POST', `/staff/edits/${id}/start`)).status, 400, 'nothing uploaded yet');
  assert.equal((await call('PUT', `/staff/edits/${id}/source`, undefined, 'raw-video')).status, 200);
  assert.equal((await call('POST', `/staff/edits/${id}/start`)).json.status, 'processing');
  const done = await waitFor(id, 'done');
  assert.equal(done.result.removedSeconds, 2);
  assert.equal(done.progress, undefined);

  const video = await call('GET', `/staff/edits/${id}/file/edited.mp4`);
  assert.equal(video.json, 'edited:raw-video');
  const part = await app.request(`/api/staff/edits/${id}/file/edited.mp4`, { headers: { cookie, range: 'bytes=0-5' } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), 'edited');
  const srt = await call('GET', `/staff/edits/${id}/file/captions.srt?download=1`);
  assert.match(srt.headers.get('content-disposition')!, /Brow-lamination-edited\.srt/);
  assert.equal((await call('GET', `/staff/edits/${id}/file/source`)).status, 404, 'only the outputs can be fetched');

  await login('two@example.com', 'employee-pass');
  assert.deepEqual((await call('GET', '/staff/edits')).json, []);
  assert.equal((await call('GET', `/staff/edits/${id}/file/edited.mp4`)).status, 404);
  assert.equal((await call('DELETE', `/staff/edits/${id}`)).status, 404);

  await login('waxroomrichmond@gmail.com', 'owner-pass-123');
  assert.deepEqual((await call('GET', '/staff/edits')).json.map((e: any) => e.id), [id]);
  assert.equal((await call('DELETE', `/staff/edits/${id}`)).status, 200);
  assert.deepEqual((await call('GET', '/staff/edits')).json, []);
});

test('a failed edit says why and can be tried again', async () => {
  await login('waxroomrichmond@gmail.com', 'owner-pass-123');
  const { edit } = (await call('POST', '/staff/edits', { name: 'clip.mp4', bytes: 3, type: 'video/mp4', options: { captions: false } })).json;
  await call('PUT', `/staff/edits/${edit.id}/source`, undefined, 'abc');
  await call('POST', `/staff/edits/${edit.id}/start`);
  const failed = await waitFor(edit.id, 'failed');
  assert.equal(failed.error, "Couldn't read that video.");
  assert.equal((await call('POST', `/staff/edits/${edit.id}/start`)).json.status, 'processing');
});
