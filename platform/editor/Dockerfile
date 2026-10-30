# The video editor's Lambda image: Python, a static ffmpeg (with libass for the captions),
# auto-editor, faster-whisper and its speech model, all baked in so a run downloads nothing.
FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y tar xz && dnf clean all \
 && curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -xJ -C /tmp \
 && mv /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe /usr/local/bin/ \
 && rm -rf /tmp/ffmpeg-*-static

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 # auto-editor fetches its engine on first run: do that now, while the image is still writable
 && auto-editor --version

ENV EDITOR_MODEL=base.en EDITOR_MODELS=/opt/models HF_HUB_OFFLINE=1
RUN HF_HUB_OFFLINE=0 python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', download_root='/opt/models')"

COPY edit.py handler.py ${LAMBDA_TASK_ROOT}/
COPY fonts ${LAMBDA_TASK_ROOT}/fonts
CMD ["handler.handler"]
