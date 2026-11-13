# codex-oracle review -- 2026-11-13 21:56:25 +08:00

- mode: `review`
- scope: whole repo
- target: `9abf7b6dd..HEAD`
- context: Three video-workbench cards cherry-picked onto origin/main: music generation (Lyria 3.5 / Lyria 3 Clip / Eleven Music, priced from next-admin cost-model.ts), region image editor (model x resolution list, Gemini edits composited back inside boxes via mask), new breakout post animation tool (rendered post = first frame, image-to-video). Conflict resolutions in api.cjs, provider-cost.cjs, paid-price.js, workspaces.js, generation-policy.cjs, gate.cjs merge both sides. Focus: charging equals the shown price, refusal before any paid call, old drafts, no Chinese-origin models.
- exit: 0 | elapsed: 194483ms | answer: 1430B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/workbench-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/music.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-region.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-voice-music.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/workspaces.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/breakout-rules.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/paid-price.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/tools.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/generation-flows.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/music-generation.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/region-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/tools-workflows.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A cropped 1:1 breakout video is treated as 9:16 when the review link checks delivery eligibility.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/jobs-view.js:12
  confidence  -> CONFIRMED
  scenario    -> A user selects 1:1. The job stores `ratio: "9:16"` and `outputRatio: "1:1"` (tools-breakout.js:458–459), then crops the result to a square (backend/api.cjs:814–820). The review link checks the stored 9:16 ratio and enables delivery, although 1:1 is excluded by the delivery contract (backend/delivery-ratios.cjs:3–4).
  why missed  -> The crop was added in the video job, while delivery eligibility reads the original generation setting.

FINDING 2: The 1:1 floating-post preview is not the frame submitted for generation.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js:330
  confidence  -> CONFIRMED
  scenario    -> With a nonsquare source image, floating layout and 1:1 output, the preview draws its blurred background on a 720×720 canvas; submission redraws it on 720×1280 (tools-breakout.js:446), then crops the middle square. The background uses a different cover scale (tools-breakout.js:342), so the finished square starts with different pixels from the preview.
  why missed  -> The same drawing function is used for both paths, but its canvas height changes the background crop.

TOTAL: 2 findings
