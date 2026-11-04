# codex-oracle review -- 2026-11-04 14:59:41 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: canvas + vector-editor: compact headers (Canvas Editor title, no subtitle/badge); merged 畫布尺寸 panel -- canvas gains 畫布底色 + 匯出透明底 (exportPng blanks bg), vector gains px unit with conversion + 符合/填滿畫布 for the selected object
- exit: 0 | elapsed: 167307ms | answer: 2560B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 改變 Canvas 底色後，「存入 My Designs」仍可能維持停用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:1906
  confidence  -> CONFIRMED
  scenario    -> 設計已儲存、按鈕顯示「已存入」時，使用者改變底色；處理函式只改 Fabric 背景，未重設 `saveState`，因此儲存按鈕仍停用，新底色無法存入 My Designs。
  why missed  -> `markEdit()` 看似標記了編輯，但它只記錄目前選取的物件；既有儲存狀態重設依賴物件事件。

FINDING 2: Canvas 底色變更不會進入復原紀錄
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:1907
  confidence  -> CONFIRMED
  scenario    -> 使用者將白底改成紅底後按復原；底色變更沒有呼叫 `snapshot()`，復原無法回到白底。
  why missed  -> 背景色屬於 Canvas 狀態，直接賦值不會觸發現有的 `object:modified` 快照流程。

FINDING 3: 載入或復原設計後，Canvas 底色選擇器會顯示錯誤顏色
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:1901
  confidence  -> CONFIRMED
  scenario    -> 載入一份藍底設計；`loadFromJSON()` 還原了實際背景，但 `bgColor` 仍是初始白色，選擇器顯示白色，PNG 卻輸出藍底。
  why missed  -> 新控制項的 React 狀態只在使用者操作時更新，既有載入與復原路徑沒有同步它。

FINDING 4: 向量編輯器的「符合畫布」會裁掉旋轉物件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:712
  confidence  -> CONFIRMED
  scenario    -> 畫布為 100×200 px，選取原始尺寸 100×200 px、旋轉 90° 的物件後按「符合畫布」；函式按未旋轉的 `width/height` 算出縮放 1，實際包圍框寬 200 px，超出畫布並被裁切。
  why missed  -> 計算只看物件原始寬高，沒有納入旋轉後的邊界。

FINDING 5: px 單位切換會改變畫布像素尺寸
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:360
  confidence  -> CONFIRMED
  scenario    -> 畫布寬 100 px、DPI 600；切換至 cm 時先四捨五入成 0.42 cm，再切回 px 得到 99 px。只切換顯示單位，尺寸就縮小 1 px。
  why missed  -> 換算過早將公分值限制為小數兩位；像素回算沿用已失去精度的值。

TOTAL: 5 findings
