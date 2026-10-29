"""Dedicated Video LEGO Whisper worker.

Runs on ks-aw-01 (CPU int8, docker-compose.whisper.yml) or an RTX workstation (CUDA).
It intentionally has no meeting routes, browser UI, generic downloads, or
unauthenticated status endpoint.
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
from faster_whisper import WhisperModel, decode_audio

app = FastAPI(title="Video Whisper Worker", docs_url=None, redoc_url=None)
MAX_BYTES = 500 * 1024 * 1024
# A host install sets this to next-admin's internal address; the callback must then start with it.
CALLBACK_BASE = os.environ.get("VIDEO_WHISPER_CALLBACK_BASE", "").rstrip("/")
DEVICE = os.environ.get("VIDEO_WHISPER_DEVICE", "auto")  # auto | cuda | cpu
CPU_THREADS = int(os.environ.get("VIDEO_WHISPER_CPU_THREADS", "8"))
ZH_HANT_PROMPT = "以下是繁體中文的影片旁白，請以臺灣用語的繁體中文輸出。"
_models: dict[str, tuple[WhisperModel, str]] = {}
_model_lock = threading.Lock()
# One job at a time: two CPU transcriptions in parallel each take twice as long and double the memory.
_job_slot = threading.Semaphore(1)


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


def check_callback(value: str) -> None:
    if CALLBACK_BASE:
        if not value.startswith(CALLBACK_BASE + "/"):
            raise HTTPException(422, "callback outside the configured base")
        return
    public_https(value)


def get_model(name: str) -> tuple[WhisperModel, str]:
    """Model + backend label. auto: a model that builds can still fail on the first encode when
    cuBLAS/cuDNN is missing, so a one-second probe decides (same as meeting-service pick_device)."""
    with _model_lock:
        if name in _models:
            return _models[name]
        loaded: tuple[WhisperModel, str] | None = None
        if DEVICE in ("auto", "cuda"):
            try:
                import numpy as np
                model = WhisperModel(name, device="cuda", compute_type="float16")
                list(model.transcribe(np.zeros(16000, dtype=np.float32), vad_filter=False)[0])
                loaded = (model, "cuda/float16")
            except Exception:
                if DEVICE == "cuda":
                    raise
        if loaded is None:
            loaded = (WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS), f"cpu/int8 x{CPU_THREADS}")
        _models[name] = loaded
        return loaded


def execute(job: Job) -> None:
    with _job_slot:
        _execute(job)


def _execute(job: Job) -> None:
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
        model, backend = get_model(job.model)
        audio = decode_audio(str(path))
        # Without a Traditional-Chinese prompt Whisper writes Mandarin in Simplified (2026-10-29 host test);
        # the prompt goes in only for Chinese audio so it cannot bias other languages.
        language, _, _ = model.detect_language(audio)
        prompt = ZH_HANT_PROMPT if language == "zh" else None
        # beam_size=1 + VAD: meeting-service measured beam 5 -> 1 as 29% faster with no visible loss.
        segments, info = model.transcribe(audio, language=language, initial_prompt=prompt, word_timestamps=True, vad_filter=True, beam_size=1)
        result = {"ok": True, "jobId": job.job_id, "transcript": {
            "model": job.model, "backend": backend, "language": info.language,
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
    check_callback(job.callback_url)
    threading.Thread(target=execute, args=(job,), daemon=True).start()
    return {"ok": True, "jobId": job.job_id, "status": "accepted"}
