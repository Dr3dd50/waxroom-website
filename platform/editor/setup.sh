#!/bin/sh
# One-time setup for running the video editor locally (npm run dev:all, or edit.py by hand).
# Needs ffmpeg with libass on the PATH. Downloads the sound kit and the face model here; the
# first edit downloads the speech model (~150 MB).
set -e
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "editor: install ffmpeg first (brew install ffmpeg / apt install ffmpeg)" >&2; exit 1; }
python3 -m pip install -q -r requirements.txt
python3 fetch_kit.py
python3 -c "import face; face.ensure_model()"
python3 -c "import faster_whisper, cv2" && echo "editor: ready ($(command -v python3))"
