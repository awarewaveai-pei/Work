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
- 通知：失敗 = 開 ops-inbox incident（看板／紀錄），Telegram 由 site-watch 直送（同 `deploy` 來源先例 `rules.ts:38-39`；理由見 §8 I2）；直接重用 `lib/ops-inbox/notify/telegram.ts:15 TelegramNotifier`。
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
- 不變量（C3／C8 被同一 reviewer 連報 2 次，AGENTS.md §4 要求第三次修正前先寫；下列規則由它推導，不逐點補）：
  - I1 單一有效執行者：任一時刻，對同一 target 的狀態寫入只有一個執行者會生效；保證方式 = 每次取得執行權都換新世代號，每筆寫入在同一 SQL 內驗「世代號是我的且未過期」。對外可見的副作用（Telegram）只在「剛續約成功且剩餘租期 > 該副作用的硬逾時總和 + 30s」時才准開始，讓一般情況下送出在租約內結束；但這**不是**保證——請求一旦送出，client abort 只停止等待，Telegram 仍可能已收下並晚到，而 sendMessage 無 idempotency key（Codex r4 H1）。所以對外送出的正確性不靠 fence，改由 I2 的「不確定」狀態承擔。截圖不對外可見，可重複，狀態不可。
  - I2 通知 = 狀態，不是事件：「該發」先落 DB（pending），「已發」只在送達回傳 sent 後才寫；任何一步當掉，下一次 heartbeat 從 DB 狀態續做。送出結果分三種：確定送達（sent）、確定沒送（收到 HTTP 4xx 回應，或根本沒發出請求）、**不確定**（HTTP 5xx、abort、網路錯誤、送出後當掉）——不確定一律當「可能已送達」處理，不得當成沒送。代價 = at-least-once：可能多收 1 則重複或延遲的訊息。接受，列剩餘風險。
  - I3 一段問題一組訊息：一個 episode（從連 2 次失敗到恢復送完）告警與恢復成對：只要告警可能已送達（sent 或不確定），就一定補送恢復；只有「確定沒送」的告警才允許恢復時 0 則。保證的是**不會只收到告警、永遠等不到恢復**；不保證不重複（I2 例外，最多多 1 則）。
- C1 頁面：預設 = 客戶網址首頁；slice 2 開放手填清單，上限 10 頁／客戶。page id = canonical URL（小寫 host、去 fragment 與 query、去尾斜線）的 sha256 前 16 碼。不做 crawl／sitemap。
- C2 排程：不重用 `lib/collect/schedule.ts`（只有 `daily|weekly`，`:13`；run key 只到日期，`:50-53`）。新 frequency `hourly|every_6h|daily|update_only`。run key 依頻率分桶（Codex r1 H1）：hourly=`sw-<target>-<YYYYMMDDHH>`、every_6h=`sw-<target>-<YYYYMMDD>-q<floor(H/6)>`、daily=`sw-<target>-d<YYYYMMDD of (now − hour_utc 小時)>`、update_only=`sw-<target>-upd-<ops_action_run_id>`。daily 的桶是「從 hour_utc 起算的 24 小時」，所以到期 = 當前桶 key ≠ `last_completed_run_key`，錯過設定那小時的任何後續 heartbeat 都會補跑，且同桶仍只一次（Codex r2 M1）。語意 = 每桶最多一次、只跑當前桶、不補歷史桶（巡檢看的是現在，補昨天無意義）；停擺跨桶時該次 result 記 `skipped_buckets = 中間漏掉的桶數`（Codex r3 M1）。`hour_utc` 預設 22（台北 06:00，上班前已知結果）。`site_watch_results` UNIQUE `(target_id, run_key, page_id)`。heartbeat = 新 Trigger.dev 每小時 task（不掛 collect 那支），每次同時挑「到期」與「有待送通知」（I2）的目標。
- C3 租約（Codex r1 H2 + r2 H2，依 I1）：`site_watch_targets` 加 `lease_gen bigint`、`lease_until`。搶 = `UPDATE ... SET lease_gen=lease_gen+1, lease_until=now()+<window> WHERE id=? AND (lease_until IS NULL OR lease_until < now()) RETURNING lease_gen`，0 行 = 跳過；每次搶（含重跑、接手）都拿新 gen，不沿用。window = 單頁時限（15s 載入 + 30s 截圖）× 頁數 + 120s，上限 15 分；slice 1 單頁 = 5 分。續約：每頁開跑前 `SET lease_until=now()+<window> WHERE id=? AND lease_gen=<mine> AND lease_until > now()`，0 行 = 已被接手、立即停。所有狀態寫入（results、page_state、完成）都是單一 SQL，條件含 `lease_gen=<mine> AND lease_until > now()`（page_state 以 `UPDATE ... FROM site_watch_targets` 連表判斷），過期的舊執行者寫入 0 行。Trigger.dev task `maxAttempts=1`：當掉不靠 Trigger 重試，靠租約到期後下一次 heartbeat 重搶（最長延遲 = window + 1 小時）。舊執行者多截的一張圖屬浪費不屬錯誤（寫不進去）。Telegram 硬逾時：`lib/ops-inbox/notify/telegram.ts` 的 `sendTelegram`（現況 `fetch` 無逾時）加 `signal: AbortSignal.timeout(10_000)`——必須加在 fetch 本身，外層 `Promise.race` 不會中止請求、訊息仍可能晚到；dispatcher 共用同函式，一併受益。現況 lastRunAt 事後才寫（`run-due-schedules/route.ts:47`），這就是要換掉的語意。
- C4 執行時限（補充）：run-due route `maxDuration = 300`（`route.ts:25`）且逐客戶同步 for-loop；site-watch 改為 heartbeat 只挑到期目標、每客戶一個 Trigger.dev task，不在 route 內截圖。
- C5 renderer `/snapshot`：獨立 route，不套 `/render` 的 `SKIPPED_RESOURCE_TYPES`（`server.mjs:88,111` 擋 image/media/font，否則畫面殘缺）；egress 限制照舊。viewport 1366×900、full-page 高度上限 8000px、等 `load` + 最多 15s networkidle、單圖 ≤5MB、renderer 內 snapshot 併發 1。回傳 `{status, finalUrl, consoleErrors[], pageErrors[], screenshotBytes, timingMs, failureCode}`；failureCode 枚舉 `timeout|http_4xx|http_5xx|dns|blocked|too_large|renderer_error`。console 只收 `error` 級 + pageerror。
- C6 比對：首次成功即建基準；pixelmatch threshold 0.1，差異像素 >5% = 視覺警告（預設）。每頁可設遮罩 selector（slice 2）。基準只在操作者按「接受為新基準」時換（預設，不自動換）。
- C7 資料：用專用表 `site_watch_targets`（設定 + lease + `last_completed_run_key` + version）、`site_watch_results`（一行一次）、`site_watch_page_state`（PK `(target_id, page_id, kind)`，kind = `availability|visual`；欄位 `failure_streak`、`last_counted_run_key`、`episode_id`、`alert_state`、`recovery_state`、`incident_id`），不寫 `organizations.metadata.client_config`——現有 writer 是 read-merge-write（`cis/route.ts:88-121`），並行會互蓋。設定更新帶 `version` 樂觀鎖，記 actor。另需 migration 把 `site_watch` 加進 `ops_incidents_source_check`（照 `packages/db/migrations/0031_ops_incidents_deploy_source.sql`）與 `IncidentSource` 型別（`lib/ops-inbox/types.ts:1`）。
- C8 通知（Codex r1 H3 + r2 H1，依 I2）：dispatcher 對 `duplicate` 每 15 分可再發（`rules.ts:29`）、送失敗只記 log 不重送（`dispatcher.ts:65-73`）→ site-watch 不經 dispatcher 發 Telegram：`rules.ts` 加 `source === "site_watch"` → skip（同 deploy），site-watch 自己用 `TelegramNotifier` 送並依回傳改狀態。fingerprint = `site_watch:<org>:<page_id>:<kind>`（failureCode 放 message）。狀態機（每個 page_state 列）：
  - 巡檢失敗（fenced UPDATE）：`last_counted_run_key ≠ run_key` 才 streak+1；streak ≥2 且 `episode_id IS NULL` → 新 `episode_id`、`alert_state='pending'`、`recovery_state='none'`。
  - 巡檢成功：streak=0；有 episode 且 `alert_state IN ('sent','uncertain')` → `recovery_state='pending_resolve'`；`alert_state='pending'`（確定沒送）→ 靜默結束（resolve incident、清 episode、不發任何訊息）。
  - 通知步驟（同一 task、同一租約，每次 heartbeat 都跑）：`alert_state='pending'` → 確保 incident（依 fingerprint 查未結者，有則沿用，無則 `upsertIncidentAtomic`；回寫 `incident_id`）→ 續約，剩餘租期 ≥ chat 數 × 10s + 30s 才送 Telegram（不足 = 本次不送，保持 pending）→ 送出前先寫 `alert_state='uncertain'`（fenced；當掉在送出途中也落在不確定）→ `sent` 寫 `'sent'`；收到 HTTP 4xx（`sendTelegram` 回 `telegram_4xx`）寫回 `'pending'`；其餘失敗（`telegram_5xx`、abort、網路錯誤）保持 `'uncertain'`；多 chat 任一不確定 → 整體不確定。`pending` 與 `uncertain` 下次 heartbeat 都會再送（uncertain 重送可能造成 1 則重複，I2 已接受）；`skipped`（低於最低嚴重度）寫 `'skipped'` 視為終態，恢復時同 pending 靜默。恢復訊息同一套三態（`recovery_state` 送前 `'uncertain'`，只有 sent 才清 episode）。`recovery_state='pending_resolve'` → `UPDATE ops_incidents SET status='resolved', resolved_at, resolved_by='site_watch' WHERE id=? AND status NOT IN ('resolved','ignored') RETURNING`：1 行 → `'pending_send'`；0 行（操作者已手動結案）→ 直接結束。`'pending_send'` → 送恢復訊息，成功才清 episode。（現有 `resolveIncident` `app/(shell)/ops/inbox/actions.ts:29` 是需登入的 server action、無條件 UPDATE，不能直接用，照其欄位新增 server-side 版。）
  - episode 未結束（恢復還沒送完）期間的新失敗只計 streak，不開新 episode；episode 結束時 streak 仍 ≥2 → 下一次失敗開新 episode。
  - 接受新基準／改設定 → streak 歸零（不動已開 episode）。
- C9 清理：同一 heartbeat 每日一次：刪 `site_watch_results` >30 天；R2 key `site-watch/<org>/<page_id>/baseline.png`（單 key 覆寫，單物件 put 為原子）與 `.../evidence/<ts>.png`；evidence >30 天刪，另掃 prefix 刪 DB 未引用且 >1 天的 orphan。刪除失敗下次重掃，不另建重試佇列。
- C10 kill switch：env `SITE_WATCH_ENABLED`（預設 OFF，同 §0 自動化預設 OFF 慣例；改動走 `safe-infra-patch.sh`）。每頁開跑前檢查；進行中的頁跑完（受 15s + 截圖時限）即停。renderer 沿用現有 2G／2 CPU／1024 pids（`docker-compose.yml` renderer deploy.resources）。
- C11 wp-update（slice 2）：更新前 snapshot 失敗 → 記錄、不擋更新、不比對；更新失敗 → 照現有流程；更新後 snapshot 失敗 → 重試 1 次，仍敗 = warning incident；HTTP OK 但 diff 超標 = warning incident，不判更新失敗。SSE 斷線行為沿用現有 route，實作前先讀確認，不改。現有 health 只是 HEAD（`wp-update/route.ts:114-120`）。
- C12 隱私：R2 私有；圖只經 next-admin 已驗證 route 取，短效 signed URL；Telegram 只送文字摘要 + ops 連結，不附圖；存 URL 去 query；只截公開頁。
- 驗收矩陣（slice 1）：正常站 → 無通知、1 行結果；站 500 兩次 → 1 則 Telegram；恢復 → 1 則恢復訊息；同時觸發兩次 heartbeat → 只跑一次；kill switch OFF → 0 次 renderer 呼叫；31 天前 evidence 被刪、baseline 保留。另加（Codex r1/r2）：
  - 同一天多次排程：daily 目標（hour_utc=22），假時鐘從 22:00 起跑 24 次 heartbeat → renderer 1 次、每頁 1 行；22:00–23:59 全部 heartbeat 失效 → 隔天 00:00 補跑 1 次，run key 仍是前一桶。
  - 任務當掉後重跑：搶到租約後強制中止 → 租約內再觸發 = 跳過；到期後觸發 = 新 gen 重跑、結果 1 行、streak 只 +1。舊執行者（gen 舊、跑得慢）在新執行者之後才寫 → 0 行生效。
  - 連續失敗不重複通知：hourly 目標連 6 次 500 → streak=6、incident 1 張、Telegram 1 則；恢復 → 1 則；再連敗 2 次 → 新 episode 1 則；操作者先手動結案再恢復 → 0 則。
  - 通知送失敗（Codex r2 H1）：Telegram 假回 failed 3 次再成功 → 第 4 次 heartbeat 才送出，總共 1 則成功；送 failed 期間站已恢復 → 0 則（alert 從未送達即靜默結束）。
  - Telegram 卡住／結果不確定（Codex r3 H1 + r4 H1）：mock 掛住不回 → 10s abort → `alert_state='uncertain'`；期間站恢復 → 仍送 1 則恢復（不靜默）；mock 回 HTTP 400 → `'pending'`，期間恢復 → 0 則；mock 回 500 → `'uncertain'`、下次 heartbeat 重送。剩餘租期不足時 → 不發請求、狀態不變。驗收標準 = 任何路徑都不出現「有告警、無恢復」，允許最多 1 則重複。
  - 連續 3 天無 heartbeat（Codex r3 M1）：daily 目標，假時鐘跳過 3 個桶後恢復 → 只跑 1 次（當前桶）、`skipped_buckets=2`、之後同桶不再跑。
- Rollback：`SITE_WATCH_ENABLED=false`；新表與 `/snapshot` 不影響既有 collection 與 `/render`。
