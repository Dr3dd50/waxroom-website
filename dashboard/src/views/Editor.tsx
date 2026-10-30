import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { dateShort, time, useBoot } from '../ctx';
import { Icon, PageHead, Pill } from '../ui';

type Options = { cut: boolean; captions: boolean; sfx: 'off' | 'subtle' | 'lively'; music: 'none' | 'calm' | 'warm' | 'upbeat'; pace: 'natural' | 'tight' };
type Result = {
  durationIn: number;
  durationOut: number;
  cuts: number;
  removedSeconds: number;
  captions: number;
  transcript: string;
  dropped: { at: number; said: string; why: string }[];
  sfx: { at: number; sound: string; why: string }[];
  music: { id: string } | null;
  checks: { check: string; ok: boolean; detail: string }[];
  note?: string;
  files: string[];
};
type Edit = {
  id: string;
  createdAt: string;
  staffId: string;
  name: string;
  bytes: number;
  options: Options;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  progress?: { stage: string; pct: number };
  result?: Result;
  error?: string;
};

const DEFAULTS: Options = { cut: true, captions: true, sfx: 'subtle', music: 'none', pace: 'natural' };
const WHY: Record<string, string> = { retake: 'retake', restart: 'restart', filler: 'filler' };
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1)} MB`;

/** PUT a file with upload progress (fetch can't report it). */
function upload(url: string, file: File, onPct: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.upload.onprogress = (e) => e.lengthComputable && onPct(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error('The upload didn’t go through. Try again.')));
    x.onerror = () => reject(new Error('The upload stopped. Check the connection and try again.'));
    x.send(file);
  });
}

export function EditorView() {
  const boot = useBoot();
  const owner = boot.me.role === 'owner';
  const [list, setList] = useState<Edit[] | null>(null);
  const [opts, setOpts] = useState<Options>(DEFAULTS);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<Edit[]>('/edits').then(setList), []);
  useEffect(() => {
    load();
  }, [load]);
  // while anything is being edited, check on it every few seconds
  const busy = (list ?? []).some((e) => e.status === 'processing');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function start() {
    if (!file) return;
    setError('');
    setSending(0);
    try {
      const { edit, upload: to } = await api<{ edit: Edit; upload: { url: string } }>('/edits', { name: file.name, bytes: file.size, type: file.type || 'video/mp4', options: opts });
      await upload(to.url, file, setSending);
      await api(`/edits/${edit.id}/start`, {});
      setFile(null);
      if (input.current) input.current.value = '';
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));

  return (
    <div className="page">
      <PageHead title="Video editor" sub="Upload a raw phone video: it comes back cut, captioned and with sound, ready for Reels and TikTok." />
      <div className="two two--wide">
        <section className="card-panel editor-new">
          <h2>New video</h2>
          <label className={`drop ${file ? 'has-file' : ''}`}>
            <input
              ref={input}
              type="file"
              accept="video/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
            />
            <Icon name="film" size={26} />
            {file ? (
              <span>
                <strong>{file.name}</strong> · {mb(file.size)}
              </span>
            ) : (
              <span>Choose a video, or drop it here</span>
            )}
          </label>

          <div className="editor-opts">
            <label className="check">
              <input type="checkbox" checked={opts.cut} onChange={(e) => set('cut', e.target.checked)} /> Cut retakes, “um”s and long pauses
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.captions} onChange={(e) => set('captions', e.target.checked)} /> Captions
            </label>
            {opts.cut ? (
              <div className="field">
                Pace
                <div className="seg seg--toggle">
                  {(['natural', 'tight'] as const).map((p) => (
                    <button key={p} type="button" className={opts.pace === p ? 'is-on' : ''} onClick={() => set('pace', p)}>
                      {p === 'natural' ? 'Natural' : 'Tight'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="field">
              Sound effects
              <div className="seg seg--toggle">
                {(['off', 'subtle', 'lively'] as const).map((s) => (
                  <button key={s} type="button" className={opts.sfx === s ? 'is-on' : ''} onClick={() => set('sfx', s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              Music
              <select value={opts.music} onChange={(e) => set('music', e.target.value as Options['music'])}>
                <option value="none">None</option>
                <option value="calm">Calm (lo-fi, soft)</option>
                <option value="warm">Warm (acoustic)</option>
                <option value="upbeat">Upbeat (pop)</option>
              </select>
            </label>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn--honey" disabled={!file || sending !== null} onClick={start}>
            {sending !== null ? `Uploading… ${Math.round(sending * 100)}%` : 'Edit video'}
          </button>
          <p className="muted small mt">Up to 10 minutes. Talking to the camera works best: the editor keeps the last good take of each line.</p>
        </section>

        <section className="card-panel">
          <h2>{owner ? 'Everyone’s videos' : 'Your videos'}</h2>
          {list === null ? <p className="muted">Loading…</p> : null}
          {list && !list.length ? <p className="muted">Nothing edited yet.</p> : null}
          <div className="edit-list">
            {(list ?? []).map((e) => (
              <EditCard key={e.id} e={e} who={owner ? boot.staff.find((s) => s.id === e.staffId)?.short : undefined} onChange={load} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EditCard({ e, who, onChange }: { e: Edit; who?: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const file = (name: string, download = false) => `/api/staff/edits/${e.id}/file/${name}${download ? '?download=1' : ''}`;
  const r = e.result;
  const issues = r?.checks.filter((c) => !c.ok) ?? [];
  return (
    <article className="edit-card">
      <header>
        <div>
          <strong>{e.name}</strong>
          <span className="muted small">
            {dateShort(e.createdAt)}, {time(e.createdAt)}
            {who ? ` · ${who}` : ''}
          </span>
        </div>
        {e.status === 'done' ? <Pill tone="green">Ready</Pill> : e.status === 'failed' ? <Pill tone="red">Didn’t work</Pill> : e.status === 'processing' ? <Pill tone="honey">Editing</Pill> : <Pill>Uploading</Pill>}
      </header>

      {e.status === 'processing' ? (
        <div className="edit-progress">
          <span>{e.progress?.stage ?? 'Starting'}…</span>
          <i style={{ width: `${Math.round((e.progress?.pct ?? 0) * 100)}%` }} />
        </div>
      ) : null}

      {e.status === 'failed' ? (
        <>
          <p className="form-error">{e.error}</p>
          <button className="btn btn--dark" onClick={() => api(`/edits/${e.id}/start`, {}).then(onChange)}>
            Try again
          </button>
        </>
      ) : null}

      {r ? (
        <>
          <video className="edit-video" src={file('edited.mp4')} controls playsInline preload="metadata" />
          <p className="small">
            {secs(r.durationIn)} → <strong>{secs(r.durationOut)}</strong>
            {r.cuts ? ` · ${r.cuts} cut${r.cuts === 1 ? '' : 's'}` : ''}
            {r.dropped.length ? ` · ${r.dropped.length} retake${r.dropped.length === 1 ? '' : 's'} or filler${r.dropped.length === 1 ? '' : 's'} out` : ''}
            {r.sfx.length ? ` · ${r.sfx.length} sound${r.sfx.length === 1 ? '' : 's'}` : ''}
            {r.music ? ' · music' : ''}
          </p>
          {r.note ? <p className="note">{r.note}</p> : null}
          {issues.length ? (
            <ul className="edit-checks">
              {issues.map((c) => (
                <li key={c.check}>
                  <strong>{c.check}:</strong> {c.detail}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="edit-actions">
            <a className="btn btn--honey" href={file('edited.mp4', true)}>
              Download video
            </a>
            {r.files.includes('captions.srt') ? (
              <a className="btn btn--ghost" href={file('captions.srt', true)}>
                Captions (.srt)
              </a>
            ) : null}
            <button className="btn btn--ghost" onClick={() => setOpen(!open)}>
              {open ? 'Hide details' : 'Details'}
            </button>
          </div>
          {open ? (
            <div className="edit-details small">
              {r.dropped.length ? (
                <>
                  <h3>Taken out</h3>
                  <ul>
                    {r.dropped.map((d) => (
                      <li key={d.at}>
                        <span className="muted">{secs(d.at)}</span> “{d.said}” <span className="muted">({WHY[d.why] ?? d.why})</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <h3>Checks</h3>
              <ul>
                {r.checks.map((c) => (
                  <li key={c.check}>
                    {c.ok ? '✓' : '!'} {c.check}: {c.detail}
                  </li>
                ))}
              </ul>
              {r.transcript ? (
                <>
                  <h3>What’s said</h3>
                  <p>{r.transcript}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {e.status !== 'processing' ? (
        <button
          className="btn btn--ghost danger edit-delete"
          onClick={async () => {
            if (!confirm(`Delete ${e.name} and its edit?`)) return;
            await api(`/edits/${e.id}`, undefined, 'DELETE');
            onChange();
          }}
        >
          Delete
        </button>
      ) : null}
    </article>
  );
}
