"""AWS entry point: the API invokes this Lambda (asynchronously) once a video is uploaded.

The event is {"bucket", "source", "prefix", "options"}. The source is downloaded from S3,
edited by edit.py, and everything it writes goes back under the prefix: progress.json while
it works, then edited.mp4, captions.srt and result.json, or error.json if it can't finish.
The API reads those files; this function never touches the database.
"""

import json
import time
from pathlib import Path

import boto3

from edit import Options, edit

s3 = boto3.client('s3')


def put_json(bucket: str, key: str, body: dict) -> None:
    s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(body).encode(), ContentType='application/json')


def handler(event, _context):
    bucket, prefix = event['bucket'], event['prefix']
    opts = event.get('options') or {}
    work = Path('/tmp/edit')
    src = work / 'source'
    out = work / 'out'
    last = [0.0]

    def on_progress(stage: str, pct: float) -> None:
        if time.time() - last[0] >= 4:
            last[0] = time.time()
            put_json(bucket, f'{prefix}progress.json', {'stage': stage, 'pct': round(pct, 3)})

    try:
        work.mkdir(parents=True, exist_ok=True)
        s3.download_file(bucket, event['source'], str(src))
        result = edit(src, out, Options(cut=opts.get('cut', True), captions=opts.get('captions', True), sfx=opts.get('sfx', True), pace=opts.get('pace', 'natural')), on_progress)
        types = {'.mp4': 'video/mp4', '.srt': 'application/x-subrip'}
        for name in result['files']:
            s3.upload_file(str(out / name), bucket, f'{prefix}{name}', ExtraArgs={'ContentType': types[Path(name).suffix]})
        put_json(bucket, f'{prefix}result.json', result)
    except Exception as e:
        put_json(bucket, f'{prefix}error.json', {'error': str(e) or e.__class__.__name__})
    finally:
        # a warm container keeps /tmp: don't let one job's files fill it for the next
        for f in sorted(work.rglob('*'), reverse=True) if work.exists() else []:
            f.unlink() if f.is_file() else f.rmdir()
