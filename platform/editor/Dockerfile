# The video editor's Lambda image: Python, a static ffmpeg (with libass for the captions and
# zscale for HDR phone footage), faster-whisper and its speech model, OpenCV with the YuNet face
# model, and the Mixkit sound kit, all baked in so an edit downloads nothing.
FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y tar xz && dnf clean all \
 && curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -xJ -C /tmp \
 && mv /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe /usr/local/bin/ \
 && rm -rf /tmp/ffmpeg-*-static

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV EDITOR_MODEL=base.en EDITOR_MODELS=/opt/models HF_HUB_OFFLINE=1
RUN HF_HUB_OFFLINE=0 python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', download_root='/opt/models')" \
 && curl -fsSL -o /opt/models/face_detection_yunet_2023mar.onnx \
    https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx

COPY fonts ${LAMBDA_TASK_ROOT}/fonts
COPY library/kit.json ${LAMBDA_TASK_ROOT}/library/kit.json
COPY fetch_kit.py ${LAMBDA_TASK_ROOT}/
RUN python ${LAMBDA_TASK_ROOT}/fetch_kit.py

COPY *.py ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
