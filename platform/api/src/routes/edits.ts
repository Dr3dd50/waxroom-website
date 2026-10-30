// The video editor, for anyone signed in to the dashboard: upload a raw video, and
// platform/editor cuts the dead air, captions it and adds sound effects. Employees see
// their own edits; the owner sees everyone's. Mounted under /staff, behind its sign-in.
import { Hono } from 'hono';
import type { Env } from '../auth';
import { HttpError, bad, nowIso, rid } from '../lib/util';
import { EDIT_FILES, editor, local } from '../services/editor';
import type { Store } from '../store/store';
import type { ContentEdit, EditOptions, Staff } from '../types';

/** Phone videos of a few minutes run a few hundred MB; past this something's wrong. */
const MAX_BYTES = 2 * 1024 ** 3;

export function editRoutes(store: Store) {
  const r = new Hono<Env>();

  const mine = (me: Staff, e: ContentEdit) => me.role === 'owner' || e.staffId === me.id;
  async function editOr404(me: Staff, id: string) {
    const e = await store.get<ContentEdit>('edits', id);
    if (!e || !mine(me, e)) throw new HttpError(404, 'That video isn’t here any more.');
    return e;
  }
  /** Brings a running edit up to date with what the editor has written. */
  async function fresh(e: ContentEdit) {
    if (e.status !== 'processing') return e;
    const p = await editor.poll(e);
    if (!p || (p.status === e.status && JSON.stringify(p.progress) === JSON.stringify(e.progress))) return e;
    return store.put('edits', { ...e, ...p });
  }

  r.get('/', async (c) => {
    const me = c.get('staff');
    const all = (await store.list<ContentEdit>('edits')).filter((e) => mine(me, e)).reverse();
    return c.json(await Promise.all(all.map(fresh)));
  });

  r.post('/', async (c) => {
    const b = await c.req.json<{ name?: string; bytes?: number; type?: string; options?: Partial<EditOptions> }>();
    if (!b.type?.startsWith('video/')) throw bad('Pick a video file.');
    if (!b.bytes || b.bytes <= 0) throw bad('That file is empty.');
    if (b.bytes > MAX_BYTES) throw bad('That video is over 2 GB. Trim it or export it smaller first.');
    const o = b.options ?? {};
    const e: ContentEdit = {
      id: `${nowIso()}-${rid(4)}`,
      createdAt: nowIso(),
      staffId: c.get('staff').id,
      name: (b.name ?? 'video').slice(0, 120),
      bytes: b.bytes,
      options: { cut: o.cut !== false, captions: o.captions !== false, sfx: o.sfx !== false, pace: o.pace === 'tight' ? 'tight' : 'natural' },
      status: 'uploading',
    };
    await store.put('edits', e);
    return c.json({ edit: e, upload: await editor.uploadTarget(e) });
  });

  // local only: on AWS the browser puts the file straight into S3
  r.put('/:id/source', async (c) => {
    const e = await editOr404(c.get('staff'), c.req.param('id'));
    if (editor !== local) throw bad('Upload to the link the editor gave you.');
    if (e.status !== 'uploading') throw bad('That video is already uploaded.');
    if (!c.req.raw.body) throw bad('No file came through.');
    await local.receive(e, c.req.raw.body);
    return c.json({ ok: true });
  });

  r.post('/:id/start', async (c) => {
    const e = await editOr404(c.get('staff'), c.req.param('id'));
    if (e.status === 'processing' || e.status === 'done') return c.json(e);
    if (!(await editor.uploaded(e))) throw bad('The video hasn’t finished uploading.');
    const started = await store.put('edits', { ...e, status: 'processing' as const, startedAt: nowIso(), progress: { stage: 'Waiting for the editor', pct: 0 }, error: undefined });
    await editor.start(started);
    return c.json(started);
  });

  r.get('/:id', async (c) => c.json(await fresh(await editOr404(c.get('staff'), c.req.param('id')))));

  r.get('/:id/file/:name', async (c) => {
    const e = await editOr404(c.get('staff'), c.req.param('id'));
    const name = c.req.param('name');
    if (e.status !== 'done' || !(EDIT_FILES as readonly string[]).includes(name) || !e.result?.files.includes(name)) throw new HttpError(404, 'Not ready yet.');
    return editor.file(e, name, c.req.query('download') === '1', c.req.header('range'));
  });

  r.delete('/:id', async (c) => {
    const e = await editOr404(c.get('staff'), c.req.param('id'));
    await editor.remove(e);
    await store.delete('edits', e.id);
    return c.json({ ok: true });
  });

  return r;
}
