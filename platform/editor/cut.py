"""The cut and the voice: kept words → frame-exact pieces → one smooth voice track.

Adapted from ghost-editor's plan_cut.py and voice_smooth.py (MIT):
- piece edges come from the voice itself, the 10 ms energy envelope (threshold: the
  8th-percentile floor + 14 dB) near each word's start and end, with ghost-editor's lead
  0.10 s and tail 0.18 s, never reaching into a neighbouring word;
- a pause inside a take longer than the pace allows shrinks to tail + lead;
- edges sit on the 30 fps grid, so the picture and the voice cut on the same frame;
- every join in the voice is an equal-power crossfade (35 ms) centred on the cut, and each
  take's speech level is matched to the median, within ±3 dB.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from takes import Word

FPS = 30
SR = 48000
LEAD, TAIL = 0.10, 0.18
# how long a pause inside a take may stay, and what it shrinks to (tail + lead)
PACES = {
    'natural': {'trim': 0.6, 'tail': 0.18, 'lead': 0.12},
    'tight': {'trim': 0.26, 'tail': 0.11, 'lead': 0.07},  # ghost-editor's defaults
}
XFADE = 0.035
LEVEL_CLAMP_DB = 3.0


@dataclass
class Piece:
    a: float  # source seconds, on the frame grid
    b: float
    take: int  # pieces of one take share a level (and a framing)


def grid(t: float) -> float:
    return round(t * FPS) / FPS


def envelope(voice: np.ndarray) -> tuple[np.ndarray, float]:
    """10 ms RMS in dB, and the speech threshold over it."""
    hop = SR // 100
    n = len(voice) // hop
    frames = voice[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt((frames**2).mean(1)) + 1e-9)
    return db, float(np.percentile(db, 8)) + 14


def onset(env: np.ndarray, thr: float, t: float, lo: float) -> float:
    """Where the sound of a word starting near t really starts: back to the first quiet frame, not before lo."""
    i = int(t * 100)
    stop = max(int(lo * 100), i - 25)
    while i > stop and i - 1 < len(env) and env[i - 1] > thr:
        i -= 1
    return max(lo, i / 100)


def offset(env: np.ndarray, thr: float, t: float, hi: float) -> float:
    i = int(t * 100)
    stop = min(int(hi * 100), i + 30, len(env))
    while i < stop and env[i] > thr:
        i += 1
    return min(hi, i / 100)


def plan(words: list[Word], keep: list[bool], voice: np.ndarray, duration: float, pace: str) -> list[Piece]:
    """Pieces of the source to play, in order. No words at all: the whole video."""
    kept = [i for i, k in enumerate(keep) if k]
    if not kept:
        return [Piece(0.0, grid(duration), 0)]
    p = PACES[pace]
    env, thr = envelope(voice)
    pieces: list[Piece] = []
    take = 0
    run = [kept[0]]

    def close(run: list[int], take: int, lead: float, tail: float, prev_end: float) -> None:
        first, last = words[run[0]], words[run[-1]]
        # never into a word on either side, kept or not
        lo = max(prev_end, words[run[0] - 1].end + 0.02 if run[0] else 0.0)
        hi = words[run[-1] + 1].start - 0.02 if run[-1] + 1 < len(words) else duration
        a = max(lo, onset(env, thr, first.start, lo) - lead)
        b = min(hi, offset(env, thr, last.end, hi) + tail)
        a, b = grid(a), grid(b)
        if b - a >= 2 / FPS:
            pieces.append(Piece(a, b, take))

    prev_end = 0.0
    lead = LEAD
    for i in kept[1:]:
        gap = words[i].start - words[run[-1]].end
        if i == run[-1] + 1 and gap <= p['trim']:
            run.append(i)
            continue
        same_take = i == run[-1] + 1  # only a long pause between them: one take, trimmed
        close(run, take, lead, p['tail'] if same_take else TAIL, prev_end)
        prev_end = pieces[-1].b if pieces else prev_end
        lead = p['lead'] if same_take else LEAD
        take += 0 if same_take else 1
        run = [i]
    close(run, take, lead, TAIL, prev_end)
    # pieces that touch (a trimmed pause shorter than its handles) are one piece
    merged: list[Piece] = []
    for q in pieces:
        if merged and q.a <= merged[-1].b + 1e-6 and q.take == merged[-1].take:
            merged[-1].b = max(merged[-1].b, q.b)
        else:
            merged.append(q)
    return merged or [Piece(0.0, grid(duration), 0)]


def speech_db(voice: np.ndarray, a: float, b: float) -> float | None:
    x = voice[int(a * SR) : int(b * SR)]
    if len(x) < SR // 10:
        return None
    hop = SR // 20
    w = x[: len(x) // hop * hop].reshape(-1, hop)
    rms = np.sqrt((w**2).mean(1))
    loud = rms[rms > np.percentile(rms, 50)]  # the speech, not the pauses
    return float(20 * np.log10(loud.mean() + 1e-9)) if len(loud) else None


def build_voice(voice: np.ndarray, pieces: list[Piece]) -> np.ndarray:
    """The edited voice: same length as the pieces end to end, crossfaded at every join."""
    takes = sorted({q.take for q in pieces})
    levels = {}
    for t in takes:
        vals = [v for q in pieces if q.take == t for v in [speech_db(voice, q.a, q.b)] if v is not None]
        if vals:
            levels[t] = float(np.mean(vals))
    median = float(np.median(list(levels.values()))) if levels else 0.0
    gain = {t: 10 ** (np.clip(median - levels[t], -LEVEL_CLAMP_DB, LEVEL_CLAMP_DB) / 20) if t in levels else 1.0 for t in takes}
    h = XFADE / 2
    nh = int(h * SR)
    total = sum(round((q.b - q.a) * SR) for q in pieces)
    out = np.zeros(total + 2 * nh)
    fade_in = np.sin(np.linspace(0, np.pi / 2, 2 * nh)) if nh else np.zeros(0)
    fade_out = np.cos(np.linspace(0, np.pi / 2, 2 * nh)) if nh else np.zeros(0)
    pos = 0
    for k, q in enumerate(pieces):
        n = round((q.b - q.a) * SR)
        # real audio either side of the cut (handles), so the crossfade blends sound, not silence
        a0 = int(q.a * SR) - nh
        seg = np.zeros(n + 2 * nh)
        lo, hi = max(0, a0), min(len(voice), a0 + n + 2 * nh)
        if hi > lo:
            seg[lo - a0 : hi - a0] = voice[lo:hi]
        seg *= gain[q.take]
        if nh:
            if k:
                seg[: 2 * nh] *= fade_in
            else:
                seg[:nh] = 0  # nothing before the first piece
            if k + 1 < len(pieces):
                seg[-2 * nh :] *= fade_out
            else:
                seg[-nh:] = 0
        out[pos : pos + len(seg)] += seg
        pos += n
    return out[nh : nh + total]
