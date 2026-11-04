# codex-oracle review -- 2026-11-04 18:04:43 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/bg-remove.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/editor-bg-remove.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CARD-06 background-removal union + filter ownership invariant: every image filter derived from adj (adj.removeColor, adj.legacy for pre-existing filters), isGradeFilter guessing removed; shared public/editor-shared/bg-remove.js; AI remove-bg on both editors with role header and size shrink; 還原 clears only the colour key and AI result
- exit: 0 | elapsed: 203990ms | answer: 1754B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/editor-bg-remove.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/bg-remove.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 舊設計同時有 `adj` 與獨立去背濾鏡時，去背效果會消失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/color-grade.js:307
  confidence  -> CONFIRMED
  scenario    -> 舊版向量編輯器先調色，再用去背積木加入綠色色鍵；此時圖片有 `adj`，但色鍵只存在 `filters`。新版 `adoptAdj` 因 `adj` 可用而略過 `filters`；重新選取後編輯調色，濾鏡重建便刪掉色鍵。
  why missed  -> 舊資料測試只涵蓋「有濾鏡、沒有 `adj`」，沒有涵蓋兩者並存。

FINDING 2: Canvas 還原期間切換圖片，會清除另一張圖的色鍵
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:1650
  confidence  -> CONFIRMED
  scenario    -> 選取 A（有 AI 原圖與色鍵）按「還原」，在 `bgSwapSource` 等待載入時選取 B。完成後 `markEdit` 與 `setAdj` 作用於目前選取的 B；A 的色鍵仍在，B 的色鍵卻被清除。
  why missed  -> 程式在開始時保存了 A，但換圖後仍透過共用的選取狀態執行色鍵還原。

FINDING 3: 向量編輯器還原期間切換圖片，會把另一張圖的調色套到原圖
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:1471
  confidence  -> CONFIRMED
  scenario    -> 選取有 AI 原圖與色鍵的 A 按「還原」，等待換回原圖時選取調色不同的 B。`cgAdj` 已同步為 B；後續以 B 的設定產生 `next`，再由第 1473 行的 `cgApply(o,next)` 套到 A，覆蓋 A 的調色。
  why missed  -> `o` 保留了 A 的物件參照，但 `cgAdj` 是會隨選取變動的全域狀態。

TOTAL: 3 findings
