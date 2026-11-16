# codex-oracle review -- 2026-11-16 08:46:07 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/subtitles.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed13-agent-ui.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: R4: the edit agent's paid-proposal cards follow the pane's own paid run through one ed:paid event (started/succeeded/failed) and say the outcome in the conversation; cancel before start says so; the pane's own apply keeps one checkpoint
- exit: 0 | elapsed: 121887ms | answer: 1891B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/subtitles.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed13-agent-ui.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 付費請求送出後、回應前仍可取消，卻會宣稱「沒有扣點」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js:217
  confidence  -> CONFIRMED
  scenario    -> 使用者按下字幕分頁的付費「開始」；POST 尚未回應時，卡片仍是 waiting，使用者按「取消」→ 對話宣稱沒有執行、沒有扣點；POST 隨後建立工作，成功後仍會計費（backend/api.cjs:207-210），但卡片已不再追蹤結果。
  why missed  -> 測試只涵蓋按「開始」之前取消，沒有涵蓋請求進行中的時間窗。

FINDING 2: 只按工作種類配對，會把其他語言的翻譯標成提案完成
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js:230
  confidence  -> CONFIRMED
  scenario    -> 卡片提議翻譯成 English；使用者進入字幕分頁後按「翻譯成 日本語」→ 兩者的事件種類都是 translate，卡片被標為完成，對話將 English 提案與日本語結果接在同一句。該分頁確實提供各語言按鈕（editor-panes/subtitles.js:442-446）。
  why missed  -> 新測試只跑辨識，沒有檢查提案參數與實際付費操作是否一致。

FINDING 3: 剪贅字結果處理出錯時，卡片永久停在「進行中」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/fillers.js:220
  confidence  -> CONFIRMED
  scenario    -> 剪贅字工作已回報 succeeded，但取得逐字稿的 GET 失敗，或套用時 `edSubEdit` 拋錯 → `fcWatch` 直接拒絕，外層只呼叫 `reportError`（fillers.js:273），沒有發出 failed 事件；對話與卡片一直顯示進行中。
  why missed  -> 測試涵蓋正常完成與開始前取消，沒有涵蓋工作成功後的讀取或套用失敗。

TOTAL: 3 findings