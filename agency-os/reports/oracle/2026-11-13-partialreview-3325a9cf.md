# codex-oracle review -- 2026-11-13 22:40:53 +08:00

- mode: `review`
- scope: whole repo
- target: `187e1ddb1..b7c07b6d0`
- context: 破框貼文動畫 follow-up: 4:5 output ratio; after download the post's text rows are held to the first frame (decoded frames compared to frame 1 in a worker thread, BT.709, rows the subject covers open), then the output ratio is cropped. Focus: job status/cancel/charge when the hold step fails or is cancelled (vendor run already paid), worker/ffmpeg process cleanup and temp files, memory on long videos, result.ratio = file ratio for 4:5 and 1:1, delivery ratios for 4:5, validation of settings.lock from the client.
- exit: 0 | elapsed: 243766ms | answer: 1774B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/breakout-rules.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 收尾超過 15 秒會中斷瀏覽器的自動追蹤，已完成的付費影片可能不交付到頁面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:818
  confidence  -> CONFIRMED
  scenario    -> 正式環境的 GET 靜默逾時為 15 秒（`config.js:4`）；供應商完成後，這次 GET 等待文字鎖定與重編碼超過 15 秒。請求逾時後，`runtime.js:401-424` 略過錯誤且不排下一次輪詢；伺服器稍後雖完成並記帳，頁面仍顯示未完成，直到重新載入。
  why missed  -> 收尾的五分鐘時限看似足夠，但頁面的 GET 時限和輪詢停止條件都在 diff 外。

FINDING 2: 供應商已完成時，取消本地收尾仍先要求供應商接受取消
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1357
  confidence  -> CONFIRMED
  scenario    -> 供應商回報成功，文字鎖定仍在執行，使用者按取消；若供應商對已完成任務的取消回非 2xx，API 回 502，任務繼續執行，使用者無法取消本地收尾。
  why missed  -> 新增的完成後處理沿用原本只為供應商執行階段設計的取消路徑。

FINDING 3: 即使取消成功，文字鎖定 worker 仍繼續耗用資源
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:818
  confidence  -> CONFIRMED
  scenario    -> 收尾期間供應商接受取消，`controls` 的 signal 被中止；此處沒有把 signal 傳給 `breakout.finish`，worker 和 ffmpeg 仍跑到完成或五分鐘逾時，之後才刪除產物。
  why missed  -> `breakout.finish` 已支援 signal，呼叫處卻漏傳，正常完成測試不會觸及這條路徑。

TOTAL: 3 findings
