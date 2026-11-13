# codex-oracle review -- 2026-11-13 22:25:40 +08:00

- mode: `review`
- scope: whole repo
- target: `da795e6ff..6120a76da`
- context: Region image editor now reads its models from next-admin's shared image catalog (modelsFor fill, 6 rows: FLUX 2 Klein, FLUX Kontext Fast, Ideogram 4.5 Edit low/high, FLUX Fill Pro, GPT-Image-2.6 edit) instead of its own 3-model list; per-vendor mask formats; only the boxes are pasted back; charging: OpenAI by usage, per-megapixel models by real size, others by list price. Focus: shown NT$ price equals charged amount, refusal before any paid call, old drafts/jobs that named removed models (gpt-image-2.5-flare, gemini-nano-banana-2.1), mask polarity per vendor, and the restored priceOf(image) path for ordinary image jobs.
- exit: 0 | elapsed: 245886ms | answer: 621B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/backend.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/region-edit.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Replicate 回傳 data URI 圖片時，已完成的編輯會被標成失敗。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs:98
  confidence  -> PLAUSIBLE
  scenario    -> Replicate prediction 成功，`output` 是 `data:image/...`；共享 Replicate 呼叫器明確接受這種回覆（`lib/studio/replicate-run.ts:89-91`），新路徑卻只接受 `replicate.delivery` 網址，於是工作失敗、使用者拿不到已生成的圖片。
  why missed  -> 測試只模擬 `replicate.delivery` 網址，沒有涵蓋 data URI 回覆。

TOTAL: 1 findings
