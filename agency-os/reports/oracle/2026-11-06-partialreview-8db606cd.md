# codex-oracle review -- 2026-11-06 18:19:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/useCanvasReturn.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/blocks/my-designs.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/useCanvasReturn.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06c-photo-pro-return.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `22ed7b89a`
- context: C8.1 傳回原工具 (commit 22ed7b89a)：openInCanvas 一律開新分頁（點擊內同步 window.open）＋IndexedDB 一筆 handoff:<id>＋?h=，分頁被擋退回同分頁；BroadcastChannel canvas-return 回程（原分頁只收自己發的票、onReturn 回 true 才 ack）；dock 傳回鈕 2 秒沒 ack 存 My Designs（saveToMyDesigns 與面板共用）。不變量：按傳回後圖一定落地一處、不落到別格。簽名凍結不可改：openInCanvas(image, baseName, href, source?, ret?)、useCanvasReturn(tool, onReturn)。
- exit: 0 | elapsed: 147682ms | answer: 1760B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/useCanvasReturn.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/useCanvasReturn.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/blocks/my-designs.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06c-photo-pro-return.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: My Designs 的 20 MB 原檔上限會讓「傳回後圖一定落地」失效
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/blocks/my-designs.js:30
  confidence  -> CONFIRMED
  scenario    -> 原分頁已關閉，編輯後的 PSD 超過 20 MB → 收不到 ack，退路儲存直接回傳失敗；圖沒有傳回，也沒有存入 My Designs。
  why missed  -> 新流程沿用既有儲存函式，但其原檔上限與這次的落地保證相衝突。

FINDING 2: 正式工具沒有接上傳回票與接收器
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts:186
  confidence  -> CONFIRMED
  scenario    -> 使用者從 Tarot、Studio、Banner 或 Mockup 開啟編輯器 → 正式呼叫都未傳第五個 `ret` 參數，編輯器收不到票，因此不顯示「傳回」鈕；正式頁面也沒有掛載 `useCanvasReturn`。傳回功能只在測試自行建立的 sender 中可用。
  why missed  -> 端對端測試在 `06c-photo-pro-return.spec.ts:35-46` 注入了自製 sender，繞過正式工具的呼叫路徑。

FINDING 3: Banner 在非同步匯出後才嘗試開新分頁
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx:1312
  confidence  -> PLAUSIBLE
  scenario    -> Banner 含需較久載入的背景或商品圖，`exportToPng` 完成時點擊的暫時使用者啟用權已失效 → `window.open` 被瀏覽器擋下，`openInCanvas` 改走同分頁，原 Banner 頁面離開。
  why missed  -> `openInCanvas` 自身在第一次 `await` 前呼叫 `window.open`，但作者未沿呼叫鏈檢查 Banner 在呼叫它之前已有 `await`。

TOTAL: 3 findings
