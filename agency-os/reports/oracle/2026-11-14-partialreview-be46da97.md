# codex-oracle review -- 2026-11-14 09:15:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.1 round 2: free cover candidates at export. Round-1 fixes: covers now kept as /generated/<uuid>.jpg (server.cjs serves images only there) and use their own 120s AbortSignal.timeout instead of the job deadline, so a cover never fails a finished video; fc3 test fetches each cover url from the server
- exit: 0 | elapsed: 163240ms | answer: 1101B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc3-engine-render.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 取消匯出後，封面完成仍會把任務改回成功
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:653
  confidence  -> CONFIRMED
  scenario    -> 編輯器影片已存妥、正在產生封面時，使用者取消任務；取消路由將狀態設為 `cancelled`，但封面使用獨立 signal 繼續執行，完成後此行將狀態覆寫為 `succeeded`。
  why missed  -> 獨立逾時解決了封面受任務期限影響的問題，卻也讓封面不再受取消動作控制。

FINDING 2: 封面產生中斷會留下未完成的 JPEG
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover.cjs:86
  confidence  -> CONFIRMED
  scenario    -> FFmpeg 已建立目前的輸出 JPEG，隨後因 120 秒期限或錯誤而失敗；清理只刪除已加入 `made` 的檔案，目前這張尚未加入，因此殘留在 `generated`。重複失敗會持續累積殘檔。
  why missed  -> 測試只檢查成功路徑的暫存檔清理，沒有覆蓋寫入 JPEG 期間失敗的路徑。

TOTAL: 2 findings
