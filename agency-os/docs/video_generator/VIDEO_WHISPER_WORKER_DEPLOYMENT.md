# Video Whisper Worker — deployment contract

`apps/video-whisper-worker`. Never reuse or alter `meeting-service`. Since 2026-10-29 it runs on ks-aw-01 (CPU int8,
large-v3, 1.13x realtime measured); the RTX laptop + Cloudflare Tunnel path is retired once the host is live.

## Engines (next-admin `lib/content/video/transcription.ts`)

- `host`: this worker, free. `openai`: whisper-1, US$0.006/min, ≤25MB, falls back to `host` on failure.
- A client with `client_config.audioExternalAiAllowed=false` is refused `openai` server-side (dispatch route 403).

## Host install (High: new service)

```bash
cd /root/lobster-phase1/apps/video-whisper-worker
docker compose -f docker-compose.whisper.yml --env-file .env.whisper up -d --build
docker inspect -f '{{.State.Health.Status}}' lobster-video-whisper   # healthy
```

- `.env.whisper`: `VIDEO_WHISPER_WORKER_TOKEN` (not committed).
- next-admin `.env`: `MEDIA_TRANSCRIBE_WORKER_URL=http://video-whisper-worker:8421`, `MEDIA_TRANSCRIBE_WORKER_TOKEN` (same token),
  `MEDIA_TRANSCRIBE_CALLBACK_BASE_URL=http://next-admin:3000`, `MEDIA_TRANSCRIBE_MODEL=large-v3`; then recreate next-admin.
- Verify: `docker exec lobster-next-admin wget -qO- http://video-whisper-worker:8421/health`; one real job from ⑦ completes.
- No host port. The worker accepts only callbacks starting with `VIDEO_WHISPER_CALLBACK_BASE` and one job at a time.

## Rollback

`docker compose -f docker-compose.whisper.yml down`; set `MEDIA_TRANSCRIBE_WORKER_URL` back to the tunnel URL (or empty =
host engine 503, OpenAI still works); recreate next-admin. Submitted jobs stay auditable in `media_transcription_jobs`.
