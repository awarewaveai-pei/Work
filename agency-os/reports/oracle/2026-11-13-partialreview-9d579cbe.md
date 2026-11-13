# codex-oracle review -- 2026-11-13 22:35:23 +08:00

- mode: `review`
- scope: whole repo
- target: `6120a76da..5a8e400e7`
- context: Region image editor: (a) Replicate loop replaced by shared replicate-run.cjs runPrediction/deliveryUrl so abandoned runs are cancelled; (b) Nano Banana 2.1 (Gemini Interactions API, no mask, boxes composited back) added to the shared next-admin image catalog fill rows with 1K/2K/4K from cost-model.ts imageTokens; charge by reply usage. Focus: NT$ shown = charge per size; image_size sent matches the chosen size; other editors listing fill rows (PhotoCraft ai-fill.js) still only change the selection; refusal before any paid call.
- exit: 0 | elapsed: 167704ms | answer: 672B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-ai-panels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/image-models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/region-edit.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 服務重啟時，進行中的 Replicate 圖片編輯無法被取消
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs:95
  confidence  -> CONFIRMED
  scenario    -> Replicate 已建立預測、圖片編輯仍在輪詢時，video-workbench 重啟；新程式會將任務標為失敗，但因這條呼叫沒有把預測 ID 寫入 job，重啟後的取消邏輯無 ID 可用，供應商仍可能繼續執行並計費（api.cjs:194–199）。
  why missed  -> 取消測試只覆蓋程式仍在運作時的輪詢中止；共用 runner 提供 `onPrediction`，但這條新呼叫未使用它。

TOTAL: 1 findings
