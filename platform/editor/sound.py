"""Sound effects and an optional music bed, set against this speaker's voice.

Adapted from ghost-editor's build.mjs and references/sound-and-memes.md (MIT). Its lessons:
synthesised blips sound cheap, so the kit is real recordings (library/kit.json, peak-normalised
to -1 dBFS by fetch_kit.py); every hit is levelled by role against the p95 of 50 ms voice peaks
(ui -14 dB, whoosh -12, impact -8); variants rotate so repeats don't machine-gun; cuts stay dry
unless the edit is meant to be lively; 6 to 12 subtle sounds a minute at most. Music sits 20 dB
under the voice.

What gets a sound, since no one is choosing beats by hand:
  subtle   a whoosh into the first caption, and a pop under a number or price ("$45", "20 minutes")
  lively   that, plus a quiet whoosh on punch-ins at cuts
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import numpy as np

from cut import SR
from takes import Word

LIB = Path(__file__).resolve().parent / 'library'
ROLE_DB = {'ui': -14, 'whoosh': -12, 'impact': -8, 'meme': -3, 'foley': -14}
VARIANTS = {'pop': ['pop-1', 'pop-2', 'pop-3'], 'whoosh': ['whoosh-1', 'whoosh-2', 'whoosh-3']}
PER_MINUTE = 12
SPACING = 1.2  # never two sounds closer than this
MUSIC_DB = -20  # under the voice
VOICE_LUFS = -16
NUMBER = re.compile(r'[$%]|\d')


def load(path: Path) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def voice_p95(voice: np.ndarray, words: list[Word]) -> float:
    """The p95 of 50 ms peak windows over the spoken words, in dBFS."""
    win = SR // 20
    peaks = []
    for w in words:
        for i in range(int(w.start * SR), int(w.end * SR) - win, win):
            peaks.append(np.abs(voice[i : i + win]).max())
    if not peaks:
        return -12.0
    return float(20 * np.log10(max(np.percentile(peaks, 95), 1e-6)))


def kit_ready() -> bool:
    kit = json.loads((LIB / 'kit.json').read_text())
    return all((LIB / 'sfx' / f'{k}.wav').exists() for k in kit['sfx'])


def plan(words: list[Word], cuts: list[float], duration: float, profile: str) -> list[dict]:
    """[{at, id, why}] on the edit's clock."""
    if profile == 'off' or not words:
        return []
    want: list[tuple[float, str, str, float]] = []  # (at, kind, why, lead)
    want.append((words[0].start, 'whoosh-cine', 'opening', 0.25))
    for w in words:
        if NUMBER.search(w.text):
            want.append((w.start, 'pop', f'number "{w.text}"', 0.0))
    if profile == 'lively':
        want += [(t, 'whoosh', 'punch-in', 0.05) for t in cuts]
    events: list[dict] = []
    rr: dict[str, int] = {}
    cap = max(2, int(PER_MINUTE * duration / 60))
    for at, kind, why, lead in sorted(want):
        t = max(0.0, at - lead)
        if events and t - events[-1]['at'] < SPACING:
            continue
        if len(events) >= cap:
            break
        sid = kind
        if kind in VARIANTS:
            rr[kind] = (rr.get(kind, -1) + 1) % len(VARIANTS[kind])
            sid = VARIANTS[kind][rr[kind]]
        events.append({'at': round(t, 2), 'id': sid, 'why': why, 'extra_db': -6 if why == 'punch-in' else 0})
    return events


def lufs(x: np.ndarray) -> float:
    """Integrated loudness, measured by ffmpeg."""
    p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af', 'ebur128', '-f', 'null', '-'], input=x.astype('<f8').tobytes(), capture_output=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', p.stderr.decode())
    return float(m[-1]) if m else -70.0


def mix(voice: np.ndarray, words: list[Word], events: list[dict], music: str | None) -> tuple[np.ndarray, list[dict], dict | None]:
    """The final audio: the voice, every effect at its role's level, the music bed under it."""
    kit = json.loads((LIB / 'kit.json').read_text())
    p95 = voice_p95(voice, words)
    out = voice.copy()
    placed = []
    for e in events:
        meta = kit['sfx'][e['id']]
        db = p95 + ROLE_DB[meta['role']] + e['extra_db'] + 1  # files peak at -1 dBFS
        clip = load(LIB / 'sfx' / f'{e["id"]}.wav') * min(1.0, 10 ** (db / 20))
        i = int(e['at'] * SR)
        seg = clip[: max(0, len(out) - i)]
        out[i : i + len(seg)] += seg
        placed.append({**{k: e[k] for k in ('at', 'id', 'why')}, 'sound': meta['title'], 'db_vs_voice': ROLE_DB[meta['role']] + e['extra_db']})
    bed = None
    if music:
        options = [k for k, m in kit['music'].items() if m['mood'] == music] or list(kit['music'])
        mid = options[int(len(words)) % len(options)]  # varies between videos, same for a re-run
        track = load(LIB / 'music' / f'{mid}.mp3')
        if len(track):
            reps = int(np.ceil(len(out) / len(track)))
            track = np.tile(track, reps)[: len(out)]
            gain = 10 ** ((VOICE_LUFS + MUSIC_DB - lufs(track[: SR * 60])) / 20)
            fade_in, fade_out = int(0.5 * SR), int(min(1.5, len(out) / SR / 4) * SR)
            env = np.ones(len(out))
            env[:fade_in] = np.linspace(0, 1, fade_in)
            if fade_out:
                env[-fade_out:] = np.linspace(1, 0, fade_out)
            out += track * gain * env
            bed = {'id': mid, 'db_vs_voice': MUSIC_DB}
    return out, placed, bed
