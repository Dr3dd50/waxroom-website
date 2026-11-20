"""Word-by-word captions in ghost-editor's "clean" style, in the studio's type and colour.

ghost-editor's clean preset (styles/clean.json, MIT): bold mixed-case captions three words at a
time, the spoken word in one accent colour, placed off the face (face.py). Here the type is
Archivo Black and the accent is the studio's honey; they're burned in with libass and also
written as an .srt for platforms that take a caption file.
"""

from __future__ import annotations

import re
from pathlib import Path

from takes import Word

FONT = 'Archivo Black'
SIZE = 64  # px at 1080 wide (clean.json capSize)
GROUP = 3
WHITE, HONEY, INK = '&H00FFFFFF', '&H001E9AE3', '&H000B1117'  # ASS is &HAABBGGRR: honey #e39a1e, ink #17110b


def sentence_case(words: list[Word]) -> list[Word]:
    """Whisper lowercases a line it picked up mid-sentence; a caption starts a sentence with a capital."""
    out = []
    for i, w in enumerate(words):
        starts = i == 0 or re.search(r'[.!?]$', words[i - 1].text)
        out.append(Word(w.text[:1].upper() + w.text[1:], w.start, w.end, w.p) if starts else w)
    return out


def cards(words: list[Word]) -> list[list[Word]]:
    """Up to three words a card: a new card after a full stop or comma, a pause, or 18 letters."""
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for w in sentence_case(words):
        if cur:
            letters = sum(len(x.text) for x in cur) + len(w.text)
            if len(cur) >= GROUP or letters > 18 or w.start - cur[-1].end > 0.45 or re.search(r'[.,!?;:]$', cur[-1].text):
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


def write_ass(groups: list[list[Word]], places: list[tuple[float, bool]], path: Path, w: int = 1080, h: int = 1920) -> None:
    """places[i] = (centre y, dark backing) for card i, from face.Placer."""
    outline = 5
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
        f'Style: Caption,{FONT},{SIZE},{WHITE},{WHITE},{INK},&H78000000,0,0,0,0,100,100,0,0,1,{outline},2,5,150,150,0,1',
        # a close-up: the same words on a dark box (BorderStyle 3) so they read over a chin or chest
        f'Style: Backed,{FONT},{SIZE},{WHITE},{WHITE},&H50000000,&H50000000,0,0,0,0,100,100,0,0,3,14,0,5,150,150,0,1',
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ]
    for gi, g in enumerate(groups):
        y, backed = places[gi]
        card_end = g[-1].end
        if gi + 1 < len(groups) and groups[gi + 1][0].start - card_end < 0.3:
            card_end = groups[gi + 1][0].start  # no flicker between cards that follow on
        for i, word in enumerate(g):
            start = word.start if i else g[0].start
            end = g[i + 1].start if i + 1 < len(g) else card_end
            if end <= start:
                continue
            text = ' '.join((f'{{\\c{HONEY}}}{clean(x.text)}{{\\c{WHITE}}}' if j == i else clean(x.text)) for j, x in enumerate(g))
            pop = '\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)' if i == 0 else ''
            lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},{"Backed" if backed else "Caption"},,0,0,0,,{{\\an5\\pos({w // 2},{round(y)}){pop}}}{text}')
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def write_srt(groups: list[list[Word]], path: Path) -> None:
    blocks = [f'{i}\n{srt_time(g[0].start)} --> {srt_time(g[-1].end)}\n{" ".join(w.text for w in g)}\n' for i, g in enumerate(groups, 1)]
    path.write_text('\n'.join(blocks), encoding='utf-8')
