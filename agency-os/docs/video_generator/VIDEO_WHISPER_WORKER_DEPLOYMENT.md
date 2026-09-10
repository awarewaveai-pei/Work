# Dedicated Video Whisper Worker — deployment contract

Scope: `apps/video-whisper-worker` on RTX laptop only. Never reuse or alter `meeting-service`.

## Required vault values

- `VIDEO_WHISPER_WORKER_TOKEN`: random 32+ byte token, shared only by next-admin and worker.
- `MEDIA_TRANSCRIBE_WORKER_URL`: HTTPS Cloudflare Tunnel URL ending without `/`.
- `MEDIA_TRANSCRIBE_CALLBACK_BASE_URL=https://app.aware-wave.com`.
- `MEDIA_TRANSCRIBE_WORKER_TOKEN`: same worker token in ks-aw-01 next-admin environment.

## Laptop process

```powershell
Set-Location D:\Work\_video_release_guard2\lobster-factory\infra\hetzner-phase1-core\apps\video-whisper-worker
python -m pip install -r requirements.txt
$env:VIDEO_WHISPER_WORKER_TOKEN = '<vault-value>'
python -m uvicorn app:app --host 127.0.0.1 --port 8421
```

Expected: `GET http://127.0.0.1:8421/health` returns `{"ok":true,"service":"video-whisper-worker"}`.

## Network boundary

Cloudflare Tunnel exposes the worker HTTPS hostname. The worker only accepts bearer-authenticated `POST /v1/jobs`, accepts public HTTPS R2 sources, validates SHA-256 before Whisper, and calls the fixed app callback with a per-job secret. It has no meeting endpoints, public docs, browser UI, database credential, or general inbound proxy.

## Release order

1. Backup and apply `packages/db/migrations/0069_media_transcription_jobs.sql`.
2. Deploy next-admin with callback base and worker URL/token still empty: dispatch remains fail-closed (`503`).
3. Start laptop worker and Tunnel. Set the three vault-backed production variables. Redeploy next-admin.
4. Submit one checksummed tenant R2 asset. Verify job `completed`, JSON/SRT/VTT assets, caption QA row, then use caption track in an existing footage render.

Rollback: clear `MEDIA_TRANSCRIBE_*`, redeploy next-admin; submitted jobs remain auditable and no existing render or meeting path changes.
