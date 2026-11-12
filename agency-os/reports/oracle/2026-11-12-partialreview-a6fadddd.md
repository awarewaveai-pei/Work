# codex-oracle review -- 2026-11-12 23:34:31 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.4 parity rework (uncommitted, vs HEAD 977eb2ef2): card adds on double-click/Enter/+ only; upload only fills library + 本次上傳 (sessionStorage, pruned to existing ids on each load); 拆出音軌 saves audio asset <videoId>#audio (same url/origin) unless it already exists; rights checkbox; load re-runs once if requested while running; list repaint sanitized. Previous round b0a0544c found: unescaped track label, overwrite of renamed extracted asset, stale session count - verify these are fixed and look for new bugs.
- exit: 0 | elapsed: 183405ms | answer: 1256B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 無聲影片仍可「拆出音軌」，產生無法正常匯出的音訊素材  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:237  
  confidence  -> CONFIRMED  
  scenario    -> 上傳沒有音軌的影片後按「拆出音軌」，程式直接把同一影片 URL 存為 `kind: "audio"`；若將它加入時間軸，匯出器會因來源沒有音訊而拋出「素材類型與片段不符」（backend/editor-export.cjs:456–463）。  
  why missed  -> 測試只使用有聲影片，未檢查來源檔是否真的含音軌。

FINDING 2: 載入中的舊清單可永久抹掉新上傳素材的「本次上傳」紀錄  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:53  
  confidence  -> CONFIRMED  
  scenario    -> `assets.list()` 先取得舊清單、偏好讀取尚未完成；此時上傳完成並在第 153 行加入新 ID。偏好讀取完成後，第 53 行用舊清單刪掉該 ID；即使第 55 行重跑載入，新 ID 已從 `sessionStorage` 消失，素材不再出現在「本次上傳」。  
  why missed  -> 測試依序等待載入與上傳，未交錯兩個非同步流程。

TOTAL: 2 findings
