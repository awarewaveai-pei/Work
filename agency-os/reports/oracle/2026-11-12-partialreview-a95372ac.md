# codex-oracle review -- 2026-11-12 23:35:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-effects.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-effects-ai.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.12: editor 特效 pane -- 畫質增強 (existing local upscale job replaces the clip asset, all edit fields kept) and 從這裡重新生成 (playhead frame as first frame + clip prompt -> video generation; on success split at playhead via tools-editor.js edAction('split') and the after-part plays the new video). Price shown before click; failure leaves the clip unchanged.
- exit: 0 | elapsed: 253637ms | answer: 2231B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-effects.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-effects-ai.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 切割後等待儲存時，改選片段可把生成影片套到錯誤片段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js:166
  confidence  -> CONFIRMED
  scenario    -> 生成成功後 `edAction("split")` 等待儲存；使用者在此時選取同專案另一片段；`edClip()` 取得新的選取片段，後續將生成影片替換到它，原片段則只被切開。
  why missed  -> 驗收測試在等待任務完成期間沒有變更選取狀態。

FINDING 2: 切割與替換分兩次儲存，儲存失敗會留下半成品
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js:165
  confidence  -> CONFIRMED
  scenario    -> 生成已成功，但切割的第一次儲存失敗；`edAction("split")` 拋錯且執行不到復原區塊，畫面仍留著已切割的片段。若第二次儲存失敗，替換也已發生而沒有復原。
  why missed  -> 測試只覆蓋供應商任務失敗及成功後手動復原，沒有覆蓋儲存失敗。

FINDING 3: 預設 Gemini 模型顯示的確定價格不等於伺服器實際記帳金額
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js:84
  confidence  -> CONFIRMED
  scenario    -> 選用 Gemini Omni 生成 8 秒影片；按鈕以固定每秒估值顯示價格，伺服器完成後卻依實際輸入、輸出及思考 token 計算 `costUsd`（`backend/provider-cost.cjs:43`），兩者可不同。
  why missed  -> 測試使用固定費率的 Replicate 假服務，沒有檢查 Gemini 的用量計價路徑。

FINDING 4: 任務執行期間重新載入頁面，成功結果不會自動替換片段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js:259
  confidence  -> CONFIRMED
  scenario    -> 送出重新生成後重新載入頁面，任務隨後成功；替換回呼只存在於原頁面的 `showJob`，重新載入後的任務對帳僅將成果加入素材庫（`shared/runtime.js:392`），時間軸仍是原片段。
  why missed  -> 驗收測試始終保持任務面板與頁面開啟。

TOTAL: 4 findings
