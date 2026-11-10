# codex-oracle review -- 2026-11-10 10:49:02 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/meshy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender-jobs.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/autorig.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/common.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/retarget.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/motions/index.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-autorig.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fixtures/mannequin.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-workspace.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-review-fixes.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card S4b: image->3D one operation over Stability/local SF3D/Replicate TRELLIS (Meshy kept, hidden), prices from TOOL_RATES, one paid vendor call per job id; Blender Rigify metarig autorig + CMU BVH library + retarget match_rest. In api.cjs only image-to-3d/blender-autorig/capabilities/cancel hunks are this change (EC.5 engine-render alpha hunks are another session's). Check hardest: one job id = at most one paid call; no paid call without price; local way never charged.
- exit: 0 | elapsed: 191065ms | answer: 1777B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender-jobs.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/common.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/retarget.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/meshy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-review-fixes.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p5-workspace.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/autorig.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/blender/motions/index.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fixtures/mannequin.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-autorig.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-image-to-3d.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The configured video workbench service cannot enable either Stability method.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:690`
  confidence  -> CONFIRMED
  scenario    -> Deploy with a `STABILITY_API_KEY` available for Compose interpolation. The `video-workbench` environment lists other provider keys but does not pass this one, so both Stability methods report “金鑰未設定” and reject jobs.
  why missed  -> The new methods and isolated tests supply the key directly; the service environment sits outside the diff.

FINDING 2: Meshy is offered when configured but every connected job fails the price gate.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs:64`
  confidence  -> CONFIRMED
  scenario    -> Set `MESHY_API_KEY` on a workbench connected to the main system. Capabilities marks Meshy available, but submitting it passes `"meshy"` to `priceOf`; there is no `TOOL_RATES.meshy`, so the request fails before a job starts.
  why missed  -> Meshy tests use an isolated server without the main system’s price gate.

FINDING 3: A new TRELLIS job can reuse a prediction that cancellation is still stopping.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1232`
  confidence  -> CONFIRMED
  scenario    -> Cancel a running TRELLIS job and immediately submit the same image and method. Cancellation is started without awaiting its Replicate request; the new job can find the old task while it still reports `processing`, attach to it, and then fail when that prediction becomes `canceled`.
  why missed  -> The test waits for the fake prediction to become canceled before submitting the next job.

TOTAL: 3 findings
