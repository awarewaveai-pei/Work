# codex-oracle review -- 2026-11-06 08:23:54 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-pro-dock/dock.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `8698fef26..HEAD`
- context: C3.1+C4.1+C7.1: shared Craft editor page frame (window.__proEditor = {editor, frame, handoff}) and shared dock shell extracted from vector-pro (sizes only in each editor's SIZES, written by mountDock as --vp-* on .vp-root; dock.css only var()). Vector-pro behaviour must stay the same. Theme link removed on purpose.
- exit: 0 | elapsed: 164461ms | answer: 694B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-pro-dock/dock.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 編輯器啟動超過 30 秒時，交接的設計會被清除且不再重試
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js:188
  confidence  -> CONFIRMED
  scenario    -> VectorCraft 的入口檔回應正常，但編輯器超過 30 秒才完成載入。頁框先取走交接資料（`ProEditorFrame.tsx:69`；`canvas-handoff.ts:209` 清除儲存鍵）；`ctx-vectorcraft.js:68` 的 30 秒逾時使 `ctx.ready()` 失敗。編輯器稍後可用時，設計仍未開啟，重新整理也取不回。
  why missed  -> 交接流程只檢查入口檔是否可讀；實際啟動逾時設定在 dock adapter 中。

TOTAL: 1 findings
