#!/usr/bin/env python3
"""server.py — video-service HTTP 介面（render-only 微服務 + /generate-job 全自動管道）。

next-admin `video/pipeline` 積木負責：生腳本(Claude) + 生圖(Flux) + 抓 B-roll(Pexels)，
然後把 scenes + 視覺素材交給本服務合成。本服務刻意只做 render（見 pipeline.render_video）。

  POST /render   body JSON:
    { "scenes":  [{"id":1,"narration":"旁白...","duration":8}, ...],
      "assets":  ["/local/path.png" | "https://cdn/clip.mp4", ...],   # 與 scenes 等長
      "out_name": "影片名" }
    → 202 { "jobId": "..." }

  POST /render-footage   body JSON:
    { "clips": [{"source_url":"https://.../clip.mp4","source_start_ms":0,"duration_ms":4000}, ...],
      "formats": ["16x9"], "out_name": "...",
      "audio": {"source_url":"https://.../voice.mp3","source_start_ms":0,"duration_ms":4000},  # 選填
      "captions": [{"start_ms":0,"end_ms":2000,"text":"..."}] }                                 # 選填
    → 202 { "jobId": "..." }
    實拍素材剪輯（trim+concat），非 TTS 驅動；輪詢沿用 GET /job。

  POST /reburn-captions   body JSON:
    { "clean_url": "<R2 public>/videoclean/<dir>/<fmt>.mp4", "format": "16x9", "object_key": "video/<dir>/16x9.mp4",
      "cues": [{"startMs":0,"endMs":2000,"text":"..."}] }
    → 202 { "jobId": "..." }；字幕改完後在無字幕底片重燒並覆寫 object_key，輪詢沿用 GET /job。

  POST /generate-job   body JSON:
    { "topic": "主題", "language": "繁體中文", "scene_count": 6,
      "tts_voice": "zh-TW-HsiaoChenNeural", "intro_title": "", "intro_duration": 3.0 }
    全自動：Claude 腳本 → Pexels B-roll → render → R2 上傳
    → 202 { "jobId": "..." }
    → 400 缺 topic；503 未設 CLAUDE_API_KEY / PEXELS_API_KEY

  GET /job?jobId=<id> → { "jobId", "status": "running"|"done"|"error", ... }
  GET /health → { "ok": true }

零新依賴（stdlib http.server）。綁 127.0.0.1（內網服務）。render 全域序列化
（CPU-bound + 共用 TEMP_DIR，並行無益且會撞檔）。assets 可為本機路徑（dev）或
https URL（prod，下載前過 SSRF guard：https-only + 擋私有/迴圈/link-local）。
"""
import os
import re
import json
import hmac
import math
import time
import uuid
import socket
import ipaddress
import threading
import subprocess
import hashlib
from urllib.parse import urlparse, quote, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

from auth_policy import authentication_required
import config
import pipeline
import captions as caption_utils
from quality import evaluate_probe, evaluate_signal_quality

HOST = os.getenv("VIDEO_SERVICE_HOST", "127.0.0.1")
PORT = int(os.getenv("VIDEO_SERVICE_PORT", "8732"))
MAX_ASSET_BYTES = int(os.getenv("RENDER_MAX_ASSET_MB", "200")) * 1024 * 1024
MAX_SCENES = int(os.getenv("RENDER_MAX_SCENES", "30"))
MAX_BODY_BYTES = int(os.getenv("RENDER_MAX_BODY_KB", "256")) * 1024  # JSON 很小（素材是 URL/路徑非內嵌）
# 認證：/render、/generate-job、/job 皆要求 X-Render-Token。
# 空 token 只允許顯式 loopback-only 本機開發，啟動時驗證。
RENDER_AUTH_TOKEN = os.getenv("RENDER_AUTH_TOKEN", "")
ALLOW_INSECURE_LOCAL_RENDER = os.getenv("ALLOW_INSECURE_LOCAL_RENDER", "").lower() == "true"
AUTH_REQUIRED = True
# R2 共用憑證（與 next-admin 共享同一組 API token + account）
R2_API_TOKEN = os.getenv("R2_API_TOKEN", "")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
# 影片輸出專用 bucket（隔離於圖片 bucket；後續可設 7 天 lifecycle）
R2_VIDEO_BUCKET = os.getenv("R2_VIDEO_BUCKET", "lobster-videos")
R2_VIDEO_PUBLIC_BASE = os.getenv("R2_VIDEO_PUBLIC_BASE", "").rstrip("/")
# staging points this at its allowlisted egress proxy (docker-compose.renderer-staging.yml); prod keeps the default
R2_API_BASE_URL = os.getenv("R2_API_BASE_URL", "https://api.cloudflare.com").rstrip("/")
_render_lock = threading.Lock()

# /generate-job 全自動管道憑證
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
# Script writer for /generate-job. Must be a TEXT_RATES key (next-admin lib/ai/cost-model.ts; model-registry.test.ts scans this file).
VIDEO_SCRIPT_MODEL = os.getenv("VIDEO_SCRIPT_MODEL", "claude-haiku-5-5").strip() or "claude-haiku-5-5"


def _r2_video_configured() -> bool:
    return bool(R2_API_TOKEN and R2_ACCOUNT_ID and R2_VIDEO_BUCKET and R2_VIDEO_PUBLIC_BASE)


def _r2_put(object_key: str, data: bytes, content_type: str, bucket: str, public_base: str) -> str:
    """上傳一個物件到指定 R2 bucket（CF R2 API），回 public URL；失敗丟例外。"""
    key_path = quote(object_key, safe="/")
    url = (f"{R2_API_BASE_URL}/client/v4/accounts/{R2_ACCOUNT_ID}"
           f"/r2/buckets/{bucket}/objects/{key_path}")
    r = requests.put(url, headers={"Authorization": f"Bearer {R2_API_TOKEN}",
                                   "Content-Type": content_type}, data=data, timeout=120)
    if not r.ok:
        raise RuntimeError(f"r2_put_failed_{r.status_code}: {r.text[:200]}")
    return f"{public_base}/{object_key}"


def _authed(handler: "BaseHTTPRequestHandler") -> bool:
    """Compare the renderer token after the startup policy has validated it."""
    if not AUTH_REQUIRED:
        return True
    return hmac.compare_digest(handler.headers.get("X-Render-Token", ""), RENDER_AUTH_TOKEN)


def _is_safe_https_url(url: str) -> bool:
    """https-only + 解析後 **allowlist**：只放行公網位址（is_global，fails-closed）。
    自動擋私有/迴圈/link-local/保留/multicast/CGNAT(100.64/10)；IPv4-mapped 先正規化。
    ⚠️ 殘留風險：DNS-rebinding TOCTOU —— 此處解析與 requests 下載各自解析一次，理論上可
    在兩次間切換 IP。本服務綁 127.0.0.1 且呼叫者為受信任 next-admin 積木（素材來自
    Flux/Pexels 公網 CDN），故為可接受 interim；Phase 2 對外暴露前須改「解析一次→pin IP 連線」。"""
    try:
        u = urlparse(url)
        if u.scheme != "https" or not u.hostname:
            return False
        for *_, sockaddr in socket.getaddrinfo(u.hostname, 443):
            ip = ipaddress.ip_address(sockaddr[0])
            # ipv4_mapped 僅 IPv6Address 有此屬性；IPv4Address 直接存取會 AttributeError
            # → 被外層 except 吞成 fails-closed，誤擋所有 IPv4 host（Pexels CDN 即中此 bug）。
            mapped = getattr(ip, "ipv4_mapped", None)
            if mapped:                    # 正規化 ::ffff:a.b.c.d，避免版本相依繞過
                ip = mapped
            if not ip.is_global:          # allowlist：非公網一律擋
                return False
        return True
    except Exception:
        return False


def _materialize_asset(asset: str, idx: int) -> str:
    """本機路徑 → 直接用；https URL → 過 guard 後下載（不跟隨重導向、大小上限）。"""
    if not asset.startswith(("http://", "https://")):
        if not os.path.exists(asset):
            raise ValueError(f"asset[{idx}] 本機檔不存在: {asset}")
        return asset
    if not _is_safe_https_url(asset):
        raise ValueError(f"asset[{idx}] 非安全 https URL（SSRF guard 擋下）")
    ext = os.path.splitext(urlparse(asset).path)[1].lower() or ".bin"
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    dst = str(config.TEMP_DIR / f"asset_{idx}{ext}")
    total = 0
    # allow_redirects=False：重導向可繞過 guard（甚至降級 http / 指向私有 IP）→ 一律拒
    with requests.get(asset, stream=True, timeout=60, allow_redirects=False) as r:
        if 300 <= r.status_code < 400:
            raise ValueError(f"asset[{idx}] 不允許重導向（{r.status_code}）")
        r.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in r.iter_content(65536):
                total += len(chunk)
                if total > MAX_ASSET_BYTES:
                    raise ValueError(f"asset[{idx}] 超過大小上限 {MAX_ASSET_BYTES} bytes")
                f.write(chunk)
    return dst


def _validate(payload: dict):
    """回 (scenes, assets, out_name, multiformat)。
    multiformat=True 時 assets 為 {fmt: [urls]} dict（每格式原生圖組）；
    False 時 assets 為單一 list（舊單組，EU 內部走 base+pad export — 向後相容窗口期）。"""
    scenes = payload.get("scenes")
    out_name = payload.get("out_name", "video")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("scenes 必須是非空 list")
    if len(scenes) > MAX_SCENES:
        raise ValueError(f"scenes 過多（{len(scenes)} > {MAX_SCENES}）")
    format_assets = payload.get("format_assets")
    if format_assets is not None:
        # 多格式原生路徑（新 next-admin）
        if not isinstance(format_assets, dict) or not format_assets:
            raise ValueError("format_assets 必須是非空 dict")
        for fmt, files in format_assets.items():
            if fmt not in config.FORMATS:  # fail-fast on HTTP boundary（免白跑 TTS 才在 pipeline 才擋）
                raise ValueError(f"未知格式 {fmt}（合法：{list(config.FORMATS)}）")
            if not isinstance(files, list) or len(files) != len(scenes):
                raise ValueError(f"format_assets[{fmt}] 必須是與 scenes 等長的 list")
        return scenes, format_assets, out_name, True
    # 舊單組路徑（向後相容：舊 next-admin 或 /generate-job 內部呼叫）
    assets = payload.get("assets")
    if not isinstance(assets, list) or len(assets) != len(scenes):
        raise ValueError("assets 必須與 scenes 等長")
    return scenes, assets, out_name, False


def _probe_video(path: str) -> dict:
    """Return the reproducible ffprobe evidence used by technical QA."""
    res = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:format=duration,size",
            "-of", "json",
            path,
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {res.stderr[-300:]}")
    parsed = json.loads(res.stdout or "{}")
    streams = parsed.get("streams", [])
    if not streams:
        raise RuntimeError(f"ffprobe found no video stream: {path}")
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    width = int((video or {}).get("width") or 0)
    height = int((video or {}).get("height") or 0)
    if width <= 0 or height <= 0:
        raise RuntimeError(f"ffprobe invalid dimensions for {path}: {width}x{height}")
    return parsed


def _signal_probe(path: str, duration: float) -> dict:
    """Collect black/freeze/loudness evidence with one bounded ffmpeg pass."""
    res = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path,
         "-vf", "blackdetect=d=0.5:pic_th=0.98:pix_th=0.10,freezedetect=n=-60dB:d=0.5",
         "-af", "ebur128=framelog=verbose", "-f", "null", "-"],
        capture_output=True, text=True, timeout=60,
    )
    output = f"{res.stdout}\n{res.stderr}"
    black_seconds = sum(float(end) - float(start) for start, end in re.findall(r"black_start:\s*([0-9.]+).*?black_end:\s*([0-9.]+)", output))
    freeze_events = len(re.findall(r"freeze_start:\s*[0-9.]+", output))
    lufs = [float(value) for value in re.findall(r"\bI:\s*(-?[0-9]+(?:\.[0-9]+)?)\s+LUFS", output)]
    peaks = [float(value) for value in re.findall(r"\b(?:Peak|Peak level):\s*(-?[0-9]+(?:\.[0-9]+)?)\s+dBFS", output)]
    return {
        "blackRatio": max(0.0, min(1.0, black_seconds / duration)) if duration > 0 else 0.0,
        "freezeEvents": freeze_events,
        "integratedLufs": lufs[-1] if lufs else None,
        "truePeakDb": peaks[-1] if peaks else None,
        "ffmpegExitCode": res.returncode,
    }


def _build_output_meta(outputs: dict) -> dict:
    meta = {}
    for fmt, path in outputs.items():
        probe = _probe_video(str(path))
        video = next(s for s in probe["streams"] if s.get("codec_type") == "video")
        size = {"width": int(video["width"]), "height": int(video["height"])}
        expected = config.FORMATS.get(fmt)
        item = dict(size)
        # The checksum is part of the immutable media identity.  Compute it
        # after rendering and before upload so downstream media_assets and QA
        # records can pin evidence to the exact bytes that were delivered.
        digest = hashlib.sha256()
        byte_size = 0
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                byte_size += len(chunk)
                digest.update(chunk)
        item["byteSize"] = byte_size
        item["checksumSha256"] = digest.hexdigest()
        if expected:
            item["expected_width"] = expected[0]
            item["expected_height"] = expected[1]
            if (size["width"], size["height"]) != expected:
                raise RuntimeError(
                    f"output {fmt} dimensions {size['width']}x{size['height']} "
                    f"!= expected {expected[0]}x{expected[1]}"
                )
        qa = evaluate_probe(probe, expected)
        item["technical_qa"] = qa
        signal_qa = evaluate_signal_quality(probe, _signal_probe(str(path), float((probe.get("format") or {}).get("duration") or 0)))
        item["signal_qa"] = signal_qa
        # A failed QA report is returned with the video (next-admin records both and shows why); throwing here
        # discarded a finished, paid-for render. Dimension mismatch above stays an exception: that is a broken render.
        meta[fmt] = item
    return meta


def _do_render(scenes, assets, out_name, tts_provider="edge", tts_voice="",
               intro_title="", intro_duration=3.0, multiformat=False) -> dict:
    """重活：序列化 materialize+render+R2 上傳。回 {outputs,out_dir,storage}。
    multiformat=True：assets 為 {fmt:[urls]}，每格式各 materialize 後走 render_video_multiformat
    （原生比例、無 pad）；False：assets 為單組，走舊 render_video（base+pad export）。"""
    caption_sink: dict = {}
    clean_sink: dict = {}  # fmt -> caption-less video (V4.8), filled only for script-caption multiformat renders
    with _render_lock:  # 序列化：materialize(下載)+render 全程獨佔 TEMP_DIR（防並行撞檔）
        try:
            if multiformat:
                # 每格式各下載一組（idx 全域遞增 → asset_N.ext 不撞名）。
                format_files = {}
                _idx = 0
                for fmt, urls in assets.items():
                    files = []
                    for u in urls:
                        files.append(_materialize_asset(u, _idx))
                        _idx += 1
                    format_files[fmt] = files
                outputs, out_dir = pipeline.render_video_multiformat(
                    scenes, format_files, out_name,
                    tts_provider=tts_provider, tts_voice=tts_voice,
                    intro_title=intro_title, intro_duration=intro_duration, caption_sink=caption_sink,
                    clean_sink=clean_sink,
                )
            else:
                visual_files = [_materialize_asset(a, i) for i, a in enumerate(assets)]
                outputs, _base, out_dir = pipeline.render_video(
                    scenes, visual_files, out_name,
                    tts_provider=tts_provider, tts_voice=tts_voice,
                    intro_title=intro_title, intro_duration=intro_duration, caption_sink=caption_sink,
                )
            output_meta = _build_output_meta(outputs)
            # D11: the voice is ours (script TTS), so captions come from the script + voice timing, not Whisper.
            caption_fields = ({"caption_source": "script_tts", "caption_cues": caption_sink["cues"],
                               "caption_srt": caption_sink["srt"], "caption_vtt": caption_sink["vtt"]}
                              if caption_sink.get("cues") else {})
            # 跨機：產出上傳 R2 → 回 public URL。未設 R2 = 本機路徑（dev）。
            if _r2_video_configured():
                base_key = "video/" + os.path.basename(str(out_dir))
                urls = {}
                for fmt, path in outputs.items():
                    with open(path, "rb") as fh:
                        urls[fmt] = _r2_put(
                            f"{base_key}/{fmt}.mp4", fh.read(), "video/mp4",
                            R2_VIDEO_BUCKET, R2_VIDEO_PUBLIC_BASE,
                        )
                # Clean videos live under videoclean/, not video/: next-admin's reconcile sweep reads every video/<dir>/<x>.mp4
                # as a delivered ratio and would record the clean copy as a second video.
                clean_urls = {}
                for fmt, path in clean_sink.items():
                    with open(path, "rb") as fh:
                        clean_urls[fmt] = _r2_put(
                            f"videoclean/{os.path.basename(str(out_dir))}/{fmt}.mp4", fh.read(), "video/mp4",
                            R2_VIDEO_BUCKET, R2_VIDEO_PUBLIC_BASE,
                        )
                return {"outputs": urls, "out_dir": str(out_dir), "storage": "r2", "output_meta": output_meta,
                        **({"clean_outputs": clean_urls} if clean_urls else {}), **caption_fields}
            return {
                "outputs": {k: str(v) for k, v in outputs.items()},
                "out_dir": str(out_dir),
                "storage": "local",
                "output_meta": output_meta,
                **({"clean_outputs": {k: str(v) for k, v in clean_sink.items()}} if clean_sink else {}),
                **caption_fields,
            }
        finally:
            pipeline.cleanup()


# ── async job store：POST /render 即回 jobId，背景 thread 渲染，GET /job?jobId= 查狀態 ──
# 解決「跨機長連線回應遺失 + 呼叫端 fire-and-forget 不存活」：改短連線提交+輪詢。
_JOBS: dict = {}
_jobs_lock = threading.Lock()
_JOB_TTL = 60 * 60  # 1h


def _prune_jobs():
    now = time.time()
    for jid in [k for k, v in _JOBS.items() if now - v.get("ts", now) > _JOB_TTL]:
        _JOBS.pop(jid, None)


def _run_job(job_id: str, scenes, assets, out_name,
             tts_provider="edge", tts_voice="", intro_title="", intro_duration=3.0,
             multiformat=False):
    try:
        result = _do_render(scenes, assets, out_name,
                            tts_provider=tts_provider, tts_voice=tts_voice,
                            intro_title=intro_title, intro_duration=intro_duration,
                            multiformat=multiformat)
        with _jobs_lock:
            _JOBS[job_id] = {"status": "done", **result, "ts": time.time()}
    except Exception as e:  # noqa: BLE001
        with _jobs_lock:
            _JOBS[job_id] = {"status": "error", "error": str(e), "ts": time.time()}


def submit_render(payload: dict) -> str:
    """驗證後建 job + 起背景 thread，立即回 jobId（不阻塞）。"""
    scenes, assets, out_name, multiformat = _validate(payload)
    tts_provider = payload.get("tts_provider", "edge")
    if tts_provider not in ("edge", "openai"):
        raise ValueError(f"unknown tts_provider: {tts_provider!r}; must be 'edge' or 'openai'")
    tts_voice = payload.get("tts_voice") or ""
    intro_title = payload.get("intro_title") or ""
    try:
        intro_duration = float(payload.get("intro_duration", 3.0))
    except (ValueError, TypeError):
        raise ValueError("intro_duration must be a number")
    import math
    if not math.isfinite(intro_duration) or intro_duration <= 0:
        raise ValueError("intro_duration must be a positive finite number")
    intro_duration = min(intro_duration, 15.0)  # cap at 15s to prevent runaway renders
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _prune_jobs()
        _JOBS[job_id] = {"status": "running", "ts": time.time()}
    threading.Thread(
        target=_run_job,
        args=(job_id, scenes, assets, out_name, tts_provider, tts_voice, intro_title, intro_duration, multiformat),
        daemon=True,
    ).start()
    return job_id


def get_job(job_id: str):
    with _jobs_lock:
        return _JOBS.get(job_id)


# ── /render-footage：實拍素材剪輯（trim+concat，非 TTS 驅動）────────────────────

MAX_FOOTAGE_CLIPS = int(os.getenv("RENDER_MAX_FOOTAGE_CLIPS", "120"))  # 與 timeline-v1.ts 的
# MEDIA_TIMELINE_V1_MAX_ITEMS_PER_TRACK 同步（獨立於 TTS 導向的 MAX_SCENES，避免合法 timeline 卡在服務端）
MAX_FOOTAGE_CAPTIONS = int(os.getenv("RENDER_MAX_FOOTAGE_CAPTIONS", "120"))
MAX_CLIP_DURATION_MS = int(os.getenv("RENDER_MAX_CLIP_DURATION_MS", str(20 * 60 * 1000)))  # 單一 clip 20 分鐘上限
AUDIO_DURATION_TOLERANCE_MS = 100  # 與 clips 總長度容許誤差（trim/mux 的秒級剪輯誤差）


def _finite_number(value) -> bool:
    """isinstance(value, (int,float)) 不擋 NaN/Infinity——stdlib json.loads 預設接受這兩者，
    NaN 的所有比較（含 <0、<=0）都是 False，會繞過下面的正負值檢查。"""
    return isinstance(value, (int, float)) and math.isfinite(value)


def _validate_footage(payload: dict):
    """回 (clips, formats, out_name, audio, captions)。"""
    clips = payload.get("clips")
    out_name = payload.get("out_name", "footage")
    if not isinstance(clips, list) or not clips:
        raise ValueError("clips 必須是非空 list")
    if len(clips) > MAX_FOOTAGE_CLIPS:
        raise ValueError(f"clips 過多（{len(clips)} > {MAX_FOOTAGE_CLIPS}）")
    total_duration_ms = 0.0
    for i, c in enumerate(clips):
        if not isinstance(c, dict):
            raise ValueError(f"clips[{i}] 必須是物件")
        if not isinstance(c.get("source_url"), str) or not c["source_url"].startswith("https://"):
            raise ValueError(f"clips[{i}].source_url 必須是 https:// URL")
        if not _finite_number(c.get("source_start_ms")) or c["source_start_ms"] < 0:
            raise ValueError(f"clips[{i}].source_start_ms 必須是非負數")
        if not _finite_number(c.get("duration_ms")) or c["duration_ms"] <= 0:
            raise ValueError(f"clips[{i}].duration_ms 必須是正數")
        if c["duration_ms"] > MAX_CLIP_DURATION_MS:
            raise ValueError(f"clips[{i}].duration_ms 過長（{c['duration_ms']} > {MAX_CLIP_DURATION_MS}）")
        total_duration_ms += c["duration_ms"]

    formats = payload.get("formats")
    if not isinstance(formats, list) or not formats:
        raise ValueError("formats 必須是非空 list")
    for fmt in formats:
        if fmt not in config.FORMATS:
            raise ValueError(f"未知格式 {fmt}（合法：{list(config.FORMATS)}）")

    audio = payload.get("audio")
    if audio is not None:
        if (not isinstance(audio, dict) or not isinstance(audio.get("source_url"), str)
                or not audio["source_url"].startswith("https://")):
            raise ValueError("audio.source_url 必須是 https:// URL")
        if not _finite_number(audio.get("source_start_ms")) or audio["source_start_ms"] < 0:
            raise ValueError("audio.source_start_ms 必須是非負數")
        if not _finite_number(audio.get("duration_ms")) or audio["duration_ms"] <= 0:
            raise ValueError("audio.duration_ms 必須是正數")
        if abs(audio["duration_ms"] - total_duration_ms) > AUDIO_DURATION_TOLERANCE_MS:
            raise ValueError(
                f"audio.duration_ms（{audio['duration_ms']}）與 clips 總長度"
                f"（{total_duration_ms}）不符（容許誤差 {AUDIO_DURATION_TOLERANCE_MS}ms）"
            )

    captions = payload.get("captions")
    if captions is not None:
        if not isinstance(captions, list):
            raise ValueError("captions 必須是 list")
        if len(captions) > MAX_FOOTAGE_CAPTIONS:
            raise ValueError(f"captions 過多（{len(captions)} > {MAX_FOOTAGE_CAPTIONS}）")
        for i, cue in enumerate(captions):
            if not isinstance(cue, dict):
                raise ValueError(f"captions[{i}] 必須是物件")
            if (not _finite_number(cue.get("start_ms")) or not _finite_number(cue.get("end_ms"))
                    or cue["end_ms"] <= cue["start_ms"]):
                raise ValueError(f"captions[{i}] 必須有遞增的 start_ms/end_ms")
            if not isinstance(cue.get("text"), str) or not cue["text"].strip():
                raise ValueError(f"captions[{i}].text 必須是非空字串")

    return clips, formats, out_name, audio, captions


def _do_render_footage(clips, formats, out_name, audio=None, captions=None) -> dict:
    """重活：序列化 materialize+trim+concat+mux+caption+R2 上傳。回 {outputs,out_dir,storage}。
    與 _do_render 共用同一把 _render_lock（全域序列化，防並行撞 TEMP_DIR）。"""
    with _render_lock:
        try:
            materialized_clips = []
            for i, c in enumerate(clips):
                path = _materialize_asset(c["source_url"], i)
                materialized_clips.append({**c, "source_url": path})
            materialized_audio = None
            if audio:
                apath = _materialize_asset(audio["source_url"], len(clips))
                materialized_audio = {**audio, "source_url": apath}
            outputs, out_dir = pipeline.render_footage_multiformat(
                materialized_clips, formats, out_name,
                audio=materialized_audio, captions=captions,
            )
            output_meta = _build_output_meta(outputs)
            if _r2_video_configured():
                base_key = "video/" + os.path.basename(str(out_dir))
                urls = {}
                for fmt, path in outputs.items():
                    with open(path, "rb") as fh:
                        urls[fmt] = _r2_put(
                            f"{base_key}/{fmt}.mp4", fh.read(), "video/mp4",
                            R2_VIDEO_BUCKET, R2_VIDEO_PUBLIC_BASE,
                        )
                return {"outputs": urls, "out_dir": str(out_dir), "storage": "r2", "output_meta": output_meta}
            return {
                "outputs": {k: str(v) for k, v in outputs.items()},
                "out_dir": str(out_dir),
                "storage": "local",
                "output_meta": output_meta,
            }
        finally:
            pipeline.cleanup()


def _run_footage_job(job_id: str, clips, formats, out_name, audio=None, captions=None):
    try:
        result = _do_render_footage(clips, formats, out_name, audio=audio, captions=captions)
        with _jobs_lock:
            _JOBS[job_id] = {"status": "done", **result, "ts": time.time()}
    except Exception as e:  # noqa: BLE001
        with _jobs_lock:
            _JOBS[job_id] = {"status": "error", "error": str(e), "ts": time.time()}


def submit_render_footage(payload: dict) -> str:
    """驗證後建 job + 起背景 thread，立即回 jobId（不阻塞）。輪詢沿用既有 GET /job。"""
    clips, formats, out_name, audio, captions = _validate_footage(payload)
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _prune_jobs()
        _JOBS[job_id] = {"status": "running", "ts": time.time()}
    threading.Thread(
        target=_run_footage_job,
        args=(job_id, clips, formats, out_name, audio, captions),
        daemon=True,
    ).start()
    return job_id


# ── /reburn-captions：改完字幕後，在無字幕底片上重燒（V4.8）──────────────────────

MAX_REBURN_CUES = int(os.getenv("RENDER_MAX_REBURN_CUES", "400"))


def _validate_reburn(payload: dict):
    """回 (clean_url, cues, fmt, object_key)。底片只收自家 videoclean/、輸出只寫自家 video/<dir>/<fmt>.mp4
    （服務握有 R2 寫入權，呼叫端不能指定任意 key 或任意來源）。"""
    if not _r2_video_configured():
        raise ValueError("R2 未設定，無法重燒")
    fmt = payload.get("format")
    if fmt not in config.FORMATS:
        raise ValueError(f"未知格式 {fmt}（合法：{list(config.FORMATS)}）")
    clean_url = payload.get("clean_url")
    if not isinstance(clean_url, str) or not clean_url.startswith(f"{R2_VIDEO_PUBLIC_BASE}/videoclean/"):
        raise ValueError("clean_url 必須是本服務的 videoclean/ 底片")
    object_key = payload.get("object_key")
    if not isinstance(object_key, str) or not re.fullmatch(rf"video/[\w一-鿿]{{1,40}}/{re.escape(fmt)}\.mp4", object_key):
        raise ValueError("object_key 必須是 video/<dir>/<format>.mp4")
    cues = payload.get("cues")
    if not isinstance(cues, list) or not cues or len(cues) > MAX_REBURN_CUES:
        raise ValueError(f"cues 必須是 1–{MAX_REBURN_CUES} 句")
    for i, c in enumerate(cues):
        if not isinstance(c, dict) or not _finite_number(c.get("startMs")) or not _finite_number(c.get("endMs")) or c["endMs"] <= c["startMs"] or c["startMs"] < 0:
            raise ValueError(f"cues[{i}] 必須有遞增的非負 startMs/endMs")
        if not isinstance(c.get("text"), str) or not c["text"].strip() or len(c["text"]) > 500:
            raise ValueError(f"cues[{i}].text 必須是 1–500 字的字串")
    cues = sorted(({"startMs": int(c["startMs"]), "endMs": int(c["endMs"]), "text": c["text"].strip()} for c in cues), key=lambda c: c["startMs"])
    if any(a["endMs"] > b["startMs"] for a, b in zip(cues, cues[1:])):
        raise ValueError("cues 時間不可重疊")
    return clean_url, cues, fmt, object_key


def _do_reburn(clean_url: str, cues: list, fmt: str, object_key: str) -> dict:
    with _render_lock:
        try:
            clean = _materialize_asset(clean_url, 0)
            out_path = str(config.TEMP_DIR / f"reburn_{fmt}.mp4")
            pipeline.burn_script_captions(clean, cues, out_path, config.FORMATS[fmt][1])
            output_meta = _build_output_meta({fmt: out_path})
            with open(out_path, "rb") as fh:
                url = _r2_put(object_key, fh.read(), "video/mp4", R2_VIDEO_BUCKET, R2_VIDEO_PUBLIC_BASE)
            return {"outputs": {fmt: url}, "out_dir": os.path.dirname(object_key), "storage": "r2", "output_meta": output_meta,
                    "caption_source": "script_tts", "caption_cues": cues,
                    "caption_srt": caption_utils.to_srt(cues), "caption_vtt": caption_utils.to_vtt(cues)}
        finally:
            pipeline.cleanup()


def _run_reburn_job(job_id: str, clean_url, cues, fmt, object_key):
    try:
        result = _do_reburn(clean_url, cues, fmt, object_key)
        with _jobs_lock:
            _JOBS[job_id] = {"status": "done", **result, "ts": time.time()}
    except Exception as e:  # noqa: BLE001
        with _jobs_lock:
            _JOBS[job_id] = {"status": "error", "error": str(e), "ts": time.time()}


def submit_reburn(payload: dict) -> str:
    """驗證後建 job + 起背景 thread；輪詢沿用 GET /job（結果形狀同 /render：outputs/output_meta/caption_*）。"""
    clean_url, cues, fmt, object_key = _validate_reburn(payload)
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _prune_jobs()
        _JOBS[job_id] = {"status": "running", "ts": time.time()}
    threading.Thread(target=_run_reburn_job, args=(job_id, clean_url, cues, fmt, object_key), daemon=True).start()
    return job_id


# ── /generate-job：全自動管道（Claude 腳本 → Pexels B-roll → render）──────────────

def _claude_generate_script(topic: str, language: str, scene_count: int) -> tuple:
    """Call Claude Haiku to generate video script. Returns (scenes_list, title)."""
    if not CLAUDE_API_KEY:
        raise RuntimeError("CLAUDE_API_KEY not configured — set in .env.video")
    prompt = (
        f"你是專業影片腳本作家。根據主題「{topic}」，生成一個 {language} 旁白的 {scene_count} 場景影片腳本。\n"
        f"嚴格以 JSON 格式回傳，不要加任何說明文字：\n"
        f'{{"title":"影片標題（{language}）","scenes":['
        f'{{"id":1,"narration":"{language} 旁白 15-30 字，口語短句","broll_keyword":"english 1-3 words for Pexels"}},...]}}'
    )
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": VIDEO_SCRIPT_MODEL,
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
            # Haiku 5.x thinks by default and the thinking eats this small budget; it accepts "disabled" (always-think models 400 on it).
            **({"thinking": {"type": "disabled"}} if VIDEO_SCRIPT_MODEL.startswith("claude-haiku-5") else {}),
        },
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"Claude API {r.status_code}: {r.text[:300]}")
    # By block type: 5-generation models may open with a thinking block, so content[0] is not always the text.
    text = next((b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text"), "")
    # Strip markdown fence
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # Extract JSON object
    m2 = re.search(r"\{[\s\S]*\}", text)
    if m2:
        text = m2.group(0)
    data = json.loads(text)
    scenes = data.get("scenes", [])
    title = data.get("title", topic)
    if not scenes:
        raise RuntimeError("Claude returned empty scenes")
    return scenes, title


def _pexels_fetch_photo(keyword: str) -> str | None:
    """Search Pexels for a landscape photo, return direct image URL or None."""
    if not PEXELS_API_KEY:
        return None
    r = requests.get(
        "https://api.pexels.com/v1/search",
        headers={"Authorization": PEXELS_API_KEY},
        params={"query": keyword, "per_page": 3, "orientation": "landscape"},
        timeout=15,
    )
    if not r.ok:
        return None
    photos = r.json().get("photos", [])
    if not photos:
        return None
    return photos[0]["src"]["large2x"]


def _run_generate_job(job_id: str, topic: str, language: str, scene_count: int,
                      tts_voice: str, intro_title: str, intro_duration: float):
    """Full pipeline background thread: Claude → Pexels → render → R2."""
    try:
        # 1) Generate script with Claude
        scenes_data, title = _claude_generate_script(topic, language, scene_count)

        # 2) Fetch Pexels image for each scene
        assets = []
        scenes = []
        for i, s in enumerate(scenes_data[:scene_count]):
            keyword = str(s.get("broll_keyword", "") or topic).strip() or topic
            img_url = _pexels_fetch_photo(keyword) or _pexels_fetch_photo(topic)
            if not img_url:
                raise RuntimeError(f"Pexels 無法為場景 {i+1} 找到圖片（keyword: {keyword}）— 請確認 PEXELS_API_KEY")
            assets.append(img_url)
            scenes.append({
                "id": s.get("id", i + 1),
                "narration": str(s.get("narration", "")).strip(),
                "duration": 5,
            })

        # 3) Render + R2 upload
        result = _do_render(
            scenes, assets, title,
            tts_provider="edge", tts_voice=tts_voice,
            intro_title=intro_title, intro_duration=intro_duration,
        )
        with _jobs_lock:
            _JOBS[job_id] = {"status": "done", "title": title, **result, "ts": time.time()}
    except Exception as e:  # noqa: BLE001
        with _jobs_lock:
            _JOBS[job_id] = {"status": "error", "error": str(e), "ts": time.time()}


class _Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "ok": True,
                "capabilities": {
                    "format_assets": True,
                    "native_multiformat": True,
                    "output_dimensions": True,
                    "openai_tts": bool(config.OPENAI_API_KEY),
                    "footage_render": True,
                    "caption_reburn": True,
                },
                "formats": list(config.FORMATS.keys()),
            })  # healthcheck 免認證
            return
        if self.path.split("?")[0] == "/job":
            if not _authed(self):
                self._json(401, {"error": "unauthorized"})
                return
            jid = parse_qs(urlparse(self.path).query).get("jobId", [None])[0]
            job = get_job(jid) if jid else None
            if not job:
                self._json(404, {"error": "job_not_found"})
                return
            self._json(200, {"jobId": jid, **{k: v for k, v in job.items() if k != "ts"}})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/render", "/generate-job", "/render-footage", "/reburn-captions"):
            self._json(404, {"error": "not found"})
            return
        if not _authed(self):
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY_BYTES:
                self._json(413, {"error": f"body 過大（{length} > {MAX_BODY_BYTES}）"})
                return
            payload = json.loads(self.rfile.read(length) or b"{}")

            if path == "/generate-job":
                topic = str(payload.get("topic", "")).strip()
                if not topic:
                    self._json(400, {"error": "topic 為必填"})
                    return
                if not CLAUDE_API_KEY:
                    self._json(503, {"error": "CLAUDE_API_KEY not configured in video-service env"})
                    return
                if not PEXELS_API_KEY:
                    self._json(503, {"error": "PEXELS_API_KEY not configured in video-service env"})
                    return
                language = str(payload.get("language", "繁體中文"))
                scene_count = max(1, min(int(payload.get("scene_count", 6)), MAX_SCENES))
                tts_voice = str(payload.get("tts_voice", "") or config.TTS_VOICE)
                intro_title = str(payload.get("intro_title", "") or "")
                try:
                    intro_duration = float(payload.get("intro_duration", 3.0))
                except (ValueError, TypeError):
                    intro_duration = 3.0
                import math
                intro_duration = min(max(intro_duration if math.isfinite(intro_duration) else 3.0, 1.0), 10.0)
                job_id = uuid.uuid4().hex
                with _jobs_lock:
                    _prune_jobs()
                    _JOBS[job_id] = {"status": "running", "ts": time.time()}
                threading.Thread(
                    target=_run_generate_job,
                    args=(job_id, topic, language, scene_count, tts_voice, intro_title, intro_duration),
                    daemon=True,
                ).start()
                self._json(202, {"jobId": job_id})
            elif path == "/render-footage":
                job_id = submit_render_footage(payload)
                self._json(202, {"jobId": job_id})
            elif path == "/reburn-captions":
                self._json(202, {"jobId": submit_reburn(payload)})
            else:
                # /render — existing behaviour
                job_id = submit_render(payload)
                self._json(202, {"jobId": job_id})

        except (ValueError, TypeError) as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — 回 500，不洩堆疊
            self._json(500, {"error": str(e)})

    def log_message(self, *args):  # 安靜
        pass


def main():
    global AUTH_REQUIRED
    AUTH_REQUIRED = authentication_required(
        render_auth_token=RENDER_AUTH_TOKEN,
        host=HOST,
        allow_insecure_local_render=ALLOW_INSECURE_LOCAL_RENDER,
    )
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer((HOST, PORT), _Handler)
    generate_ready = "✓" if (CLAUDE_API_KEY and PEXELS_API_KEY) else "✗ (missing CLAUDE_API_KEY/PEXELS_API_KEY)"
    print(f"video-service on http://{HOST}:{PORT} "
          f"storage={'r2' if _r2_video_configured() else 'local'} "
          f"/generate-job={generate_ready} auth={'required' if AUTH_REQUIRED else 'local-development'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
