# codex-oracle review -- 2026-11-15 11:58:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/jobs-view.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.4: a paid AI cover for a finished export. New job operation cover-ai (type image -> paid feature video.image via main-system paidFeature, row priced by image-edit.cjs like the region editor). Refused before permit/vendor unless settings.forJob names a succeeded editor-export/engine-render job with free covers. cover-ai.cjs takes the best free cover's frame WITHOUT title (framePng <=1280 px), a fully transparent mask (= edit everywhere, regionMasks gives each vendor's form), an English no-text instruction, then stillJpeg draws the title at the video's size <= 2 MB. The result is pushed as {kind:'ai', costUsd, model} onto the EXPORT job's result.covers and settle(export) registers it (VD.2 path); the cover-ai job's own result has ledger 'cover' so it is not registered twice, and it is charged once through settle like region jobs. jobs-view.js shows one 'AI 設計封面' button per available image-edit row with data-paid='video.image' + data-paid-model (NT$ from /capabilities via paid-price.js).
- exit: 0 | elapsed: 196236ms | answer: 1940B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/jobs-view.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A paid vendor run can fail during local cover finishing without being charged to the account.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs:35
  confidence  -> CONFIRMED
  scenario    -> The image vendor returns a billable result, then `stillJpeg` fails while drawing or encoding the title. The cover job becomes `failed` without `result` or `finishing`; settlement charges only succeeded jobs or failed jobs with `finishing` (`backend/api.cjs:191`). The provider bill has no matching usage record.
  why missed  -> The tests cover vendor failure and successful finishing, but not failure after the vendor returns.

FINDING 2: A new AI cover can remain unregistered when export settlement is already in flight.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:784
  confidence  -> CONFIRMED
  scenario    -> An export settlement has passed its cover loop and is still running when the AI cover is appended. `settle(target)` returns that existing run (`backend/api.cjs:131–135`), so the new cover is not visited. No registration error is set to trigger a retry; the JPEG appears in the job but never becomes a main-system cover asset.
  why missed  -> The API test settles the export before starting the AI job, so settlement never overlaps.

FINDING 3: Invalid cover requests can call ElevenLabs before the stated preflight refusal.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1031
  confidence  -> CONFIRMED
  scenario    -> With an ElevenLabs key configured and its account cache expired, a `cover-ai` request naming a nonexistent export calls the ElevenLabs subscription endpoint before `exportFor` rejects the job at line 1035.
  why missed  -> The preflight check was added below the existing account refresh, and the API test has no ElevenLabs key.

TOTAL: 3 findings
