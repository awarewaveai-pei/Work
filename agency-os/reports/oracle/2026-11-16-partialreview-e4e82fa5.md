# codex-oracle review -- 2026-11-16 08:41:47 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/edge-mask.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-ai-panels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-edge-mask-drift.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: My Designs/Studio/canvas 'edge mask' brick cut too much off pictures: procedural brush inset 5-18%+extras -> 1.5-5%, displacement halved, radius 3%; asset brush PNGs cropped to their alpha bbox then shrunk by amount*0.08 (was 0.28). Tests updated: golden hash + crop assertion.
- exit: 0 | elapsed: 152787ms | answer: 622B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-ai-panels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-edge-mask-drift.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/edge-mask.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 更新後的測試仍無法偵測實際筆刷 PNG 的裁切結果變化
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-edge-mask-drift.test.ts:67
  confidence  -> CONFIRMED
  scenario    -> `mask-01.png` 的透明邊界或 alpha 內容改變時，golden hash 仍通過：資產筆刷的 `buildMaskSvg` 回傳空字串；新增裁切斷言只使用模擬像素檢查 `mask-03`。實際輸出的裁切範圍因此可能改變而測試全綠。
  why missed  -> golden 測試列舉了所有 style，但未讀取或合成任何筆刷 PNG。

TOTAL: 1 findings