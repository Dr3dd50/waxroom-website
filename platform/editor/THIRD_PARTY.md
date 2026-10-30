# Where the editor comes from

The editor is a server rebuild of **ghost-editor** (https://github.com/kurbaitaev/ghost-editor),
MIT licensed. Its pipeline, and the rules and numbers inside each step, are ghost-editor's. What
changed is who decides and what renders. Claude picked takes and wrote a plan in ghost-editor;
here fixed rules do it. ghost-editor rendered in headless Chrome on a Mac; here one ffmpeg pass
renders, so an edit runs unattended on AWS Lambda.

| Here | Adapted from (ghost-editor) |
| --- | --- |
| `edit.py` prep | `scripts/prep.sh`: 1080x1920 at 30 fps, landscape centre-cropped, HDR tone-mapped, the voice at -16 LUFS by two-pass loudnorm |
| `edit.py` transcribe | `scripts/transcribe.py`: anti-merge decoding (no conditioning on earlier text, temperature 0/0.2/0.4, no-speech 0.6, compression ratio 2.2, hallucination silence 1.0) |
| `takes.py` | `scripts/takes.py` (Smith-Waterman with fuzzy word matching) and `references/take-selection.md`. Those take rules come from mariagorskikh/talking-head-reel (MIT) |
| `cut.py` | `scripts/plan_cut.py` (cut edges from the voice's energy envelope, lead 0.10 s, tail 0.18 s, pause trimming, 30 fps grid) and `scripts/voice_smooth.py` (35 ms equal-power joins, per-take level match ±3 dB) |
| `face.py` | `scripts/face_track.py` (YuNet) and `scripts/lib/safezone.mjs` (captions below the chin, else above the head, else backed under the mouth, inside the Reels/TikTok/Shorts safe area) |
| `captions.py` | `styles/clean.json`: three words a card, mixed case, the spoken word in one accent colour |
| `sound.py` | `scripts/build.mjs` and `references/sound-and-memes.md`: real recorded effects, levels by role against the voice's p95 peak, rotating variants, a density cap, music 20 dB under the voice |
| `fetch_kit.py`, `library/kit.json` | `scripts/sfx_fetch.py`, `scripts/library_restore.py` and the pinned Mixkit picks in `library/*/manifest.json` |
| `edit.py` checks | `scripts/qa.py`: loudness, true peak, pauses left, captions on the face |

## Other parts

- **Sound effects and music**: from Mixkit (https://mixkit.co/license/). They're free for
  commercial use with no credit needed, but the files may not be redistributed as they are, so
  `fetch_kit.py` downloads them at setup and Docker build time and git ignores them. The music
  may not go to TV, radio or games, or be registered with YouTube Content ID.
- **Face detection**: OpenCV's YuNet model (MIT), from opencv_zoo, downloaded at setup.
- **Speech recognition**: faster-whisper (MIT) with OpenAI's Whisper models (MIT).
- **Caption font**: Archivo Black, SIL Open Font License (`fonts/OFL.txt`).

## ghost-editor's licence

MIT License

Copyright (c) 2026 kurbaitaev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## talking-head-reel's licence (the take rules)

MIT License

Copyright (c) 2026 mariagorskikh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
