# codex-oracle review -- 2026-11-10 15:56:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/transition.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/stickers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed7-transition-stickers.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-transition.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-stickers.css  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.7: 轉場窗格（必須點剪點、效果/長度夾限/曲線/套用全部/預覽/移除）、貼圖窗格（浮水印 PNG/SVG 帳號保留、品牌套件偏好 tools.editor.brandKit）、匯出轉場曲線（xfade custom expr，曲線非線性時重述 fade/fadeblack/wipe/circleopen，推移不支援則拒絕）。只看這些檔。
- exit: 0 | elapsed: 128812ms | answer: 1110B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/stickers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/transition.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-stickers.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-transition.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed7-transition-stickers.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 選定的影片浮水印不會進入匯出影片
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/stickers.js:250
  confidence  -> CONFIRMED
  scenario    -> 使用者上傳 PNG、設為影片浮水印後匯出；此處只儲存 `tools.editor.watermark` 偏好，匯出對話框提交的設定只有品質與專案，輸出影片沒有浮水印。
  why missed  -> 新測試只確認偏好值已儲存，沒有檢查匯出影片是否包含浮水印。

FINDING 2: 片段短於 0.1 秒時，長度夾限仍會寫入超過相鄰片段的轉場
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/transition.js:65
  confidence  -> CONFIRMED
  scenario    -> 30 fps 時三個相鄰 V1 片段各長 1 格；按「套用全部剪點」後，每個轉場被寫成至少 3 格，超過相鄰片段的 1 格。匯出檢查中段片段承受的兩側轉場長度時會拒絕專案。
  why missed  -> 測試縮短片段時只測到 0.8 秒，未覆蓋可合法存在的 1–2 格片段。

TOTAL: 2 findings
