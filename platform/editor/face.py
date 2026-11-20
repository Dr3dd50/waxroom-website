"""Where the speaker's face is, so captions never cover it and punch-ins centre on it.

Adapted from ghost-editor's face_track.py and lib/safezone.mjs (MIT): OpenCV's YuNet detector
(MIT; fetched once into library/models) samples the prepared 1080x1920 video a few times a
second, and the box is grown to cover hair and chin. A caption block goes below the chin near
the ideal reading height, else above the head, else just under the mouth on a dark backing,
always inside the area Reels, TikTok and Shorts leave clear, and it only moves between blocks.
"""

from __future__ import annotations

import os
import urllib.request
from pathlib import Path

LIB = Path(__file__).resolve().parent / 'library'
MODEL = Path(os.environ.get('EDITOR_MODELS') or LIB / 'models') / 'face_detection_yunet_2023mar.onnx'
# opencv_zoo keeps its models in Git LFS: the media host serves the file itself, raw serves a pointer
MODEL_URL = 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
W, H = 1080, 1920
# what Reels + TikTok + Shorts cover at 1080x1920 (ghost-editor's measured "all" guide)
SAFE_TOP, SAFE_BOTTOM = 220, H - 480
IDEAL = 1180  # the clean style's reading height
GAP = 36


def ensure_model() -> Path:
    if not MODEL.exists():
        MODEL.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, MODEL)
    return MODEL


def track(video: Path, fps: float = 5) -> list[tuple[float, list[float] | None]]:
    """[(source seconds, [top, bottom, left, right, eyes_y] | None)] in 1080x1920 pixels."""
    try:
        import cv2

        model = ensure_model()
    except Exception:  # no OpenCV or no model: captions go to the default height
        return []
    cap = cv2.VideoCapture(str(video))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    q = 4  # a quarter-size frame is plenty for a talking head
    det = cv2.FaceDetectorYN.create(str(model), '', (W // q, H // q), 0.6)
    step = max(1, round(src_fps / fps))
    out = []
    f = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if f % step == 0:
            ok, fr = cap.retrieve()
            if not ok:
                break
            _, faces = det.detect(cv2.resize(fr, (W // q, H // q)))
            t = f / src_fps
            if faces is None or not len(faces):
                out.append((t, None))
            else:
                best = max(faces, key=lambda r: r[2] * r[3])
                x, y, w, h = (float(v) * q for v in best[:4])
                eyes = (float(best[5]) + float(best[7])) / 2 * q
                out.append((t, [max(0, y - 0.35 * h), min(H, y + 1.12 * h), max(0, x - 0.08 * w), min(W, x + 1.08 * w), eyes]))
        f += 1
    cap.release()
    return out


def origin(samples) -> tuple[float, float]:
    """The point punch-ins scale around: between the eyes, or ghost-editor's default 50% 29%."""
    boxes = [b for _, b in samples if b]
    if len(boxes) < max(3, len(samples) // 4):
        return W * 0.5, H * 0.29
    xs = sorted((b[2] + b[3]) / 2 for b in boxes)
    ys = sorted(b[4] for b in boxes)
    return xs[len(xs) // 2], ys[len(ys) // 2]


class Placer:
    """The centre height of each caption block, given the face and the punch-in at that moment."""

    def __init__(self, samples, ox: float, oy: float, block_h: float):
        self.samples = samples
        self.ox, self.oy = ox, oy
        self.h = block_h
        self.last: float | None = None

    def face(self, a: float, b: float, zoom: float):
        """The union of the face boxes between source seconds a and b, on screen."""
        boxes = [s for t, s in self.samples if a - 0.2 <= t <= b + 0.2 and s]
        if not boxes:
            return None
        top = min(s[0] for s in boxes)
        bottom = max(s[1] for s in boxes)
        return self.oy + (top - self.oy) * zoom, self.oy + (bottom - self.oy) * zoom

    def place(self, a: float, b: float, zoom: float) -> tuple[float, bool]:
        """(centre y, needs a dark backing)."""
        half = self.h / 2
        f = self.face(a, b, zoom)
        backing = False
        if not f:
            y = IDEAL
        else:
            top, bottom = f
            below = max(IDEAL, bottom + GAP + half)
            if below + half <= SAFE_BOTTOM:
                y = below
            elif top - GAP - half >= SAFE_TOP + half:
                y = top - GAP - half
            else:  # a close-up: under the mouth, on a backing so it reads over the chin or chest
                y, backing = min(SAFE_BOTTOM - half, bottom - half), True
        if self.last is not None and abs(y - self.last) < 40 and not backing:
            y = self.last  # small moves read as captions hopping
        self.last = y
        return y, backing
