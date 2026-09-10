# Video Whisper Worker

Independent RTX-only process for Video LEGO. It does not import, start, proxy,
or expose `meeting-service`.

Run on the RTX laptop only:

```powershell
python -m pip install -r requirements.txt
$env:VIDEO_WHISPER_WORKER_TOKEN = '<vault-provided-token>'
python -m uvicorn app:app --host 127.0.0.1 --port 8421
```

Cloudflare Tunnel may expose only `/v1/jobs` and `/health` from this process.
The worker accepts HTTPS source/callback URLs, verifies the source SHA-256, and
returns results only to the per-job callback secret supplied by next-admin.

Recovery: `start-worker.ps1` reads only `VIDEO_WHISPER_WORKER_TOKEN` and `VIDEO_WHISPER_TUNNEL_TOKEN` from the user-owned staging secret file. `runtime/` is local-only. Run `start-worker.ps1` or the Desktop launcher `啟動影片字幕服務.cmd` only when subtitles are needed; stop the two dedicated processes after use.
