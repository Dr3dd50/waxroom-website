"""Which words to keep: the last good take of each line, without a script.

Adapted from ghost-editor's takes.py and references/take-selection.md (MIT; the take rules come
from mariagorskikh/talking-head-reel, MIT). People record by saying a line, disliking it and
saying it again, so the fluent version is usually the later one. ghost-editor matches every
attempt against the script the speaker meant to read and lets Claude pick. Staff here don't
upload a script, so the transcript is matched against itself: a phrase whose words come again,
from the top, a few phrases later was a try at that later phrase and goes. Restart chatter
("okay, again") and bare fillers ("um") go too. The alignment is ghost-editor's Smith-Waterman
with its inflection-tolerant word match.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass

import numpy as np

RESTART = re.compile(r"(okay,? again|let me (do|say|try) (that|this|it) again|one more time|take two|from the top|let's try (that )?again|wait,? no|start over)", re.I)
FILLER = re.compile(r'^(u+m+|u+h+|e+r+m*|h+m+|mm+|ah+)$', re.I)
PHRASE_GAP = 0.3  # ghost-editor's tested VAD pause: a quicker restart shares a phrase with the line before
LOOKAHEAD = 4  # a retake follows within this many phrases...
LOOKAHEAD_S = 30.0  # ...and this many seconds


@dataclass
class Word:
    text: str
    start: float
    end: float
    p: float = 1.0


def norm(t: str) -> str:
    return re.sub(r'[^0-9a-z\-]+', '', t.lower()).strip('-')


def wsim(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if len(a) >= 4 and len(b) >= 4 and a[:4] == b[:4]:
        return 0.8
    r = difflib.SequenceMatcher(None, a, b).ratio()
    return r if r >= 0.72 else 0.0


def align(u: list[str], w: list[str]) -> tuple[float, list[tuple[int | None, int | None, bool]]]:
    """ghost-editor's local alignment of u (a phrase) inside w: (score, [(u index, w index, matched)])."""
    n, m = len(u), len(w)
    H = np.zeros((n + 1, m + 1))
    T = np.zeros((n + 1, m + 1), np.int8)
    S = np.array([[wsim(u[i], w[j]) for j in range(m)] for i in range(n)]) if n and m else np.zeros((n, m))
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = S[i - 1, j - 1]
            d = H[i - 1, j - 1] + (2.0 * s if s > 0 else -1.0)
            up = H[i - 1, j] - 0.8  # a word missing from the later take
            lf = H[i, j - 1] - 0.6  # an extra word in the later take
            best = max(0.0, d, up, lf)
            H[i, j] = best
            T[i, j] = 0 if best == 0 else (1 if best == d else (2 if best == up else 3))
    i, j = np.unravel_index(np.argmax(H), H.shape)
    score = H[i, j]
    path = []
    while i > 0 and j > 0 and T[i, j] != 0:
        t = T[i, j]
        if t == 1:
            path.append((i - 1, j - 1, S[i - 1, j - 1] > 0))
            i, j = i - 1, j - 1
        elif t == 2:
            path.append((i - 1, None, False))
            i -= 1
        else:
            path.append((None, j - 1, False))
            j -= 1
    return float(score), path[::-1]


def phrases(words: list[Word]) -> list[list[int]]:
    """Word indexes grouped into phrases: a new one after a pause or a full stop."""
    out: list[list[int]] = []
    for i, w in enumerate(words):
        if out and (w.start - words[out[-1][-1]].end > PHRASE_GAP or re.search(r'[.!?]$', words[out[-1][-1]].text)):
            out.append([i])
        elif out:
            out[-1].append(i)
        else:
            out.append([i])
    return out


def superseded(ph: list[int], later: list[int], words: list[Word]) -> bool:
    """True when `later` says `ph` again from the top: most of its words, in order, from the start."""
    u = [norm(words[i].text) for i in ph if norm(words[i].text)]
    w = [norm(words[i].text) for i in later if norm(words[i].text)]
    if len(u) < 2 or not w:
        return False
    # Cutting a line that was meant (a list, a callback, "ask not... ask what") loses content, while
    # missing a retake only leaves it in, so the bar is high: the try's opening words come back
    # word for word near the start of the later phrase, and most of the rest of it follows.
    head = u[:3]
    if not any(all(wsim(a, b) >= 0.8 for a, b in zip(head, w[s : s + len(head)])) and len(w) - s >= len(head) for s in range(min(3, len(w)))):
        return False
    if len(u) <= 3:
        return True
    _, path = align(u, w)
    return sum(1 for _, _, ok in path if ok) >= 0.75 * len(u)


def choose(words: list[Word]) -> tuple[list[bool], list[dict]]:
    """Which words stay, and a note for each phrase that went (for the report)."""
    keep = [True] * len(words)
    notes: list[dict] = []
    ph = phrases(words)
    text = lambda p: ' '.join(words[i].text for i in p)  # noqa: E731
    for k, p in enumerate(ph):
        if RESTART.search(text(p)):
            why = 'restart'
        elif all(FILLER.match(norm(words[i].text) or 'um') for i in p):
            why = 'filler'
        else:
            why = ''
            for later in ph[k + 1 : k + 1 + LOOKAHEAD]:
                if words[later[0]].start - words[p[-1]].end > LOOKAHEAD_S:
                    break
                if superseded(p, later, words):
                    why = 'retake'
                    break
        if why:
            for i in p:
                keep[i] = False
            notes.append({'at': round(words[p[0]].start, 2), 'said': text(p), 'why': why})
    # a filler inside a kept phrase goes when there's air either side of it to cut in
    for i, w in enumerate(words):
        if keep[i] and FILLER.match(norm(w.text) or 'x'):
            before = words[i - 1].end if i else 0
            after = words[i + 1].start if i + 1 < len(words) else w.end + 1
            if w.start - before >= 0.08 and after - w.end >= 0.08:
                keep[i] = False
                notes.append({'at': round(w.start, 2), 'said': w.text, 'why': 'filler'})
    return keep, sorted(notes, key=lambda n: n['at'])
