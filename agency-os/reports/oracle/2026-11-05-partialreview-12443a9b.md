# codex-oracle review -- 2026-11-05 23:29:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/video-motion-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/video-motion-models.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/awarewave-files.txt, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-director.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-product.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-conversation.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card RV: video-workbench video jobs pick sora-2 (OpenAI) or next-admin's Replicate models (Runway/Veo/Luma) per job; model list moved to import-free next-admin lib/ai/video-motion-models.ts that the workbench requires via Node type stripping; cost = VIDEO_MOTION_RATES x seconds; old projects with sora-2 must send the identical OpenAI request. Note api.cjs also has an unrelated hunk (localFile /examples/) from another session -- ignore it.
- exit: 0 | elapsed: 246318ms | answer: 1645B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/video-motion-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/awarewave-files.txt, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-conversation.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-director.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-product.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/video-motion-models.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 還原 Replicate 任務時遺失原模型選擇  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-results.js:29  
  confidence  -> CONFIRMED  
  scenario    -> 使用者還原一筆 Veo 任務；此處還原時長等設定，卻未將 `input.settings.model` 寫回 `state.model[mode]`。若目前模型是 sora-2，再送出會改用 OpenAI，且時長可能被改成 Sora 支援值。  
  why missed  -> 新增測試涵蓋直接送出與伺服器重試，未涵蓋既有的「從歷史任務還原」入口。

FINDING 2: 取消中的任務可被同時進行的輪詢改回執行中或成功  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:661  
  confidence  -> CONFIRMED  
  scenario    -> Replicate 狀態查詢尚未回應時，使用者取消任務；取消路徑先設為 `cancelled`，隨後查詢回應仍無條件覆寫 `job.status`。若回應為 `succeeded`，還會下載成品並將任務記為成功。  
  why missed  -> 測試依序輪詢、取消，沒有讓兩個請求交錯。

FINDING 3: Replicate 拒絕取消時，工作台仍回報已取消  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs:80  
  confidence  -> CONFIRMED  
  scenario    -> `/cancel` 回傳 429 或 500；`fetch` 正常回傳 Response，此函式不檢查 `ok`，而 API 已將任務設為 `cancelled`。使用者看到取消成功，供應商任務卻繼續執行及計費。  
  why missed  -> 測試只確認取消請求有送出，未模擬供應商拒絕。

TOTAL: 3 findings
