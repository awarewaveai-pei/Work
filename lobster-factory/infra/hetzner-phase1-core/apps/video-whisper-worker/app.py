"""Dedicated Video LEGO Whisper worker.

Runs only on the RTX workstation.  It intentionally has no meeting routes,
browser UI, generic downloads, or unauthenticated status endpoint.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import socket
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from faster_whisper import WhisperModel

app = FastAPI(title="Video Whisper Worker", docs_url=None, redoc_url=None)
MAX_BYTES = 500 * 1024 * 1024
_model: WhisperModel | None = None


class Job(BaseModel):
    job_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    source_url: str
    source_checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    callback_url: str
    callback_secret: str = Field(min_length=32, max_length=256)
    model: str = Field(default="large-v3", pattern=r"^[A-Za-z0-9._-]{1,64}$")


def require_token(authorization: str) -> None:
    expected = os.environ.get("VIDEO_WHISPER_WORKER_TOKEN", "")
    if not expected or not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise HTTPException(401, "invalid worker token")


def public_https(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(422, "only absolute https URLs are accepted")
    host = parsed.hostname.lower()
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError("private address")
    except (OSError, ValueError):
        raise HTTPException(422, "non-public URL forbidden") from None


def get_model(name: str) -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(name, device="cuda", compute_type="float16")
    return _model


def execute(job: Job) -> None:
    result: dict[str, object]
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as out:
            path = Path(out.name)
            digest = hashlib.sha256()
            size = 0
            with httpx.stream("GET", job.source_url, timeout=120, follow_redirects=False) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError("source exceeds 500MB")
                    digest.update(chunk)
                    out.write(chunk)
        if not hmac.compare_digest(digest.hexdigest(), job.source_checksum_sha256):
            raise ValueError("source checksum mismatch")
        segments, info = get_model(job.model).transcribe(str(path), word_timestamps=True)
        result = {"ok": True, "jobId": job.job_id, "transcript": {
            "model": job.model, "backend": "cuda/float16", "language": info.language,
            "language_probability": info.language_probability, "audio_duration_sec": info.duration,
            "segments": [{"id": index, "start": segment.start, "end": segment.end, "text": segment.text,
                          "avg_logprob": segment.avg_logprob, "no_speech_prob": segment.no_speech_prob}
                         for index, segment in enumerate(segments)],
        }}
    except Exception as exc:  # callback contains no local path or secret
        result = {"ok": False, "jobId": job.job_id, "error": f"{type(exc).__name__}: {exc}"}
    finally:
        if path is not None:
            path.unlink(missing_ok=True)
    # A lost response must be retryable. next-admin makes completed callbacks idempotent.
    for delay in (0, 2, 8):
        if delay:
            time.sleep(delay)
        try:
            httpx.post(job.callback_url, json={**result, "callbackSecret": job.callback_secret}, timeout=30).raise_for_status()
            return
        except Exception:
            continue


@app.get("/health")
def health():
    return {"ok": True, "service": "video-whisper-worker"}


@app.post("/v1/jobs")
def submit(job: Job, authorization: str = Header(default="")):
    require_token(authorization)
    public_https(job.source_url)
    public_https(job.callback_url)
    threading.Thread(target=execute, args=(job,), daemon=True).start()
    return {"ok": True, "jobId": job.job_id, "status": "accepted"}
