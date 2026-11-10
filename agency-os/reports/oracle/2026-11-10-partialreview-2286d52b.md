# codex-oracle review -- 2026-11-10 15:48:16 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/text.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-text.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed5-text.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed1-layout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/tools-editor.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p1-loop.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.5 text pane: 15 theme-token templates, search/category, add via plus/dblclick/drag to text lane, text animation, brand kit tab reading preference tools.editor.brandKit; blank text default now 新文字; tests updated for new button label
- exit: 0 | elapsed: 137741ms | answer: 1811B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/text.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-text.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed1-layout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p1-loop.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/tools-editor.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed5-text.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 雙擊樣板卡片上的「＋」會加入三段文字
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/text.js:347
  confidence  -> CONFIRMED
  scenario    -> 使用者雙擊卡片上的「＋」→ 兩次 click 各加入一段，冒泡的 dblclick 再加入一段。
  why missed  -> 測試分別操作「＋」與卡片雙擊，沒有測兩者重疊的位置。

FINDING 2: 新增的文字動畫在編輯預覽中不會播放
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:1645
  confidence  -> CONFIRMED
  scenario    -> 選「彈出」後加入樣板並播放預覽 → 文字全程靜止；匯出的影片卻會彈出。預覽的文字樣式沒有使用 clip.animation。
  why missed  -> 新測試只檢查動畫欄位與匯出畫面，沒有檢查播放中的預覽。

FINDING 3: 有底色的樣板，編輯預覽與匯出成品底色不一致
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs:774
  confidence  -> CONFIRMED
  scenario    -> 加入「白底標籤」→ 編輯預覽顯示不透明白底；匯出時 ASS 底色使用透明度 `55`，影片會透出下方畫面。
  why missed  -> 測試只比較是否有像素差異，沒有比較預覽與匯出的底色。

FINDING 4: 匯出測試不能證明每張樣板的字已畫出
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed5-text.cjs:148
  confidence  -> CONFIRMED
  scenario    -> 某張有底色的樣板只匯出色塊、文字未渲染 → 色塊仍造成超過 400 個像素與背景不同，測試通過。
  why missed  -> 判定依據是整張畫面的像素差，沒有區分底色和字形。

TOTAL: 4 findings
