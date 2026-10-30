"""Automatic content editing: one raw phone video in, one post-ready vertical video out.

    python3 platform/editor/edit.py <source video> <out dir> [--no-cut] [--no-captions]
        [--sfx off|subtle|lively] [--music none|calm|warm|upbeat] [--pace natural|tight]

A server version of ghost-editor (github.com/kurbaitaev/ghost-editor, MIT; see THIRD_PARTY.md).
ghost-editor is a Claude Code skill: Claude reads the transcript, picks takes, writes a plan and
renders it in headless Chrome on a Mac. Here every choice it hands to Claude is made by a rule,
and the render is one ffmpeg pass, so an edit runs unattended in a Lambda in a few minutes.
Its pipeline, step for step:

  1. Prep        1080x1920 at 30 fps, landscape centre-cropped, HDR tone-mapped, the voice
                 levelled to -16 LUFS before anything is mixed with it          (prep.sh)
  2. Transcribe  faster-whisper, every word timed, with ghost-editor's anti-merge decoding so
                 a retake isn't smoothed into one clean sentence                (transcribe.py)
  3. Takes       the last good take of each line; restarts and "um"s go        (takes.py)
  4. Cut         edges from the voice's own envelope, long pauses shrunk, smooth joins
                 and matched levels                                   (plan_cut.py, voice_smooth.py)
  5. Face        YuNet face tracking: captions off the face, punch-ins on it   (face_track.py)
  6. Edit        a 1.0 / 1.1 punch-in at every cut, clean-style captions       (build.mjs, clean.json)
  7. Sound       real recorded effects levelled against this voice; optional music bed
  8. Check       loudness, true peak, pauses left, captions on the face        (qa.py)

Writes <out>/edited.mp4, <out>/captions.srt, <out>/report.json and, while it works,
<out>/progress.json. Exits non-zero with the reason on stderr if it can't finish.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

import captions
import cut
import face
import sound
from takes import Word, choose

HERE = Path(__file__).resolve().parent
FONTS = HERE / 'fonts'
W, H, FPS = 1080, 1920, cut.FPS
SNAP = 1.1  # ghost-editor's clean-style punch-in
# the AWS editor has 15 minutes to finish, and a short-form post is rarely more than three
MAX_MINUTES = float(os.environ.get('EDITOR_MAX_MINUTES', '10'))

Progress = Callable[[str, float], None]


@dataclass
class Options:
    cut: bool = True
    captions: bool = True
    sfx: str = 'subtle'  # off | subtle | lively
    music: str = 'none'  # none | calm | warm | upbeat
    pace: str = 'natural'  # natural | tight
    model: str = os.environ.get('EDITOR_MODEL', 'base.en')


def run(cmd: list[str], text: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=text)
    if r.returncode != 0:
        err = r.stderr if text else r.stderr.decode(errors='replace')
        raise RuntimeError(f'{Path(cmd[0]).name} failed: {err.strip()[-800:]}')
    return r


# ── 1. prep ──


def probe(src: Path) -> dict:
    out = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(src)]).stdout)
    video = next((s for s in out['streams'] if s['codec_type'] == 'video'), None)
    if not video:
        raise RuntimeError('That file has no video in it.')
    w, h = int(video['width']), int(video['height'])
    rotation = 0
    for sd in video.get('side_data_list', []):
        rotation = int(sd.get('rotation', rotation))
    if abs(int(video.get('tags', {}).get('rotate', rotation))) % 180 == 90:
        w, h = h, w
    duration = float(out['format'].get('duration') or video.get('duration') or 0)
    if duration <= 0:
        raise RuntimeError('Couldn’t read how long that video is.')
    if duration > MAX_MINUTES * 60:
        raise RuntimeError(f'That video is {duration / 60:.0f} minutes long. The editor takes videos up to {MAX_MINUTES:g} minutes: trim it first.')
    return {'width': w, 'height': h, 'duration': duration, 'audio': any(s['codec_type'] == 'audio' for s in out['streams']), 'hdr': video.get('color_transfer') in ('arib-std-b67', 'smpte2084')}


def prep_video(src: Path, info: dict, dst: Path) -> None:
    """The picture every later step reads: 1080x1920, 30 fps, SDR, a keyframe every second."""
    vf = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}' if info['width'] < info['height'] else f'crop=ih*9/16:ih,scale={W}:{H},fps={FPS}'
    if info['hdr']:  # iPhone HLG/PQ: one HDR plate would make the whole edit HDR
        vf = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,' + vf
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', str(dst)])


def prep_voice(src: Path) -> np.ndarray:
    """The voice at -16 LUFS (two-pass loudnorm), 48 kHz mono."""
    stats = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(src), '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr
    m = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', stats).group(0))
    af = f'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}:linear=true'
    raw = run(['ffmpeg', '-v', 'error', '-i', str(src), '-vn', '-af', af, '-ac', '1', '-ar', str(cut.SR), '-f', 'f32le', '-'], text=False).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


# ── 2. transcribe ──


UNREAD = '[speech]'  # speech the recogniser heard as speech but couldn't put words to


def transcribe(voice: np.ndarray, model_name: str, on_progress: Progress, duration: float) -> list[Word]:
    """Every word, timed. One pass over the whole file gives the words their context. Over a whole
    file Whisper skips short false starts, though, so (like ghost-editor's islands_tx.py) every
    stretch of speech that pass left without words is transcribed again on its own: Silero VAD
    islands at 0.3 s pauses, and loud stretches the VAD missed. A stretch that still comes back
    empty is kept as one UNREAD stretch, so speech is never cut for being hard to recognise."""
    from faster_whisper import WhisperModel
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    model = WhisperModel(model_name, device='cpu', compute_type='int8', download_root=os.environ.get('EDITOR_MODELS') or None)
    # 48 kHz → 16 kHz: a windowed-sinc low-pass at 7.5 kHz, then every third sample
    taps = np.arange(-48, 49)
    lp = np.sinc(taps * 7500 * 2 / cut.SR) * np.hamming(len(taps))
    audio16 = np.convolve(voice, lp / lp.sum(), mode='same')[:: cut.SR // 16000].astype(np.float32)
    decode = dict(
        language='en',
        word_timestamps=True,
        # ghost-editor's anti-merge decoding: don't condition on earlier text, or a retake is merged into one clean sentence
        condition_on_previous_text=False,
        temperature=[0.0, 0.2, 0.4],
        no_speech_threshold=0.6,
        compression_ratio_threshold=2.2,
        hallucination_silence_threshold=1.0,
    )

    def words_of(segments, at: float = 0.0) -> list[Word]:
        return [Word(w.word.strip(), at + float(w.start), at + float(w.end), float(w.probability)) for seg in segments for w in seg.words or [] if w.word.strip() and w.end > w.start]

    segments, _ = model.transcribe(audio16, vad_filter=True, vad_parameters={'min_silence_duration_ms': 300}, **decode)
    words: list[Word] = []
    for seg in segments:
        on_progress('Listening to the video', min(seg.end / duration, 1))
        words += words_of([seg])
    islands = get_speech_timestamps(audio16, VadOptions(min_silence_duration_ms=300, speech_pad_ms=100, min_speech_duration_ms=150))
    # the VAD can miss a word, so stretches that are simply loud are checked too
    spans = [(i['start'] / 16000 + 0.1, i['end'] / 16000 - 0.1) for i in islands] + cut.loud_spans(voice)  # the VAD pads each island 0.1 s
    extra: list[Word] = []
    for a, b in spans:
        inside = sorted((w for w in words + extra if w.end > a and w.start < b), key=lambda w: w.start)
        edges = [a] + [t for w in inside for t in (w.start, w.end)] + [b]
        # the stretches of this island no word covers: a missed word, or a whole missed line
        for g0, g1 in zip(edges[::2], edges[1::2]):
            if g1 - g0 < 0.3:
                continue
            i0, i1 = int((g0 - 0.05) * 16000), int((g1 + 0.05) * 16000)
            heard = words_of(model.transcribe(audio16[max(0, i0) : i1], vad_filter=False, **decode)[0], max(0, i0) / 16000)
            extra += heard or [Word(UNREAD, g0, g1, 0.0)]
    return sorted(words + extra, key=lambda w: w.start)


# ── 4. the edit's clock ──


class Timeline:
    def __init__(self, pieces: list[cut.Piece]):
        self.pieces = pieces
        self.offsets = []
        t = 0.0
        for q in pieces:
            self.offsets.append(t)
            t += q.b - q.a
        self.duration = t

    def where(self, t: float) -> tuple[int, float] | None:
        """(piece index, edit seconds) for a source time, or None if it was cut."""
        for k, (q, off) in enumerate(zip(self.pieces, self.offsets)):
            if q.a <= t <= q.b:
                return k, off + t - q.a
        return None

    def cuts(self) -> list[float]:
        return self.offsets[1:]


def retime(words: list[Word], keep: list[bool], tl: Timeline) -> list[tuple[Word, Word, int]]:
    """(source word, edit-clock word, piece) for every kept word still in the edit."""
    out = []
    for w, k in zip(words, keep):
        mid = tl.where((w.start + w.end) / 2)
        if not k or mid is None:
            continue
        s, e = tl.where(w.start), tl.where(w.end)
        half = (w.end - w.start) / 2
        out.append((w, Word(w.text, s[1] if s else mid[1] - half, e[1] if e else mid[1] + half, w.p), mid[0]))
    return out


# ── 6. render ──


def write_wav(x: np.ndarray, path: Path) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(cut.SR)
        f.writeframes(pcm.tobytes())


def ff_escape(p: Path) -> str:
    return str(p).replace('\\', '/').replace(':', '\\:').replace("'", "\\'")


def render(video: Path, audio: Path, pieces: list[cut.Piece], zooms: list[float], org: tuple[float, float], ass: Path | None, out: Path, work: Path, on_progress: Progress, duration: float) -> None:
    n = len(pieces)
    ox, oy = org
    parts = [f'[0:v]split={n}' + ''.join(f'[v{i}]' for i in range(n)) if n > 1 else '[0:v]null[v0]']
    for i, (q, z) in enumerate(zip(pieces, zooms)):
        chain = f'[v{i}]trim={q.a:.4f}:{q.b:.4f},setpts=PTS-STARTPTS'
        if z != 1:
            # scale around the face: the crop keeps the origin where it was on screen
            cw, ch = W / z, H / z
            x = min(max(0.0, ox - ox / z), W - cw)
            y = min(max(0.0, oy - oy / z), H - ch)
            chain += f',crop={cw:.1f}:{ch:.1f}:{x:.1f}:{y:.1f},scale={W}:{H}:flags=lanczos'
        parts.append(chain + f',setsar=1[c{i}]')
    parts.append(''.join(f'[c{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0,format=yuv420p[cv]')
    parts.append(f"[cv]ass='{ff_escape(ass)}':fontsdir='{ff_escape(FONTS)}'[vout]" if ass else '[cv]null[vout]')
    parts.append('[1:a]alimiter=limit=0.89:level=false,aformat=channel_layouts=stereo[aout]')
    graph = work / 'graph.txt'
    graph.write_text(';\n'.join(parts))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-i', str(audio), '-filter_complex_script', str(graph), '-map', '[vout]', '-map', '[aout]',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
           '-movflags', '+faststart', '-shortest', '-progress', 'pipe:1', '-nostats', str(out)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert proc.stdout
    for line in proc.stdout:
        if line.startswith('out_time_us=') and 'N/A' not in line:
            on_progress('Rendering', min(int(line.split('=')[1]) / 1e6 / duration, 1))
    err = proc.stderr.read() if proc.stderr else ''
    if proc.wait() != 0:
        raise RuntimeError(f'ffmpeg failed: {err.strip()[-800:]}')


# ── 8. check ──


def checks(out: Path, edit_words: list[Word], backed: int, cards: int, events: list[dict], duration: float) -> list[dict]:
    """ghost-editor's qa.py, the parts that apply: what a viewer would hear or see go wrong."""
    r = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(out), '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])
    tp = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)[-1])
    gaps = [b.start - a.end for a, b in zip(edit_words, edit_words[1:])]
    longest = max(gaps, default=0.0)
    per_min = len(events) / max(duration / 60, 1e-6)
    cap = max(2, int(sound.PER_MINUTE * duration / 60))
    return [
        {'check': 'Loudness', 'ok': -18 <= i <= -12, 'detail': f'{i:.1f} LUFS (the voice is set to -16; apps play around -14)'},
        {'check': 'Peaks', 'ok': tp <= -0.5, 'detail': f'{tp:.1f} dBTP'},
        {'check': 'Pauses', 'ok': longest <= 1.2, 'detail': f'longest pause left {longest:.1f} s'},
        {'check': 'Captions off the face', 'ok': backed == 0, 'detail': f'{backed} of {cards} captions sit over the chin on a dark box' if backed else 'every caption clears the face'},
        {'check': 'Sound density', 'ok': len(events) <= cap, 'detail': f'{len(events)} effects, {per_min:.0f} a minute'},
    ]


# ── all together ──


def edit(src: Path, out_dir: Path, opts: Options, on_progress: Progress | None = None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    report = on_progress or (lambda stage, pct: None)
    started = time.time()
    with tempfile.TemporaryDirectory(prefix='edit-') as tmp:
        work = Path(tmp)
        report('Preparing the video', 0)
        info = probe(src)
        duration = info['duration']
        talk = work / 'talk.mp4'
        prep_video(src, info, talk)
        voice = prep_voice(src) if info['audio'] else np.zeros(int(duration * cut.SR))
        words = transcribe(voice, opts.model, report, duration) if info['audio'] else []
        report('Choosing the best takes', 1)
        keep, dropped = choose(words) if opts.cut else ([True] * len(words), [])
        pieces = cut.plan(words, keep, voice, duration, opts.pace) if opts.cut else [cut.Piece(0.0, cut.grid(duration), 0)]
        tl = Timeline(pieces)
        timed = retime(words, keep, tl)
        timed = [x for x in timed if x[0].text != UNREAD]  # kept in the cut, but nothing to caption
        edit_words = [e for _, e, _ in timed]
        # a punch-in at every cut, alternating, so a jump cut reads as a second camera
        zooms = [1.0 if k % 2 == 0 else SNAP for k in range(len(pieces))]

        report('Finding the face', 0)
        samples = face.track(talk)
        org = face.origin(samples)
        groups = captions.cards(edit_words)
        ass = None
        backed = 0
        if groups:
            src_of = {(e.start, e.end): (s, k) for s, e, k in timed}
            placer = face.Placer(samples, *org, block_h=captions.SIZE * 1.3)
            places = []
            for g in groups:
                (s0, k0), (s1, _) = src_of[(g[0].start, g[0].end)], src_of[(g[-1].start, g[-1].end)]
                places.append(placer.place(s0.start, s1.end, zooms[k0]))
            backed = sum(1 for _, b in places if b)
            if opts.captions:
                ass = work / 'captions.ass'
                captions.write_ass(groups, places, ass)
            captions.write_srt(groups, out_dir / 'captions.srt')

        report('Adding sound', 1)
        edited_voice = cut.build_voice(voice, pieces) if info['audio'] else np.zeros(int(tl.duration * cut.SR))
        profile = opts.sfx if sound.kit_ready() else 'off'
        events = sound.plan(edit_words, tl.cuts(), tl.duration, profile)
        music = opts.music if opts.music != 'none' and sound.kit_ready() else None
        mixed, placed, bed = sound.mix(edited_voice, edit_words, events, music)
        write_wav(mixed, work / 'mix.wav')

        render(talk, work / 'mix.wav', pieces, zooms, org, ass, out_dir / 'edited.mp4', work, report, tl.duration)
        report('Checking the result', 1)
        qa = checks(out_dir / 'edited.mp4', edit_words, backed if opts.captions else 0, len(groups), placed, tl.duration)
    result = {
        'durationIn': round(duration, 2),
        'durationOut': round(tl.duration, 2),
        'cuts': len(pieces) - 1,
        'removedSeconds': round(duration - tl.duration, 2),
        'captions': len(groups) if opts.captions else 0,
        'words': len(edit_words),
        'transcript': ' '.join(w.text for w in captions.sentence_case(edit_words)),
        'dropped': dropped,
        'sfx': placed,
        'music': bed,
        'checks': qa,
        'size': [W, H],
        'seconds': round(time.time() - started, 1),
        'files': ['edited.mp4'] + (['captions.srt'] if groups else []),
        **({'note': 'Sound effects are off: the sound kit isn’t installed (run platform/editor/setup.sh).'} if opts.sfx != 'off' and profile == 'off' else {}),
    }
    (out_dir / 'report.json').write_text(json.dumps(result, indent=2))
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('source', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--no-cut', action='store_true')
    ap.add_argument('--no-captions', action='store_true')
    ap.add_argument('--sfx', choices=['off', 'subtle', 'lively'], default='subtle')
    ap.add_argument('--music', choices=['none', 'calm', 'warm', 'upbeat'], default='none')
    ap.add_argument('--pace', choices=sorted(cut.PACES), default='natural')
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    progress_file = a.out / 'progress.json'
    last = [0.0]

    def on_progress(stage: str, pct: float) -> None:
        if time.time() - last[0] >= 1 or pct >= 1:
            last[0] = time.time()
            progress_file.write_text(json.dumps({'stage': stage, 'pct': round(pct, 3)}))

    try:
        result = edit(a.source, a.out, Options(cut=not a.no_cut, captions=not a.no_captions, sfx=a.sfx, music=a.music, pace=a.pace), on_progress)
    except Exception as e:  # the reason, for whoever started it
        print(str(e) or e.__class__.__name__, file=sys.stderr)
        sys.exit(1)
    print(json.dumps({k: v for k, v in result.items() if k not in ('transcript', 'dropped')}))


if __name__ == '__main__':
    main()
