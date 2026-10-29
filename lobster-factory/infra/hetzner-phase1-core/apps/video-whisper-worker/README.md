# Video Whisper Worker

Independent faster-whisper process for Video LEGO captions. It does not import, start, proxy,
or expose `meeting-service`.

Production: ks-aw-01, `docker-compose.whisper.yml` (CPU int8, large-v3, one job at a time, lobster-net only).
Install, env and rollback: `agency-os/docs/video_generator/VIDEO_WHISPER_WORKER_DEPLOYMENT.md`.

- `VIDEO_WHISPER_DEVICE` auto|cuda|cpu (auto = CUDA probe, else CPU), `VIDEO_WHISPER_CPU_THREADS` (default 8).
- `VIDEO_WHISPER_CALLBACK_BASE` set = callbacks must start with it (host: `http://next-admin:3000`); unset = public https only.
- Chinese audio gets a Traditional-Chinese prompt; without it Whisper writes Simplified.
- Dependencies install from `requirements.lock` (hashes); `av` is pinned because av 19 breaks faster-whisper 1.2.1.

Laptop fallback (RTX, until the host is live): `start-worker.ps1` reads `VIDEO_WHISPER_WORKER_TOKEN` and
`VIDEO_WHISPER_TUNNEL_TOKEN` from the user-owned staging secret file and starts the worker + Cloudflare Tunnel.
