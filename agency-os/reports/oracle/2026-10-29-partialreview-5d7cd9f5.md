# codex-oracle review -- 2026-10-29 14:42:51 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/CaptionsStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/transcription-complete/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/status/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/options/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/transcription.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/app.py, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/Dockerfile, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/docker-compose.whisper.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/requirements.txt, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/dispatch/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/transcription.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Video captions: two transcription engines. host = self-hosted faster-whisper worker (apps/video-whisper-worker, now CPU-capable, serial, internal callback allowlist, Docker+compose on lobster-net); openai = whisper-1 with automatic fallback to host on failure; client_config.audioExternalAiAllowed=false must block OpenAI server-side; CaptionsStep shows both buttons with time/price; status lookup by sourceAssetId resumes jobs. Report only real bugs with file:line.
- exit: 0 | elapsed: 191123ms | answer: 1867B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/CaptionsStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/transcription-complete/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/status/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/app.py, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/requirements.txt, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/dispatch/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/options/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/transcription.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/transcription.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/docker-compose.whisper.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An OpenAI job can remain dispatched forever after a Next server restart.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/transcription/dispatch/route.ts:58
  confidence  -> CONFIRMED
  scenario    -> OpenAI transcription is running when next-admin restarts. The detached promise ends with the process; the database row remains `dispatched`, and reopening the page resumes polling a job that will never finish.
  why missed  -> The browser close path was considered, but the server process lifetime was not.

FINDING 2: The OpenAI path can attach captions to bytes that do not match the source asset checksum.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/transcription.ts:97
  confidence  -> CONFIRMED
  scenario    -> An R2 object is replaced after its checksum is recorded. OpenAI transcribes the new bytes without checking them against `source_checksum_sha256`; the resulting captions are imported under the original asset identity. The host worker performs that checksum check.
  why missed  -> The checksum requirement was enforced at dispatch, but the OpenAI download path was treated differently from the worker download path.

FINDING 3: Resuming a completed job locks the user onto the first project asset.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/CaptionsStep.tsx:260
  confidence  -> CONFIRMED
  scenario    -> A project has multiple videos and its first listed video has a completed transcription. On reopening, the page selects that video, resumes its completed status, then disables the asset selector. The user cannot select another video for transcription in that visit.
  why missed  -> Resume was added without revisiting the selector’s existing `status !== "idle"` rule.

TOTAL: 3 findings
