# codex-oracle review -- 2026-11-29 00:22:50 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Not a fix. Feature: a video run may carry more than one reference picture, limited per model by the vendor's own limit (Veo 3.1 = 3 as reference_images, 8 s only, sent instead of the first frame; Gemini Omni = 6 with task reference_to_video; Runway, Veo 3.1 Fast, Luma = 1). One check (generation-policy checkVideoImages) is used by validate and by the run; the page reads each model's maxImages from /capabilities.
- exit: 0 | elapsed: 171494ms | answer: 1101B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/video-motion-models.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 多圖任務會默默漏送沒有 `url` 的參考圖
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:419
  confidence  -> CONFIRMED
  scenario    -> Veo 3.1 的三張參考圖中，一張物件的 `url` 為空字串；`validate` 以三張通過上限檢查，但執行時 `flatten` 排除該張，只把兩張送給供應商。
  why missed  -> 新測試只使用每張都有有效 `url` 的圖片；驗證與執行所計算的圖片集合不同。

FINDING 2: 「首幀參考」任務加入第二張圖片後會失去首幀控制
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1014
  confidence  -> CONFIRMED
  scenario    -> API 提交 `referenceMode: "first"`、一張 `firstFrame` 和一張 `images`，選 Veo 3.1、8 秒；驗證確認首幀存在後放行，但執行時兩張都進入 `referenceImageUrls`，模型收到 `reference_images` 而沒有首幀 `image`。
  why missed  -> 新測試只涵蓋一般圖片參考，沒有涵蓋既有的 `firstFrame` 語意。

TOTAL: 2 findings