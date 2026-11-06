# codex-oracle review -- 2026-11-06 13:17:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06b-photo-pro-ai-panels.spec.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/blocks/ai-fill.js, scripts/photocraft-pro/SMOKE-W3.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: PhotoCraft ctx replaceImage keeps the full image frame (transparent edges incl.) instead of PhotoCraft trimmed bounds; selectedImage/selectionMask use same frame; W3 quick-mask hint; e2e edge-mask bounds check now exact
- exit: 0 | elapsed: 123040ms | answer: 1163B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06b-photo-pro-ai-panels.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 首次替換已含透明邊的圖片時，完整圖片框會縮成不透明像素範圍
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js:248
  confidence  -> CONFIRMED
  scenario    -> 使用者置入一張四周透明的 PNG；`placeImage` 沒有記錄完整框，`frameOf` 因而回傳 PhotoCraft 修剪後的 `bounds`。`selectedImage` 依此裁圖，首次 `replaceImage` 也依此定位，透明邊的原始框消失。
  why missed  -> 新增測試從原圖 bounds 等於完整尺寸的狀態開始，只測到替換後記錄的框。

FINDING 2: 「換第二次」測試在新圖層已被刪除時仍會通過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts:195
  confidence  -> CONFIRMED
  scenario    -> mock 每次複製都回傳 id `99`；第二次替換的舊圖層也是 `99`。`layer.delete` 因此把 mock 中唯一的圖層刪掉，但測試只檢查指令參數，仍通過。
  why missed  -> mock 固定回傳同一 id，且測試沒有檢查第二次替換後的圖層清單。

TOTAL: 2 findings
