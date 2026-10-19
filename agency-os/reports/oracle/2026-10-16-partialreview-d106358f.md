# codex-oracle review -- 2026-10-16 18:50:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-persistence.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-persistence.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/transcribe.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.renderer-staging.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Restoring work the 2026-09-10 merge 91fdfe31a silently dropped (it took the older parent 82cf5cf3f; the lost side is dbe28f317). (1) video-service/server.py: the technical QA dropped from _build_output_meta is ported back from dbe28f317 (_probe_video full ffprobe, _signal_probe black/freeze/loudness, byteSize + checksumSha256, technical_qa + signal_qa via quality.py which survived; a failed QA raises so the job errors) plus R2_API_BASE_URL (default api.cloudflare.com; staging points it at its egress proxy). The footage render functions dropped at the same time are NOT restored: 46eeac2e9 re-implemented footage (render_footage_multiformat); both render paths call _build_output_meta. (2) next-admin qa-persistence.ts: invariant no evidence is not a pass -- every output format needs technical_qa and signal_qa with a known status, else nothing is recorded (it used to store passed). Prod has MEDIA_PRODUCTION_PERSISTENCE_ENABLED=true. (3) meeting-service 3 files and docker-compose.renderer-staging.yml restored whole from dbe28f317: no commit touched them after the merge. Tests: video-service 28 pass in the service image (3 render real 1s clips with ffmpeg); mutation removing the QA raise turns the silent-audio test red; next-admin tsc 0, new test 5 pass, mutation of the missing-evidence guard turns 4 red; meeting-service test_vtt 5 pass.
- exit: 0 | elapsed: 270312ms | answer: 2020B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/transcribe.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-persistence.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.renderer-staging.yml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-persistence.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Staging cannot start from its checked-in environment template because the new proxy requires three undefined variables.
  file:line   -> docker-compose.renderer-staging.yml:23 -> .env.renderer-staging.example:10
  confidence  -> CONFIRMED
  scenario    -> Copy the template and run the documented Compose command -> interpolation fails with `R2_S3_ENDPOINT is required`, so staging never starts.
  why missed  -> The compose change added required proxy credentials without updating the staging environment template.

FINDING 2: Signal QA records a pass when ffmpeg signal extraction exits unsuccessfully.
  file:line   -> server.py:228 -> quality.py:91
  confidence  -> CONFIRMED
  scenario    -> ffprobe reads valid container metadata, but ffmpeg signal decoding exits nonzero -> `ffmpegExitCode` is only stored as a measurement, no finding is added, and the output is delivered/persisted as `passed`.
  why missed  -> Tests cover successful probes and failed loudness, not a nonzero signal-probe exit.

FINDING 3: The staging R2 proxy rejects valid rendered outputs larger than 300 MiB without a matching renderer limit.
  file:line   -> server.js:47 -> server.py:306
  confidence  -> CONFIRMED
  scenario    -> A permitted footage clip up to 20 minutes (`pipeline.py:414`) produces a file over 300 MiB -> proxy returns 413, `_r2_put` raises, and the render job ends in error.
  why missed  -> The tests use one-second clips and never cross the proxy’s hidden upload limit.

FINDING 4: Concurrent meeting jobs can disable sleep protection for a job still running.
  file:line   -> pipeline.py:242 -> keep_awake.py:106
  confidence  -> CONFIRMED
  scenario    -> Two transcription threads overlap in WSL2; the first finishes and calls `allow_sleep()` -> the shared helper is terminated while the second job continues, allowing the machine to sleep and lose that job.
  why missed  -> The new worker reuses a process-global, non-reference-counted power guard; tests exercise only one job.

TOTAL: 4 findings
