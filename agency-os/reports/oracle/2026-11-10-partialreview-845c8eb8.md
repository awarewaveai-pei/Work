# codex-oracle review -- 2026-11-10 16:42:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/image-models.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Vendor switch: video default Gemini Omni 1.2 Flash (new backend/gemini-video.cjs, vendor dispatch in api.cjs/generation-policy.cjs); nano-banana-2 now runs Gemini Nano Banana 2.1 direct (image-gen.ts generateGemini); one Gemini usage->USD rule geminiMediaUsd in cost-model.ts. Real calls 2026-11-10 confirmed request/response shapes and usage fields.
- exit: 0 | elapsed: 198396ms | answer: 642B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/image-models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gemini 已計費但未回傳圖片時，系統記錄成本卻退還全部點數
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:667；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts:243
  confidence  -> CONFIRMED
  scenario    -> Google 回傳成功狀態及 usage，但沒有圖片內容；新路徑標記 `billed: true`，記錄了 `costUsd`，結算時卻因 `result.ok` 為 false 扣款 0，全部預扣點數退還。
  why missed  -> 新測試只涵蓋成功回傳圖片，沒有驗證已計費的失敗回覆如何結算。

TOTAL: 1 findings
