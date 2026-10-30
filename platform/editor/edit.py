"""Automatic content editing: one raw phone video in, one post-ready video out.

    python3 platform/editor/edit.py <source video> <out dir> [--no-cut] [--no-captions] [--no-sfx] [--pace natural|tight]

The steps, each from an open-source project:

  1. Watch.    auto-editor (github.com/WyattBlue/auto-editor) measures the audio and marks the
               dead air; faster-whisper (github.com/SYSTRAN/faster-whisper) transcribes every word
               with its time.
  2. Cut.      The dead air goes, but never part of a word: a stretch the recogniser heard as
               speech is kept even where auto-editor called it quiet.
  3. Caption.  Two or three words at a time, in Archivo Black, the spoken word in honey, burned in
               with libass and also written out as captions.srt for the platforms that take a file.
  4. Sound.    A soft whoosh on each real jump cut and a pop under the first caption. The effects
               are synthesised here, so there are no sound files to license.
  5. Render.   One ffmpeg pass: cut, captions, effects mixed under the voice, loudness at
               -14 LUFS (what Instagram and TikTok normalise to).

Writes <out>/edited.mp4, <out>/captions.srt, <out>/report.json and, while it works,
<out>/progress.json. Exits non-zero with the reason on stderr if it can't finish.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
FONTS = HERE / 'fonts'
FONT = 'Archivo Black'
SR = 48000

# how hard to cut: a "natural" edit leaves a breath around each phrase, a "tight" one only a beat
PACES = {
    'natural': {'threshold': 0.04, 'margin': 0.25, 'gap': 0.35},
    'tight': {'threshold': 0.05, 'margin': 0.12, 'gap': 0.2},
}
MIN_KEEP = 0.2  # a kept stretch shorter than this is a click, not content
WORD_PAD = 0.06  # kept either side of every word the recogniser heard
WHOOSH_GAP = 0.6  # only a cut that removed at least this much is a jump cut worth a whoosh
WHOOSH_SPACING = 2.5  # and never two whooshes closer than this
# the AWS editor has 15 minutes to finish, and a short-form post is rarely more than three
MAX_MINUTES = float(os.environ.get('EDITOR_MAX_MINUTES', '10'))
MAX_LONG_SIDE = 1920  # 4K phone footage is rendered at 1080p: smaller, faster, and what the apps show


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Options:
    cut: bool = True
    captions: bool = True
    sfx: bool = True
    pace: str = 'natural'
    model: str = field(default_factory=lambda: os.environ.get('EDITOR_MODEL', 'base.en'))


Progress = Callable[[str, float], None]


def run(cmd: list[str], text: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=text)
    if r.returncode != 0:
        err = r.stderr if text else r.stderr.decode(errors='replace')
        raise RuntimeError(f'{Path(cmd[0]).name} failed: {err.strip()[-800:]}')
    return r


# ── 1. watch ──


def probe(src: Path) -> dict:
    """Duration, the picture's displayed size (phones store portrait video sideways), and whether it has sound."""
    out = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(src)]).stdout)
    video = next((s for s in out['streams'] if s['codec_type'] == 'video'), None)
    if not video:
        raise RuntimeError('That file has no video in it.')
    w, h = int(video['width']), int(video['height'])
    rotation = 0
    for sd in video.get('side_data_list', []):
        if 'rotation' in sd:
            rotation = int(sd['rotation'])
    rotation = int(video.get('tags', {}).get('rotate', rotation))
    if abs(rotation) % 180 == 90:
        w, h = h, w
    duration = float(out['format'].get('duration') or video.get('duration') or 0)
    if duration <= 0:
        raise RuntimeError('Couldn’t read how long that video is.')
    if duration > MAX_MINUTES * 60:
        raise RuntimeError(f'That video is {duration / 60:.0f} minutes long. The editor takes videos up to {MAX_MINUTES:g} minutes: trim it first.')
    return {'width': w, 'height': h, 'duration': duration, 'audio': any(s['codec_type'] == 'audio' for s in out['streams'])}


def loud_ranges(src: Path, pace: str, work: Path) -> list[tuple[float, float]]:
    """What auto-editor keeps: everything louder than the pace's threshold, plus its margin."""
    p = PACES[pace]
    out = work / 'timeline.json'
    exe = shutil.which('auto-editor') or 'auto-editor'
    # a 100 fps time base gives the cut points 10 ms precision whatever the video's frame rate
    run([exe, str(src), '--edit', f'audio:threshold={p["threshold"]}', '--margin', f'{p["margin"]}s', '--frame-rate', '100', '--export', 'v1', '-o', str(out), '--no-open', '--progress', 'none'])
    chunks = json.loads(out.read_text())['chunks']
    return [(a / 100, b / 100) for a, b, speed in chunks if speed == 1.0 and b > a]


def decode_audio(src: Path):
    import numpy as np

    pcm = run(['ffmpeg', '-v', 'error', '-i', str(src), '-vn', '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], text=False).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def transcribe(src: Path, model_name: str, on_progress: Progress, duration: float) -> list[Word]:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device='cpu', compute_type='int8', download_root=os.environ.get('EDITOR_MODELS') or None)
    segments, _ = model.transcribe(decode_audio(src), word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
    words: list[Word] = []
    for seg in segments:
        on_progress('Listening and writing captions', min(seg.end / duration, 1))
        for w in seg.words or []:
            text = w.word.strip()
            if text and w.end > w.start:
                words.append(Word(text, float(w.start), float(w.end)))
    return words


# ── 2. cut ──


def merge(ranges: list[tuple[float, float]], gap: float) -> list[tuple[float, float]]:
    """Sort, and join ranges that overlap or sit closer than `gap`."""
    out: list[list[float]] = []
    for a, b in sorted(ranges):
        if out and a - out[-1][1] <= gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def keep_ranges(loud: list[tuple[float, float]], words: list[Word], duration: float, pace: str) -> list[tuple[float, float]]:
    """The stretches to keep: auto-editor's loud parts and every word heard, joined across short gaps."""
    spoken = [(max(0.0, w.start - WORD_PAD), min(duration, w.end + WORD_PAD)) for w in words]
    keeps = [(max(0.0, a), min(duration, b)) for a, b in merge(loud + spoken, PACES[pace]['gap'])]
    keeps = [(a, b) for a, b in keeps if b - a >= MIN_KEEP]
    return keeps or [(0.0, duration)]


class Timeline:
    """Where a moment of the source lands in the edit."""

    def __init__(self, keeps: list[tuple[float, float]]):
        self.keeps = keeps
        self.offsets: list[float] = []
        t = 0.0
        for a, b in keeps:
            self.offsets.append(t)
            t += b - a
        self.duration = t

    def map(self, t: float) -> float | None:
        for (a, b), off in zip(self.keeps, self.offsets):
            if a <= t <= b:
                return off + t - a
        return None

    def cut_points(self) -> list[tuple[float, float]]:
        """(time in the edit, seconds removed there) for every join."""
        return [(self.offsets[i], self.keeps[i][0] - self.keeps[i - 1][1]) for i in range(1, len(self.keeps))]


def retime(words: list[Word], tl: Timeline) -> list[Word]:
    """Words on the edit's clock; a word whose middle was cut is dropped from the captions."""
    out = []
    for w in words:
        mid = tl.map((w.start + w.end) / 2)
        if mid is None:
            continue
        start = tl.map(w.start)
        end = tl.map(w.end)
        half = (w.end - w.start) / 2
        out.append(Word(w.text, start if start is not None else mid - half, end if end is not None else mid + half))
    return out


# ── 3. caption ──


def cards(words: list[Word]) -> list[list[Word]]:
    """Two or three words a card: a new card after a sentence or comma, a pause, or 16 letters."""
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for w in words:
        if cur:
            letters = sum(len(x.text) for x in cur) + len(w.text)
            if len(cur) >= 3 or letters > 16 or w.start - cur[-1].end > 0.45 or re.search(r'[.,!?;:]$', cur[-1].text):
                groups.append(cur)
                cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    return groups


def ass_time(t: float) -> str:
    cs = max(0, round(t * 100))
    return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'


def srt_time(t: float) -> str:
    ms = max(0, round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def clean(text: str) -> str:
    return text.replace('\\', '').replace('{', '').replace('}', '')


def write_ass(groups: list[list[Word]], w: int, h: int, path: Path) -> None:
    size = round(min(w, h) * 0.085)
    outline = max(2, round(size * 0.09))
    # lower third, clear of the caption and button overlays Instagram and TikTok draw at the bottom
    margin_v = round(h * (0.24 if h > w else 0.12))
    white, honey = '&H00FFFFFF', '&H001E9AE3'  # ASS colours are &HAABBGGRR: honey is #e39a1e
    lines = [
        '[Script Info]',
        'ScriptType: v4.00+',
        f'PlayResX: {w}',
        f'PlayResY: {h}',
        'WrapStyle: 0',
        'ScaledBorderAndShadow: yes',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        f'Style: Caption,{FONT},{size},{white},{white},&H00140F0B,&H64000000,0,0,0,0,100,100,1,0,1,{outline},{max(1, outline // 2)},2,{round(w * 0.08)},{round(w * 0.08)},{margin_v},1',
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ]
    for gi, g in enumerate(groups):
        card_end = g[-1].end
        if gi + 1 < len(groups) and groups[gi + 1][0].start - card_end < 0.3:
            card_end = groups[gi + 1][0].start  # no flicker between cards that follow on
        for i, word in enumerate(g):
            start = word.start if i else g[0].start
            end = g[i + 1].start if i + 1 < len(g) else card_end
            if end <= start:
                continue
            text = ' '.join((f'{{\\c{honey}}}{clean(x.text).upper()}{{\\c{white}}}' if j == i else clean(x.text).upper()) for j, x in enumerate(g))
            pop = '{\\fscx86\\fscy86\\t(0,90,\\fscx100\\fscy100)}' if i == 0 else ''
            lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{pop}{text}')
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def write_srt(groups: list[list[Word]], path: Path) -> None:
    blocks = [f'{i}\n{srt_time(g[0].start)} --> {srt_time(g[-1].end)}\n{" ".join(w.text for w in g)}\n' for i, g in enumerate(groups, 1)]
    path.write_text('\n'.join(blocks), encoding='utf-8')


# ── 4. sound ──


def whoosh(np, seconds: float = 0.42):
    """Pink-ish noise swept up through a resonant band, swelling in and dying away."""
    n = int(SR * seconds)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)
    noise = np.cumsum(rng.standard_normal(n)) * 0.02
    noise -= np.convolve(noise, np.ones(64) / 64, mode='same')  # drop the rumble
    freq = 500 + 3500 * (t / seconds) ** 1.6
    band = np.zeros(n)
    y1 = y2 = 0.0
    for i in range(n):  # a two-pole resonator whose centre sweeps with `freq`
        r = 0.985
        c = 2 * r * math.cos(2 * math.pi * freq[i] / SR)
        y = noise[i] + c * y1 - r * r * y2
        band[i] = y
        y2, y1 = y1, y
    env = np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 2
    out = band * env
    return out / (np.abs(out).max() or 1)


def pop(np, seconds: float = 0.09):
    """A quick falling blip, like a bubble."""
    t = np.arange(int(SR * seconds)) / SR
    phase = 2 * np.pi * (520 * t + 1400 * (1 - np.exp(-t * 45)) / 45)
    return np.sin(phase) * np.exp(-t * 38)


def sfx_track(cut_points: list[tuple[float, float]], first_caption: float | None, duration: float, path: Path) -> list[dict]:
    import numpy as np

    track = np.zeros(int(SR * (duration + 1)))
    events: list[dict] = []

    def place(sound, at: float, gain: float, kind: str):
        i = max(0, int(at * SR))
        seg = sound[: max(0, len(track) - i)] * gain
        track[i : i + len(seg)] += seg
        events.append({'at': round(at, 2), 'sound': kind})

    swoosh = whoosh(np)
    last = -math.inf
    for at, removed in cut_points:
        if removed >= WHOOSH_GAP and at - last >= WHOOSH_SPACING:
            # centred on the join, so it carries the eye across the cut
            place(swoosh, at - len(swoosh) / SR / 2, 0.16, 'whoosh')
            last = at
    if first_caption is not None:
        place(pop(np), first_caption, 0.22, 'pop')
    pcm = (np.clip(track, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    return sorted(events, key=lambda e: e['at'])


# ── 5. render ──


def out_size(w: int, h: int) -> tuple[int, int]:
    scale = min(1.0, MAX_LONG_SIDE / max(w, h))
    return (int(w * scale) // 2 * 2, int(h * scale) // 2 * 2)


def ff_escape(p: Path) -> str:
    return str(p).replace('\\', '/').replace(':', '\\:').replace("'", "\\'")


def render(src: Path, info: dict, keeps: list[tuple[float, float]], ass: Path | None, sfx: Path | None, out: Path, work: Path, on_progress: Progress, duration: float) -> None:
    w, h = out_size(info['width'], info['height'])
    n = len(keeps)
    parts = []
    has_audio = info['audio']
    parts.append(f'[0:v]split={n}' + ''.join(f'[v{i}]' for i in range(n)) if n > 1 else '[0:v]null[v0]')
    if has_audio:
        parts.append(f'[0:a]asplit={n}' + ''.join(f'[a{i}]' for i in range(n)) if n > 1 else '[0:a]anull[a0]')
    joined = ''
    for i, (a, b) in enumerate(keeps):
        parts.append(f'[v{i}]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[cv{i}]')
        if has_audio:
            fade = min(0.01, (b - a) / 4)
            # 10 ms fades either side of a join: a hard audio cut clicks
            parts.append(f'[a{i}]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fade:.3f},afade=t=out:st={b - a - fade:.3f}:d={fade:.3f}[ca{i}]')
        joined += f'[cv{i}]' + (f'[ca{i}]' if has_audio else '')
    parts.append(f'{joined}concat=n={n}:v=1:a={1 if has_audio else 0}' + ('[cv][ca]' if has_audio else '[cv]'))
    picture = f'[cv]scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p'
    if ass:
        picture += f",ass='{ff_escape(ass)}':fontsdir='{ff_escape(FONTS)}'"
    parts.append(picture + '[vout]')
    inputs = ['-i', str(src)]
    if has_audio and sfx:
        inputs += ['-i', str(sfx)]
        parts.append('[1:a]aresample=48000,aformat=channel_layouts=stereo[fx]')
        parts.append('[ca]aresample=48000,aformat=channel_layouts=stereo[voice]')
        parts.append('[voice][fx]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1:LRA=11[aout]')
    elif has_audio:
        parts.append('[ca]aresample=48000,loudnorm=I=-14:TP=-1:LRA=11[aout]')
    script = work / 'graph.txt'
    script.write_text(';\n'.join(parts))
    cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex_script', str(script), '-map', '[vout]']
    if has_audio:
        cmd += ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000']
    cmd += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', str(out)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert proc.stdout
    for line in proc.stdout:
        if line.startswith('out_time_us=') and line.strip() != 'out_time_us=N/A':
            on_progress('Rendering', min(int(line.split('=')[1]) / 1e6 / duration, 1))
    err = proc.stderr.read() if proc.stderr else ''
    if proc.wait() != 0:
        raise RuntimeError(f'ffmpeg failed: {err.strip()[-800:]}')


# ── all together ──


def edit(src: Path, out_dir: Path, opts: Options, on_progress: Progress | None = None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    report = on_progress or (lambda stage, pct: None)
    started = time.time()
    with tempfile.TemporaryDirectory(prefix='edit-') as tmp:
        work = Path(tmp)
        report('Watching the video', 0)
        info = probe(src)
        duration = info['duration']
        words = transcribe(src, opts.model, report, duration) if info['audio'] and (opts.captions or opts.cut) else []
        if opts.cut and info['audio']:
            report('Finding the dead air', 1)
            keeps = keep_ranges(loud_ranges(src, opts.pace, work), words, duration, opts.pace)
        else:
            keeps = [(0.0, duration)]
        tl = Timeline(keeps)
        timed = retime(words, tl)
        groups = cards(timed)
        ass = None
        if opts.captions and groups:
            ass = work / 'captions.ass'
            write_ass(groups, *out_size(info['width'], info['height']), ass)
        if groups:
            write_srt(groups, out_dir / 'captions.srt')
        sfx = work / 'sfx.wav' if opts.sfx and info['audio'] else None
        events = sfx_track(tl.cut_points(), groups[0][0].start if groups and opts.captions else None, tl.duration, sfx) if sfx else []
        render(src, info, keeps, ass, sfx, out_dir / 'edited.mp4', work, report, tl.duration)
    result = {
        'durationIn': round(duration, 2),
        'durationOut': round(tl.duration, 2),
        'cuts': len(keeps) - 1,
        'removedSeconds': round(duration - tl.duration, 2),
        'captions': len(groups) if opts.captions else 0,
        'words': len(timed),
        'transcript': ' '.join(w.text for w in timed),
        'sfx': events,
        'keeps': [[round(a, 3), round(b, 3)] for a, b in keeps],
        'size': list(out_size(info['width'], info['height'])),
        'seconds': round(time.time() - started, 1),
        'files': ['edited.mp4'] + (['captions.srt'] if groups else []),
    }
    (out_dir / 'report.json').write_text(json.dumps(result, indent=2))
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('source', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--no-cut', action='store_true')
    ap.add_argument('--no-captions', action='store_true')
    ap.add_argument('--no-sfx', action='store_true')
    ap.add_argument('--pace', choices=sorted(PACES), default='natural')
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    progress_file = a.out / 'progress.json'
    last = [0.0]

    def on_progress(stage: str, pct: float) -> None:
        now = time.time()
        if now - last[0] >= 1 or pct >= 1:
            last[0] = now
            progress_file.write_text(json.dumps({'stage': stage, 'pct': round(pct, 3)}))

    try:
        result = edit(a.source, a.out, Options(cut=not a.no_cut, captions=not a.no_captions, sfx=not a.no_sfx, pace=a.pace), on_progress)
    except Exception as e:  # the reason, for whoever started it
        print(str(e) or e.__class__.__name__, file=sys.stderr)
        sys.exit(1)
    print(json.dumps({k: v for k, v in result.items() if k not in ('keeps', 'transcript')}))


if __name__ == '__main__':
    main()
