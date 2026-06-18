#!/usr/bin/env python3
"""server.py — video-service HTTP 介面（render-only 微服務）。

next-admin `video/pipeline` 積木負責：生腳本(Claude) + 生圖(Flux) + 抓 B-roll(Pexels)，
然後把 scenes + 視覺素材交給本服務合成。本服務刻意只做 render（見 pipeline.render_video）。

  POST /render   body JSON:
    { "scenes":  [{"id":1,"narration":"旁白...","duration":8}, ...],
      "assets":  ["/local/path.png" | "https://cdn/clip.mp4", ...],   # 與 scenes 等長
      "out_name": "影片名" }
    → 200 { "outputs": {fmt: path,...}, "out_dir": "..." }
    → 400 參數錯 / 不安全 URL；500 render 失敗

  GET /health → { "ok": true }

零新依賴（stdlib http.server）。綁 127.0.0.1（內網服務）。render 全域序列化
（CPU-bound + 共用 TEMP_DIR，並行無益且會撞檔）。assets 可為本機路徑（dev）或
https URL（prod，下載前過 SSRF guard：https-only + 擋私有/迴圈/link-local）。
"""
import os
import json
import hmac
import time
import uuid
import socket
import ipaddress
import threading
from urllib.parse import urlparse, quote, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

import config
import pipeline

HOST = os.getenv("VIDEO_SERVICE_HOST", "127.0.0.1")
PORT = int(os.getenv("VIDEO_SERVICE_PORT", "8732"))
MAX_ASSET_BYTES = int(os.getenv("RENDER_MAX_ASSET_MB", "200")) * 1024 * 1024
MAX_SCENES = int(os.getenv("RENDER_MAX_SCENES", "30"))
MAX_BODY_BYTES = int(os.getenv("RENDER_MAX_BODY_KB", "256")) * 1024  # JSON 很小（素材是 URL/路徑非內嵌）
# 認證：跨機部署時 /render 要 X-Render-Token == RENDER_AUTH_TOKEN。未設 = 本機/dev 放行。
RENDER_AUTH_TOKEN = os.getenv("RENDER_AUTH_TOKEN", "")
# R2 共用憑證（與 next-admin 共享同一組 API token + account）
R2_API_TOKEN = os.getenv("R2_API_TOKEN", "")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
# 影片輸出專用 bucket（隔離於圖片 bucket；後續可設 7 天 lifecycle）
R2_VIDEO_BUCKET = os.getenv("R2_VIDEO_BUCKET", "lobster-videos")
R2_VIDEO_PUBLIC_BASE = os.getenv("R2_VIDEO_PUBLIC_BASE", "").rstrip("/")
_render_lock = threading.Lock()


def _r2_video_configured() -> bool:
    return bool(R2_API_TOKEN and R2_ACCOUNT_ID and R2_VIDEO_BUCKET and R2_VIDEO_PUBLIC_BASE)


def _r2_put(object_key: str, data: bytes, content_type: str, bucket: str, public_base: str) -> str:
    """上傳一個物件到指定 R2 bucket（CF R2 API），回 public URL；失敗丟例外。"""
    key_path = quote(object_key, safe="/")
    url = (f"https://api.cloudflare.com/client/v4/accounts/{R2_ACCOUNT_ID}"
           f"/r2/buckets/{bucket}/objects/{key_path}")
    r = requests.put(url, headers={"Authorization": f"Bearer {R2_API_TOKEN}",
                                   "Content-Type": content_type}, data=data, timeout=120)
    if not r.ok:
        raise RuntimeError(f"r2_put_failed_{r.status_code}: {r.text[:200]}")
    return f"{public_base}/{object_key}"


def _authed(handler: "BaseHTTPRequestHandler") -> bool:
    """RENDER_AUTH_TOKEN 有設 → 比對 X-Render-Token（constant-time）；未設 → 放行（本機/dev）。"""
    if not RENDER_AUTH_TOKEN:
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
    scenes = payload.get("scenes")
    assets = payload.get("assets")
    out_name = payload.get("out_name", "video")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("scenes 必須是非空 list")
    if len(scenes) > MAX_SCENES:
        raise ValueError(f"scenes 過多（{len(scenes)} > {MAX_SCENES}）")
    if not isinstance(assets, list) or len(assets) != len(scenes):
        raise ValueError("assets 必須與 scenes 等長")
    return scenes, assets, out_name


def _do_render(scenes, assets, out_name) -> dict:
    """重活：序列化 materialize+render+R2 上傳。回 {outputs,out_dir,storage}。"""
    with _render_lock:  # 序列化：materialize(下載)+render 全程獨佔 TEMP_DIR（防並行撞檔）
        try:
            visual_files = [_materialize_asset(a, i) for i, a in enumerate(assets)]
            outputs, _base, out_dir = pipeline.render_video(scenes, visual_files, out_name)
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
                return {"outputs": urls, "out_dir": str(out_dir), "storage": "r2"}
            return {"outputs": {k: str(v) for k, v in outputs.items()}, "out_dir": str(out_dir), "storage": "local"}
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


def _run_job(job_id: str, scenes, assets, out_name):
    try:
        result = _do_render(scenes, assets, out_name)
        with _jobs_lock:
            _JOBS[job_id] = {"status": "done", **result, "ts": time.time()}
    except Exception as e:  # noqa: BLE001
        with _jobs_lock:
            _JOBS[job_id] = {"status": "error", "error": str(e), "ts": time.time()}


def submit_render(payload: dict) -> str:
    """驗證後建 job + 起背景 thread，立即回 jobId（不阻塞）。"""
    scenes, assets, out_name = _validate(payload)
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _prune_jobs()
        _JOBS[job_id] = {"status": "running", "ts": time.time()}
    threading.Thread(target=_run_job, args=(job_id, scenes, assets, out_name), daemon=True).start()
    return job_id


def get_job(job_id: str):
    with _jobs_lock:
        return _JOBS.get(job_id)


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
            self._json(200, {"ok": True})  # healthcheck 免認證
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
        if self.path != "/render":
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
            # async：驗證後即回 jobId（202），背景 thread 渲染；呼叫端短輪詢 GET /job
            job_id = submit_render(payload)
            self._json(202, {"jobId": job_id})
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — 回 500，不洩堆疊
            self._json(500, {"error": str(e)})

    def log_message(self, *args):  # 安靜
        pass


def main():
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    if HOST != "127.0.0.1" and not RENDER_AUTH_TOKEN:
        print("[WARN] 綁非 localhost 但未設 RENDER_AUTH_TOKEN — /render 將無認證對外暴露！")
    srv = ThreadingHTTPServer((HOST, PORT), _Handler)
    print(f"video-service render server on http://{HOST}:{PORT} (POST /render[auth], GET /health) "
          f"storage={'r2' if _r2_video_configured() else 'local'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
