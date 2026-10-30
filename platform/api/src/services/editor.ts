// Where edited videos live and how the editor is started. Two backends with one shape:
// on AWS the browser uploads straight to S3 (a function URL takes 6 MB at most) and a
// container Lambda runs platform/editor; locally the file comes through this API and
// edit.py runs as a child process. Either way the editor leaves progress.json, then
// result.json or error.json, next to its outputs, and `poll` reads them.
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config';
import type { ContentEdit, EditResult } from '../types';

/** What the editor writes, and so what can be fetched. */
export const EDIT_FILES = ['edited.mp4', 'captions.srt'] as const;
/** The Lambda stops at 15 minutes; past this a job that never reported is called failed. */
const STALE_MS = 20 * 60 * 1000;

export type Poll = Pick<ContentEdit, 'status' | 'progress' | 'result' | 'error'>;

export interface EditorBackend {
  /** Where the browser sends the original. */
  uploadTarget(e: ContentEdit): Promise<{ url: string; method: 'PUT' }>;
  uploaded(e: ContentEdit): Promise<boolean>;
  start(e: ContentEdit): Promise<void>;
  poll(e: ContentEdit): Promise<Poll | null>;
  /** A response for one output: streamed here, or a redirect to a signed S3 link. */
  file(e: ContentEdit, name: string, download: boolean, range?: string): Promise<Response>;
  remove(e: ContentEdit): Promise<void>;
}

const flags = (e: ContentEdit) => [...(e.options.cut ? [] : ['--no-cut']), ...(e.options.captions ? [] : ['--no-captions']), '--sfx', e.options.sfx, '--music', e.options.music, '--pace', e.options.pace];
const downloadName = (e: ContentEdit, name: string) => `${e.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'video'}-edited${name.slice(name.lastIndexOf('.'))}`;
const stale = (e: ContentEdit) => !!e.startedAt && Date.now() - Date.parse(e.startedAt) > STALE_MS;

// ── this machine ──

class LocalEditor implements EditorBackend {
  private dir = (e: ContentEdit) => join(config.editor.dir, e.id);
  private running = new Set<string>();

  async uploadTarget(e: ContentEdit) {
    return { url: `/api/staff/edits/${e.id}/source`, method: 'PUT' as const };
  }
  /** Called by the PUT route with the request body. */
  async receive(e: ContentEdit, body: ReadableStream<Uint8Array>) {
    mkdirSync(this.dir(e), { recursive: true });
    await pipeline(Readable.fromWeb(body as never), createWriteStream(join(this.dir(e), 'source')));
  }
  async uploaded(e: ContentEdit) {
    const f = join(this.dir(e), 'source');
    return existsSync(f) && statSync(f).size > 0;
  }
  async start(e: ContentEdit) {
    const dir = this.dir(e);
    const out = join(dir, 'out');
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    this.running.add(e.id);
    let stderr = '';
    const child = spawn(config.editor.python, [config.editor.script, join(dir, 'source'), out, ...flags(e)], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-2000)));
    const fail = (why: string) => writeFileSync(join(out, 'error.json'), JSON.stringify({ error: why }));
    child.on('error', (err) => {
      this.running.delete(e.id);
      fail(`Couldn’t start the editor (${err.message}). Run platform/editor/setup.sh once on this machine.`);
    });
    child.on('exit', (code) => {
      this.running.delete(e.id);
      if (code === 0 && existsSync(join(out, 'report.json'))) writeFileSync(join(out, 'result.json'), readFileSync(join(out, 'report.json')));
      else if (!existsSync(join(out, 'error.json'))) fail(stderr.trim().split('\n').pop() || `The editor stopped (exit ${code}).`);
    });
  }
  async poll(e: ContentEdit): Promise<Poll | null> {
    const out = join(this.dir(e), 'out');
    const read = (n: string) => (existsSync(join(out, n)) ? JSON.parse(readFileSync(join(out, n), 'utf8')) : null);
    const result = read('result.json') as EditResult | null;
    if (result) return { status: 'done', result, progress: undefined };
    const err = read('error.json') as { error: string } | null;
    if (err) return { status: 'failed', error: err.error, progress: undefined };
    // the API restarted while it ran: the child went with it
    if (!this.running.has(e.id) && stale(e)) return { status: 'failed', error: 'The edit stopped part way. Try it again.' };
    const progress = read('progress.json');
    return progress ? { status: 'processing', progress } : null;
  }
  async file(e: ContentEdit, name: string, download: boolean, range?: string) {
    const path = join(this.dir(e), 'out', name);
    if (!existsSync(path)) return new Response('Not found', { status: 404 });
    const size = statSync(path).size;
    const headers: Record<string, string> = { 'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'application/x-subrip', 'Accept-Ranges': 'bytes' };
    if (download) headers['Content-Disposition'] = `attachment; filename="${downloadName(e, name)}"`;
    // the <video> player asks for byte ranges to seek
    const m = range?.match(/bytes=(\d*)-(\d*)/);
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
      return new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } });
  }
  async remove(e: ContentEdit) {
    rmSync(this.dir(e), { recursive: true, force: true });
  }
}

// ── AWS ──

class S3Editor implements EditorBackend {
  constructor(
    private bucket: string,
    private fn: string,
  ) {}
  private prefix = (e: ContentEdit) => `edits/${e.id}/`;
  private async s3() {
    const s3 = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return { ...s3, client: new s3.S3Client({}), getSignedUrl };
  }

  async uploadTarget(e: ContentEdit) {
    const { client, PutObjectCommand, getSignedUrl } = await this.s3();
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: this.bucket, Key: `${this.prefix(e)}source` }), { expiresIn: 3600 });
    return { url, method: 'PUT' as const };
  }
  async uploaded(e: ContentEdit) {
    const { client, HeadObjectCommand } = await this.s3();
    try {
      return ((await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `${this.prefix(e)}source` }))).ContentLength ?? 0) > 0;
    } catch {
      return false;
    }
  }
  async start(e: ContentEdit) {
    // a retry: clear what the last run left, or poll would read its outcome
    const { client, DeleteObjectsCommand } = await this.s3();
    await client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: ['result.json', 'error.json', 'progress.json'].map((n) => ({ Key: `${this.prefix(e)}${n}` })) } }));
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const payload = { bucket: this.bucket, source: `${this.prefix(e)}source`, prefix: this.prefix(e), options: e.options };
    // 'Event': queued and run in the background; the dashboard polls for the outcome
    await new LambdaClient({}).send(new InvokeCommand({ FunctionName: this.fn, InvocationType: 'Event', Payload: new TextEncoder().encode(JSON.stringify(payload)) }));
  }
  private async json<T>(key: string): Promise<T | null> {
    const { client, GetObjectCommand } = await this.s3();
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return JSON.parse(await r.Body!.transformToString()) as T;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }
  async poll(e: ContentEdit): Promise<Poll | null> {
    const result = await this.json<EditResult>(`${this.prefix(e)}result.json`);
    if (result) return { status: 'done', result, progress: undefined };
    const err = await this.json<{ error: string }>(`${this.prefix(e)}error.json`);
    if (err) return { status: 'failed', error: err.error, progress: undefined };
    if (stale(e)) return { status: 'failed', error: 'The edit ran out of time. Try a shorter video, or try again.' };
    const progress = await this.json<{ stage: string; pct: number }>(`${this.prefix(e)}progress.json`);
    return progress ? { status: 'processing', progress } : null;
  }
  async file(e: ContentEdit, name: string, download: boolean) {
    const { client, GetObjectCommand, getSignedUrl } = await this.s3();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: `${this.prefix(e)}${name}`, ResponseContentDisposition: download ? `attachment; filename="${downloadName(e, name)}"` : undefined }),
      { expiresIn: 3600 },
    );
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
  }
  async remove(e: ContentEdit) {
    const { client, ListObjectsV2Command, DeleteObjectsCommand } = await this.s3();
    const list = await client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.prefix(e) }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
  }
}

export const local = new LocalEditor();
export const editor: EditorBackend = config.editor.bucket && config.editor.fn ? new S3Editor(config.editor.bucket, config.editor.fn) : local;
