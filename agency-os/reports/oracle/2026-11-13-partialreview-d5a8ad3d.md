# codex-oracle review -- 2026-11-13 22:59:57 +08:00

- mode: `review`
- scope: whole repo
- target: `197d65789..HEAD`
- context: 破框貼文動畫: 4:5 and 16:9 output, Threads/X post styles, post text held to the first frame by a per-cell grid rule (cell changed <=50% = drift restored, >50% = subject arrived, opens), and post-download finishing moved out of the status request: finishBreakout runner per job, GET answers at once (running + stage finishing), cancel during finishing stops only the local runner (no vendor call) and delivers the vendor's raw video charged once, restart resumes or fails finishing jobs. Focus: the invariant 'a status request never waits for local post-processing'; charge recorded exactly once on every path (finish ok / fail / cancel / restart); worker+ffmpeg cleanup and temp files; result.ratio = file ratio for 1:1, 4:5, 16:9; delivery-ratio eligibility for 4:5 and 16:9.
- exit: 0 | elapsed: 155443ms | answer: 1840B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/breakout-rules.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 4:5 與 16:9 成品未取得交付比例，後續交付流程會略過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs:159
  confidence  -> CONFIRMED
  scenario    -> 破框任務完成 4:5 影片 → `api.cjs:878` 將來源標為 `ai_generated` → 此處只替 `workbench_render` 寫入 `metadata.ratio`；成品又使用 UUID 檔名，`platform-ratio.ts:35-37` 無法辨識比例 → 後續社群草稿與交付候選清單略過該影片。
  why missed  -> 測試驗了 `job.result.ratio`，但交付流程讀的是素材資料庫的 `metadata.ratio`。

FINDING 2: 重啟後遺失原始檔的已付費任務不會記帳
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:230
  confidence  -> CONFIRMED
  scenario    -> 供應商影片已下載、任務處於 `finishing`，但重啟時原始檔遺失 → 此處將任務設為 `failed` → `api.cjs:142` 的用量記錄只處理 `succeeded`，因此這次已發生的供應商費用沒有進入用量 outbox。
  why missed  -> 重啟測試只驗了失敗訊息，沒有驗付費任務的用量記錄。

FINDING 3: 收尾完成前一刻取消，仍可能交付裁切後影片
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:220
  confidence  -> CONFIRMED
  scenario    -> 使用者在 worker 即將完成時按取消 → `api.cjs:1418` 發出 abort，但此處只向 worker 傳送非同步訊息 → worker 可先送出成功結果；`api.cjs:844-847` 隨即刪除原始檔並交付裁切後影片，與取消時交付原始影片的行為相反。
  why missed  -> 取消測試的模擬 runner 一收到 abort 就立即 reject，沒有覆蓋 worker 已完成而 abort 訊息尚未處理的競態。

TOTAL: 3 findings
