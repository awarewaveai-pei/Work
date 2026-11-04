# codex-oracle review -- 2026-11-04 17:25:18 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/editor-color-grade.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/fabric-filters.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CARD-05 colour-grade union by an SDK worker: one 調色 panel on both editors; colour math SSOT moved to public/editor-shared/color-grade.js (ES module) imported by canvas via lib/studio/editor-color-grade.ts and by vector via script type=module; custom AwHsl/AwBlur filters on both Fabric 5 and 7; drift test; old panels/blocks removed
- exit: 0 | elapsed: 118439ms | answer: 2223B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/fabric-filters.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/editor-color-grade.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 舊版向量專案的調色效果會在第一次使用新面板時消失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js:299
  confidence  -> CONFIRMED
  scenario    -> 載入含 Brightness 濾鏡、但沒有 `adj` 的舊專案，再調整對比；`isGradeFilter` 將 Brightness 判為面板擁有的濾鏡，`cgApply` 移除它，原有亮度效果消失。
  why missed  -> 新測試把所有非 RemoveColor 濾鏡都視為新面板擁有，沒有覆蓋舊專案的濾鏡資料。

FINDING 2: 去背積木選用白色、距離 0.12 時，調色會悄悄取消去背
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js:300
  confidence  -> CONFIRMED
  scenario    -> 在去背積木選白色及距離 0.12，然後移動任一調色滑桿；該去背濾鏡被誤判為調色面板的「去白底」並移除，圖片背景重新出現。
  why missed  -> 兩個功能用濾鏡參數推斷擁有權；測試只檢查不同參數的去背濾鏡。

FINDING 3: 去背積木的「復原」會移除調色面板仍顯示啟用的去白底
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:1472
  confidence  -> CONFIRMED
  scenario    -> 勾選調色面板「去白底」，再按去背積木的「復原」；程式刪除圖片上所有 RemoveColor 濾鏡，但 `adj.removeWhite` 仍為 true，面板顯示已啟用而圖片不再去白底。
  why missed  -> 去背積木沿用刪除所有 RemoveColor 的舊邏輯，未處理新面板共用此濾鏡類別的情況。

FINDING 4: Canvas 自動調整可能寫到另一張圖片
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:1888
  confidence  -> CONFIRMED
  scenario    -> 對圖片 A 按「自動色彩」，在圖片解碼完成前選取圖片 B；`onload` 直接更新目前的 `adj`，後續濾鏡效果套到當前選取的 B，A 沒有得到所請求的調整。
  why missed  -> 向量編輯器的對應回呼檢查了選取物件是否仍相同，Canvas 的新共用流程沒有這項檢查。

TOTAL: 4 findings
