# codex-oracle review -- 2026-11-15 12:10:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.10: subtitle files for a finished video. Workbench release-text.cjs adds subtitles = the spoken-line timeline only (editor text clips with a subtitleStyle; every cue of a burn or engine render) beside captions (all on-screen text, for caption QA); main-system releaseText sends it when non-empty. next-admin release-text route (optional subtitles field, same cue validation) turns it into SRT + VTT (caption-formats toSrt/toVtt) stored in R2 beside the video under its content-addressed name (<video key>.srt/.vtt), metadata.captionFiles {srt, vtt, cues}, written in the same single metadata update as title/script; overlapping lines 400, nothing stored. The release page links both files (YouTube Studio / Facebook take them by hand: the Postiz providers upload no captions). p6/fc3 test edits outside VD.10 (cover-ai charge cases) are VD.4's, reviewed separately.
- exit: 0 | elapsed: 81503ms | answer: 1380B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The orphan sweep deletes released subtitle files after 24 hours.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:90
  confidence  -> CONFIRMED
  scenario    -> A release stores `<video key>.srt` and `.vtt`, while `media_assets.object_key` remains `<video key>.mp4`. The scheduled sweep looks for an exact `object_key` match and deletes unmatched workbench objects older than 24 hours (`lib/content/video/workbench-sweep.ts:75-99`). The release page keeps links to files that are gone.
  why missed  -> The new files are recorded in metadata, but the existing sweep checks only `object_key`.

FINDING 2: Two sequential subtitle uploads can exceed the caller’s entire request timeout.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs:201
  confidence  -> CONFIRMED
  scenario    -> If each R2 upload takes 35 seconds, both can succeed within their individual 60-second limits (`release-text/route.ts:89-90`), but the workbench aborts the request at 60 seconds. It records a delivery error and retries, even though the server may finish storing the files and metadata.
  why missed  -> The upload timeout was considered per file; the caller’s 60-second limit covers both uploads plus database and QA work.

TOTAL: 2 findings
