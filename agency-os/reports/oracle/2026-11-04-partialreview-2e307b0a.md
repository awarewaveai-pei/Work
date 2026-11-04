# codex-oracle review -- 2026-11-04 15:34:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CARD-02 layers panel union written by an SDK worker: both editors get layer rows with show/hide, lock, select, rename, up/down, front/back, duplicate, delete, labels, selection highlight, group/ungroup buttons, undo steps; vector toObject wrap persists name/lock; vector undo double-snapshot bug fixed
- exit: 0 | elapsed: 126807ms | answer: 1027B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 向量編輯器鎖定圖層後，方向鍵仍可移動物件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:667
  confidence  -> CONFIRMED
  scenario    -> 鎖定並選取圖層後按方向鍵；鍵盤處理器仍直接修改 `active.left/top`（同檔:814–816），物件移動，違反鎖定行為。
  why missed  -> 只檢查 Fabric 拖曳限制，未追查既有鍵盤移動路徑。

FINDING 2: 雙擊尚未選取的向量圖層名稱可能無法改名
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:703
  confidence  -> PLAUSIBLE
  scenario    -> 另一圖層正被選取時雙擊名稱；第一次點擊觸發選取與 `renderLayers()`，替換名稱節點。若雙擊事件落在共同祖先 `#layers`，委派處理器找不到 `.nm`，不會開啟改名提示。
  why missed  -> 測試先單擊選取同一圖層，再雙擊改名，沒有覆蓋直接雙擊未選取圖層。

TOTAL: 2 findings
