"""Download the sound kit listed in library/kit.json into library/sfx and library/music.

    python3 platform/editor/fetch_kit.py

Adapted from ghost-editor's sfx_fetch.py and library_restore.py (MIT, see THIRD_PARTY.md): every
effect is the Mixkit sound ghost-editor pinned, trimmed of silence at both ends, cut to its
length, faded out and peak-normalised to -1 dBFS, so the editor sets each one's level by role
against the speaker's voice rather than by whatever the file shipped at. Music beds are kept as
they come. Files already there are kept. Run by setup.sh and the Docker build.
"""

import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

LIB = Path(__file__).resolve().parent / 'library'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36'


def fetch(url: str, dst: Path) -> None:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dst.write_bytes(r.read())


def normalise(src: Path, dst: Path, max_s: float) -> None:
    trim = (
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01,'
        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,'
        f'atrim=0:{max_s},afade=t=out:st={max(0.0, max_s - 0.02)}:d=0.02'
    )
    tmp = dst.with_suffix('.tmp.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', trim, '-ar', '48000', '-ac', '2', str(tmp)], check=True)
    vd = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(tmp), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', vd).group(1))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-af', f'volume={-1.0 - peak}dB', '-c:a', 'pcm_s16le', str(dst)], check=True)
    tmp.unlink()


def main() -> None:
    kit = json.loads((LIB / 'kit.json').read_text())
    (LIB / 'sfx').mkdir(exist_ok=True)
    (LIB / 'music').mkdir(exist_ok=True)
    failed = []
    for sid, e in kit['sfx'].items():
        dst = LIB / 'sfx' / f'{sid}.wav'
        if dst.exists():
            continue
        try:
            with tempfile.TemporaryDirectory() as td:
                raw = Path(td) / 'raw.mp3'
                fetch(f'https://assets.mixkit.co/active_storage/sfx/{e["mixkit_id"]}/{e["mixkit_id"]}-preview.mp3', raw)
                normalise(raw, dst, e['max_seconds'])
            print(f'ok   sfx {sid} ({e["title"]})')
        except Exception as err:  # report and carry on; never leave a stub behind
            dst.unlink(missing_ok=True)
            failed.append(sid)
            print(f'FAIL sfx {sid}: {err}', file=sys.stderr)
    for mid, e in kit['music'].items():
        dst = LIB / 'music' / f'{mid}.mp3'
        if dst.exists():
            continue
        try:
            fetch(e['url'], dst)
            if dst.stat().st_size < 100_000:
                raise RuntimeError('too small to be the track')
            print(f'ok   music {mid}')
        except Exception as err:
            dst.unlink(missing_ok=True)
            failed.append(mid)
            print(f'FAIL music {mid}: {err}', file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
