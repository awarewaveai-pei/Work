# codex-oracle review -- 2026-11-05 22:41:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/workspaces.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/workspaces.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: P6.13 round 2 (after fixing round-1 findings: release-text route now 503 when QA persistence is off and 502 when either QA report is not stored, so VW retries; captions cap 4000 matches the workbench's max intervals; fully transparent editor text excluded; NA upgrade of an unconfirmed upload row no longer compares urls since the row is found by org+checksum+origin). Same intent: workbench videos pass release QA from their own job record; uploads carry uploader's rightsConfirmed, upgrade-only; renders without words stay unreleasable.
- exit: 0 | elapsed: 261393ms | answer: 1369B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/workspaces.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/workspaces.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Pending release-text retries can be lost when job history is pruned
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:121
  confidence  -> CONFIRMED
  scenario    -> Release-text QA is unavailable while more than the default 2,000 later jobs finish. The older succeeded job with `releaseTextError` is omitted from the persisted job history; after a restart, its next-GET retry is impossible and its video remains without the required QA reports.
  why missed  -> The retry was added near `settle`, while the existing retention rule treats failed QA delivery like any other terminal job.

FINDING 2: A failed rights QA refresh is acknowledged as a successful rights upgrade
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts:178
  confidence  -> CONFIRMED
  scenario    -> An unconfirmed uploaded video is resent with rights confirmed, but persisting its new rights QA report fails. The route ignores that result and returns 200; the workbench caches the upload as confirmed and stops resending it, while release still sees the earlier failed rights report.
  why missed  -> The round-two failure handling was added to the release-text route, but this separate QA call in the asset-upgrade path still discards its result.

TOTAL: 2 findings
