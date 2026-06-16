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
import socket
import ipaddress
import threading
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

import config
import pipeline

PORT = int(os.getenv("VIDEO_SERVICE_PORT", "8732"))
MAX_ASSET_BYTES = int(os.getenv("RENDER_MAX_ASSET_MB", "200")) * 1024 * 1024
_render_lock = threading.Lock()


def _is_safe_https_url(url: str) -> bool:
    """https-only + 解析後擋私有/迴圈/link-local/保留位址（基本 SSRF 防護）。"""
    try:
        u = urlparse(url)
        if u.scheme != "https" or not u.hostname:
            return False
        for *_, sockaddr in socket.getaddrinfo(u.hostname, 443):
            ip = ipaddress.ip_address(sockaddr[0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
                return False
        return True
    except Exception:
        return False


def _materialize_asset(asset: str, idx: int) -> str:
    """本機路徑 → 直接用；https URL → 過 guard 後下載（大小上限）。"""
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
    with requests.get(asset, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in r.iter_content(65536):
                total += len(chunk)
                if total > MAX_ASSET_BYTES:
                    raise ValueError(f"asset[{idx}] 超過大小上限 {MAX_ASSET_BYTES} bytes")
                f.write(chunk)
    return dst


def render_request(payload: dict) -> dict:
    scenes = payload.get("scenes")
    assets = payload.get("assets")
    out_name = payload.get("out_name", "video")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("scenes 必須是非空 list")
    if not isinstance(assets, list) or len(assets) != len(scenes):
        raise ValueError("assets 必須與 scenes 等長")
    visual_files = [_materialize_asset(a, i) for i, a in enumerate(assets)]
    with _render_lock:  # 序列化：CPU-bound + 共用 TEMP_DIR
        try:
            outputs, _base, out_dir = pipeline.render_video(scenes, visual_files, out_name)
            # outputs 落在 out_dir（持久）；_base 在 TEMP_DIR 會被 cleanup 清掉，不回傳
            return {"outputs": {k: str(v) for k, v in outputs.items()}, "out_dir": str(out_dir)}
        finally:
            pipeline.cleanup()


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
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/render":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._json(200, render_request(payload))
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — 回 500，不洩堆疊
            self._json(500, {"error": str(e)})

    def log_message(self, *args):  # 安靜
        pass


def main():
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), _Handler)
    print(f"video-service render server on http://127.0.0.1:{PORT} (POST /render, GET /health)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
