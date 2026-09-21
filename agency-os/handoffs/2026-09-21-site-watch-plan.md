---
slug: site-watch-plan
created_utc: 2026-09-21T05:00:00Z
hint: "網站巡檢（Playwright）計畫，操作者已同意設計方向，實作待 go-ahead"
source_session_summary: "Entity dossier + self-hosted renderer 上線後，操作者問 Playwright 還能用在哪；決定做客戶網站巡檢"
---

## 1. 任務目標
客戶網站巡檢 = site-watch。每客戶可開關，新客戶預設開。Phase 1 只做公開頁面：打開、JS 錯誤、截圖比對。

## 2. 操作者已拍板（不要重問）
- 設定入口 = 客戶頁 `/ops/clients/[slug]` 一張「網站巡檢」卡片；按鈕/核取方格，禁下拉；多選。
- 新客戶預設開，每天 1 次；電商與 app.aware-wave.com 每小時。頻率 chips：每小時／每 6 小時／每天／只在更新時。
- 正常不出聲、不產日報；失敗才 Telegram（同一問題一次，恢復一次，連續 2 次失敗才報）。週摘要預設關。
- 不留垃圾：基準圖每頁只留最新 1 張；正常結果只記一行、30 天自動刪；失敗證據 30 天自動刪。
- 總覽表列全部網站狀態，未開巡檢者標黃。
- 負擔上限：容器記憶體／CPU 設死上限，全域 kill switch。

- 自建網站接入：唯一動作 = 在系統新增客戶（填網址）；onboard wizard（`app/(shell)/onboard/OnboardWizard.tsx`，已有 Uptime Kuma 等整合清單）加「網站巡檢」項，預設勾。安全網：總覽表列出「MainWP 有、系統沒有」的網站（next-admin 目前無 MainWP 站點清單讀取，需新增唯讀 MainWP API 讀取，P1 末或 P1.5）。

- MainWP 自動接入：`addSiteToMainWp` 已對齊 MainWP 6.0.12（`sites/add`、Basic auth、`url/name/admin/uniqueid`，`integration-steps.ts:347` 註解；commit 7faa4f68a／363a505f4）。OnboardWizard `PROVIDERS`（`OnboardWizard.tsx:69`）尚無 MainWP 項 → 勾選即接上 = slice 2。

## 3. 重用（已查證，不建新輪子）
- 排程：照 collection-schedule 模式。`lib/collect/schedule-store.ts` + `schedule.ts isDueNow` + `app/api/internal/collect/run-due-schedules/route.ts`（專用 bearer token、lastRunAt 成功後才寫）+ Trigger.dev 每小時 heartbeat `packages/workflows/src/trigger/collect-scheduled-crawl.ts`。
- 通知：失敗 = 開 ops-inbox incident，恢復 = resolve；`lib/ops-inbox/notify/dispatcher.ts:34 dispatchNotifications` 已有 Telegram 與 transition 去重語意。
- 瀏覽器：Phase 1 只看公開頁、零憑證 → 在現有 renderer 加 `POST /snapshot`（截圖 + console errors + status），沿用同一隔離（egress policy、非 root、無 caps）。不另開容器。
- 基準圖儲存：`lib/storage/r2.ts`。
- 設定存放：`organizations.metadata.client_config.site_watch`（同 collection／chatwoot 慣例）。
- 更新前後比對：掛進 `app/api/ops/clients/[slug]/wp-update/route.ts`（SSE），更新前 snapshot、更新後 snapshot + diff，超門檻 → log 警告 + incident。
- 既有 e2e `tests/e2e/client/wp-site-health.spec.ts` 保留當手動工具，不搬進 prod。

## 4. 修正既有錯誤說明
`scripts/playwright-runner.ps1` 檔頭寫 sg-deploy 會呼叫它 = 假（sg-deploy.sh 無 playwright，GHA 亦無）。Phase 1 改檔頭為實況。

## 5. 分期（2026-09-21 外部審查後改為垂直切片）
- Slice 1：每客戶 1 URL（首頁）+ daily + `/snapshot` + pixelmatch + incident（連 2 次）+ 30 天清理 + kill switch + 設定卡。驗整條鏈。
- Slice 2：多頁、hourly／6h／update-only、總覽表、wp-update 前後比對、MainWP wizard 接線、「MainWP 有系統沒有」清單。
- P2（另開容器，帶憑證）：登入後流程。憑證走 vault，只連自己與客戶網域。
- P3：sg-deploy 後瀏覽器 smoke（JS 錯誤 → rollback）。

## 6. 風險等級
High：renderer 新 endpoint 上線、compose 不變、Trigger.dev deploy、migration（§8 C7 改用專用表）。需操作者 go-ahead，首行 `# CONFIRMED-HIGH-RISK:`。

## 7. 下一步（接手照做）
1. 讀本檔 + `git log --oneline -10`。
2. 出 R0 七段（依 §3 事實 + §8 contract），等 go-ahead。§8 標「預設」者操作者可改，未改即照做。
3. 實作 slice 1，驗證四動作，critic 1 個。

## 8. 實作前 contract（2026-09-21 GPT 審查 11 點全數查證成立 + 1 點補充）
- C1 頁面：預設 = 客戶網址首頁；slice 2 開放手填清單，上限 10 頁／客戶。page id = canonical URL（小寫 host、去 fragment 與 query、去尾斜線）的 sha256 前 16 碼。不做 crawl／sitemap。
- C2 排程：不重用 `lib/collect/schedule.ts`（只有 `daily|weekly`，`:13`；run key 只到日期，`:50-53`）。新 frequency `hourly|every_6h|daily|update_only`，run key = `sw-<org8>-<UTC YYYYMMDDHH 桶>`。
- C3 租約：`lease_until` 欄；取工作用條件式 `UPDATE ... WHERE lease_until IS NULL OR lease_until < now() RETURNING`，搶不到即跳過。現況 lastRunAt 事後才寫（`run-due-schedules/route.ts:47`），重試會重跑。
- C4 執行時限（補充）：run-due route `maxDuration = 300`（`route.ts:25`）且逐客戶同步 for-loop；site-watch 改為 heartbeat 只挑到期目標、每客戶一個 Trigger.dev task，不在 route 內截圖。
- C5 renderer `/snapshot`：獨立 route，不套 `/render` 的 `SKIPPED_RESOURCE_TYPES`（`server.mjs:88,111` 擋 image/media/font，否則畫面殘缺）；egress 限制照舊。viewport 1366×900、full-page 高度上限 8000px、等 `load` + 最多 15s networkidle、單圖 ≤5MB、renderer 內 snapshot 併發 1。回傳 `{status, finalUrl, consoleErrors[], pageErrors[], screenshotBytes, timingMs, failureCode}`；failureCode 枚舉 `timeout|http_4xx|http_5xx|dns|blocked|too_large|renderer_error`。console 只收 `error` 級 + pageerror。
- C6 比對：首次成功即建基準；pixelmatch threshold 0.1，差異像素 >5% = 視覺警告（預設）。每頁可設遮罩 selector（slice 2）。基準只在操作者按「接受為新基準」時換（預設，不自動換）。
- C7 資料：用專用表 `site_watch_targets`（設定 + lease + failure_streak + version）與 `site_watch_results`（一行一次），不寫 `organizations.metadata.client_config`——現有 writer 是 read-merge-write（`cis/route.ts:88-121`），並行會互蓋。設定更新帶 `version` 樂觀鎖，記 actor。
- C8 通知：dispatcher 對 `new` 立即發（`rules.ts:44-47`），不等於「連 2 次」→ 門檻在 site-watch 端：`failure_streak` ≥2 才開 incident。fingerprint = `site_watch:<org>:<page_id>:<failureCode|visual_diff>`。第一次成功 → resolve 並歸零；接受新基準／改設定 → 歸零。Telegram 送失敗的補送語意：實作前讀 `dispatcher.ts:34` 確認；不足則列剩餘風險，不在 slice 1 自建重送。
- C9 清理：同一 heartbeat 每日一次：刪 `site_watch_results` >30 天；R2 key `site-watch/<org>/<page_id>/baseline.png`（單 key 覆寫，單物件 put 為原子）與 `.../evidence/<ts>.png`；evidence >30 天刪，另掃 prefix 刪 DB 未引用且 >1 天的 orphan。刪除失敗下次重掃，不另建重試佇列。
- C10 kill switch：env `SITE_WATCH_ENABLED`（預設 OFF，同 §0 自動化預設 OFF 慣例；改動走 `safe-infra-patch.sh`）。每頁開跑前檢查；進行中的頁跑完（受 15s + 截圖時限）即停。renderer 沿用現有 2G／2 CPU／1024 pids（`docker-compose.yml` renderer deploy.resources）。
- C11 wp-update（slice 2）：更新前 snapshot 失敗 → 記錄、不擋更新、不比對；更新失敗 → 照現有流程；更新後 snapshot 失敗 → 重試 1 次，仍敗 = warning incident；HTTP OK 但 diff 超標 = warning incident，不判更新失敗。SSE 斷線行為沿用現有 route，實作前先讀確認，不改。現有 health 只是 HEAD（`wp-update/route.ts:114-120`）。
- C12 隱私：R2 私有；圖只經 next-admin 已驗證 route 取，短效 signed URL；Telegram 只送文字摘要 + ops 連結，不附圖；存 URL 去 query；只截公開頁。
- 驗收矩陣（slice 1）：正常站 → 無通知、1 行結果；站 500 兩次 → 1 則 Telegram；恢復 → 1 則 resolve；同時觸發兩次 heartbeat → 只跑一次；kill switch OFF → 0 次 renderer 呼叫；31 天前 evidence 被刪、baseline 保留。
- Rollback：`SITE_WATCH_ENABLED=false`；新表與 `/snapshot` 不影響既有 collection 與 `/render`。
