# codex-oracle review -- 2026-11-18 09:09:27 +08:00

- mode: `review`
- scope: whole repo
- target: `4dd295b44`
- context: Claude fixes for a Claude cross-model review of Codex's video-unify commits. 2d73bc117 U5: stop/clear/resume of the one-click run must reach the next-admin project row (autonomy guided only for the same runId, autoStop marker, re-arm on resume), a finished quick-render is reused via retryOf (never re-billed), brief_json writes merge with updated_at CAS, a stale schedule firing ends quietly. 70a9bf8ea U3.6: ScriptForge per-run server budget counts only known usage (stream without stop_reason = unknown, keep reservation), unbilled HTTP errors = NT$0, closed dialog resumes the same runId from a localStorage pointer, stale reservations (>120 s) expire with cost kept. eb69c2afa: scene-image model checked before billing, visible style-load failure, review panel copy, bible keyless pairing. Focus: double charge, budget overrun, stop that does not stop, lost data on old rows, race between tabs/schedule.
- exit: 0 | elapsed: 179075ms | answer: 2134B
- files-reviewed: agency-os/handoffs/2026-11-16-video-unify-supervisor/CLAUDE-RESUME-STATEMENT.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 120 秒後的重試可讓同一個腳本步驟同時呼叫供應商兩次  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/script-forge/run-store.ts:33  
  confidence  -> CONFIRMED  
  scenario    -> 第一個串流仍在執行；第 121 秒同一請求重試。第 40 行不再拒絕保留，第 44 行換掉 token 並送出第二次付費呼叫；第一個呼叫完成後，其回執會在第 53 行遭拒。部署使用自架的 `node server.js`，而 [Next.js 文件](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)說明 `maxDuration` 本身不限制執行時間，不能保證第一個呼叫已結束。  
  why missed  -> 過期時間直接沿用 route 宣告的 `maxDuration = 120`，未核對部署方式。

FINDING 2: 舊的快速輸出請求會把使用者剛調高的花費上限寫回舊值  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/quick-render/route.ts:173  
  confidence  -> CONFIRMED  
  scenario    -> 上限原為 NT$10；快速輸出送出期間，使用者以 resume 調至 NT$20。輸出接受後，這行以請求內舊的 `autoBudget` 覆蓋同一 run 的 `budgetTwd`，資料庫上限回到 NT$10。若期間累計已用超過 NT$10，該筆預算還會被 `parseAutoBudget` 判為無效。  
  why missed  -> 更新雖使用新讀取與 CAS，合併時卻只保留新的 `spentTwd`，沒有保留新的上限。

FINDING 3: 舊排程在檢查失敗時仍可停止已接續的新執行  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/project-advance.ts:39  
  confidence  -> CONFIRMED  
  scenario    -> 排程開始檢查舊執行；檢查期間使用者接續或開始新執行；舊檢查回傳影片錯誤或 QA 問題。第 45／54 行呼叫 `stop()`，此處未比對 runId，就把目前專案列設為 `guided` 並寫入舊錯誤，新執行因此停止且排程報錯。  
  why missed  -> runId 防護放在付費與草稿寫入路徑；`stop()` 的狀態寫入仍沿用無條件更新。

TOTAL: 3 findings