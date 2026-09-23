# SITE-WATCH — 客戶網站巡檢（Playwright）MASTER PLAN（唯一計畫正本）

> **這份是什麼**：客戶網站巡檢系統的完整計畫——範圍與分期（Slice 1／Slice 2／P2／P3）、操作者決策、架構、合約（I1–I3、C1–C12）、驗收矩陣、現況、下一步、回滾。**其他檔一律連結此檔、不複述**：`lobster-factory/packages/db/migrations/0091_site_watch.sql` 檔頭只鏡射 I1–I3（schema 自述；改動兩處同步）；`agency-os/TASKS.md §I` 一列 = 進度指針；`agency-os/WORKLOG.md` = 過程。
> **給 AI 的開工指南**：接到「site-watch／網站巡檢／Playwright 巡檢」→ 讀 §0 現況 → 照 §7 下一步做；設計問題查 §3–§4；產品問題查 §2，**不重問**；Slice 2 以後查 §8。
> **建立** 2026-09-23（整併 09-21 plan／progress 兩份 + 實作事實）。**最後更新** 2026-09-23。
> 路徑：`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`；`WF` = `lobster-factory/packages/workflows`；`DB` = `lobster-factory/packages/db`；`RENDERER` = `lobster-factory/infra/hetzner-phase1-core/apps/renderer`。

## 0. 現況（每次改動更新此段）
| 項 | 狀態（2026-09-23） |
|---|---|
| Slice 1 程式 | ~70% 已 commit `deab0f709`（2026-09-21）：DB migration + harness、renderer `/snapshot`、next-admin `lib/site-watch/*` + 6 個 route、Telegram 三態送達 |
| Slice 1 已驗 | harness 綠（apply／down／re-apply）；renderer `npm test` 16/16；next-admin `npx tsc --noEmit` 綠；RPC `p_*` 參數名 vs 0091 簽名 16/16 一致（手動比對） |
| Slice 1 未做 | 單元測試、Trigger task、UI 卡、env 接線、`/snapshot` 真瀏覽器實測、非作者模型 review、prod 全部（§7） |
| Slice 2／P2／P3 | 未開始（§8） |
| 待決 | D1 visual 告警是否進 Telegram（§6） |

## 1. 目標與分期
**目標**：客戶網站掛了、JS 壞了、畫面走樣，操作者在上班前收到一則 Telegram；正常時系統零聲音；證據可在客戶頁看到；30 天自動清；一個開關全關。

| 期 | 內容 | 狀態 |
|---|---|---|
| **Slice 1** | 每客戶 1 URL（`client_config.site_url` 首頁）、daily（22:00 UTC 桶）、`/snapshot`、pixelmatch、incident（連 2 次）+ Telegram 告警／恢復各 1 則、30 天清理、kill switch、客戶頁設定卡 | 程式 70%，未上線 |
| **Slice 2** | 多頁（手填 ≤10／客戶）、hourly／every_6h／update_only、每頁遮罩 selector、總覽表（未開巡檢標黃）、wp-update 前後比對（C11）、OnboardWizard「網站巡檢」＋MainWP 接線、「MainWP 有、系統沒有」安全網清單 | 未開始 |
| **P2** | 登入後流程：另開容器帶憑證（vault）、只連自己與客戶網域 | 未開始 |
| **P3** | sg-deploy 後瀏覽器 smoke（JS 錯誤 → rollback） | 未開始 |

## 2. 操作者已拍板（產品決策，勿重問；2026-09-21）
- 設定入口 = 客戶頁 `/ops/clients/[slug]` 一張「網站巡檢」卡；按鈕／核取方格／chips，**禁 `<select>`**；選取預設多選。
- 新客戶預設開、每天 1 次；電商與 app.aware-wave.com 每小時（Slice 1 由操作者在卡片改 hourly）。頻率 chips：每小時／每 6 小時／每天／只在更新時（後者 Slice 2）。
- 正常不出聲、不產日報；失敗才 Telegram：同一問題一次、恢復一次、連續 2 次失敗才報。週摘要預設關。
- 不留垃圾：基準圖每頁只留最新 1 張；正常結果只記一行、30 天自動刪；失敗證據 30 天自動刪。
- 總覽表列全部網站狀態，未開巡檢者標黃（Slice 2）。
- 負擔上限：沿用 renderer 現有 2G／2 CPU／1024 pids；全域 kill switch。
- 自建網站接入唯一動作 = 在系統新增客戶（填網址）；OnboardWizard 加「網站巡檢」項預設勾（Slice 2）。

## 3. 架構（實作即 SSOT；`file:line` 以 2026-09-23 為準）
### 3.1 資料流
Trigger.dev 每小時 heartbeat（**未寫**，§7 步 3）→ `POST /api/internal/site-watch/due`（bearer `SITE_WATCH_INGEST_TOKEN`；kill switch OFF → 空；`site_watch_sync_targets()` 為每個 active org 且 `client_config.site_url` 為 http(s) 建 target，預設 enabled／daily／22；回「到期 ∪ 欠通知」target id）→ 每 target 一個 child task → `POST /api/internal/site-watch/run/<id>` → `NA/lib/site-watch/runner.ts runTarget()` :52：claim lease → retire 不在清單的頁 → 到期則每頁 renew → renderer `/snapshot` → 比對 → `site_watch_record_check` → `site_watch_complete_run` → 通知步驟（`notify.ts runNotifications` :69）→ release。另每小時 `POST /api/internal/site-watch/cleanup`（每 UTC 日實跑一次）。
**為何 Trigger 只做薄層**：renderer 只掛 `renderer-net`，只有 next-admin 連得到（`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:522`）。同 collect 模式（`WF/src/trigger/collect-scheduled-crawl.ts` 檔頭）。

### 3.2 元件
| 元件 | 檔 | 職責 |
|---|---|---|
| Schema + 狀態機 | `DB/migrations/0091_site_watch.sql`；down `DB/scripts/0091_site_watch_down.sql`；harness `DB/scripts/site-watch-local-verify.{sh,sql}` | 4 表；所有狀態寫入 = fenced plpgsql（`site_watch__hold` 持 target row lock + lease 檢查）；不變量 = CHECK |
| Renderer | `RENDERER/server.mjs`（`snapshot()` :192、常數 :52-60）、`lib.mjs`（failure codes :132）、`test/lib.test.mjs` | `POST /snapshot`：全頁 JPEG q80、1366×900、高 ≤8000、load 15s／idle 15s／shot 30s、≤5MB、snapshot 併發 1；沿用 egress policy／非 root／cap_drop |
| Telegram 三態 | `NA/lib/ops-inbox/notify/telegram.ts`（`sendTelegram` :173、`TELEGRAM_SEND_TIMEOUT_MS` :29、`combineDeliveries` :36、`sendText` :61、`buildOperatorTelegramNotifier` :97） | 2xx sent／4xx rejected／5xx·abort·網路 uncertain；fetch 本身 `AbortSignal.timeout(10s)`；dispatcher 同一 builder |
| Incident source | `NA/lib/ops-inbox/types.ts`（`site_watch`）、`notify/rules.ts`（skip `site_watch_direct_notify`）、`lib/repair-center/policy.ts`（`human_only`）、`app/api/ops/inbox/incidents/route.ts`、`app/(shell)/ops/inbox/components/IncidentCard.tsx` | ops-inbox 認得 `site_watch`；dispatcher 不重送 |
| R2 通用傳輸 | `NA/lib/storage/r2.ts`（`r2PutObject/r2GetObject/r2DeleteObject/r2ListObjects`） | Cloudflare REST；designs 函式改委派，錯誤碼不變 |
| 核心 lib | `NA/lib/site-watch/`：`config`／`runKey`／`pages`／`diff`／`storage`／`rendererClient`／`store`（只呼叫 RPC）／`messages`／`notify`／`runner`／`objects`／`cleanup`／`console`／`wiring` | 純函式 + 編排；DB 只經 `store.ts` |
| Routes | `NA/app/api/internal/site-watch/{due,run/[targetId],cleanup}/route.ts`；`NA/app/api/ops/clients/[slug]/site-watch/{route,accept-baseline/route,image/route}.ts` | 內部 = bearer；操作者 = `resolveOpsRole`，寫入需 owner/admin |
| 排程 | **未寫** `WF/src/trigger/site-watch.ts`（§7 步 3） | heartbeat + per-target child |
| UI | **未寫** `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（§7 步 4） | 設定卡 |

### 3.3 重用（已查證，不建新輪子）
排程模式 = collect（`NA/app/api/internal/collect/run-due-schedules/route.ts`、`WF/src/lib/collection/postRunDueSchedules.ts`）；incident = `NA/lib/ops-inbox/upsertIncidentAtomic.ts`；瀏覽器 = 既有 renderer 容器（不另開）；儲存 = `r2.ts`；UI 慣例 = `NA/app/(shell)/ops/collect/CollectionSourcesPanel.tsx` `ScheduleControls`。既有 e2e `lobster-factory/infra/hetzner-phase1-core/tests/e2e/client/wp-site-health.spec.ts` 保留為手動工具，不搬進 prod。

## 4. 合約
### 4.1 不變量（鏡射於 0091 檔頭）
- **I1 單一有效執行者**：任一時刻對同一 target 的狀態寫入只有一個執行者生效。每次取得執行權都換新 `lease_gen`；每筆寫入在同一交易內驗「gen 是我的且未過期」（`site_watch__hold`）。對外副作用（Telegram）只在「剛 renew 成功且剩餘租期 ≥ chat 數 × 10s + 30s」才開始；但這**不是**保證——請求送出後 abort 只停止等待，Telegram 仍可能收下，`sendMessage` 無 idempotency key。所以送達正確性不靠 fence，由 I2 的「不確定」狀態承擔。截圖可重複，狀態不可。
- **I2 通知 = 狀態，不是事件**：「該發」先落 DB（`pending`）；送出前寫 `uncertain`；「已發」只在送達回傳後寫 `sent`。三種結果：確定送達（2xx）、確定沒送（4xx 或根本沒發出）、**不確定**（5xx／abort／網路錯誤／送出後當掉）。不確定一律當「可能已送達」。代價 = at-least-once：最多多收 1 則重複或延遲訊息（已接受）。
- **I3 一段問題一組訊息**：一個 episode（連 2 次失敗 → 恢復送完）告警與結束成對：只要告警可能已送達（sent／uncertain），一定補結束訊息；只有確定沒送（pending／skipped）的告警才允許 0 則結束。結束原因 `recovered|disabled|page_removed`。保證「不會只收到告警、永遠等不到恢復」；不保證不重複。

### 4.2 C1–C12（as implemented；Slice 2 項標註）
- **C1 頁面**：Slice 1 = `client_config.site_url` 首頁；canonical = 小寫 scheme/host、去 query/fragment、去尾斜線；page_id = sha256(canonical)[0:16]（`pages.ts`）。Slice 2：手填清單 ≤10 頁／客戶；不做 crawl／sitemap。
- **C2 排程桶**（`runKey.ts`）：不重用 `lib/collect/schedule.ts`（只有 daily|weekly）。hourly = `sw-<target>-<YYYYMMDDHH>`；every_6h = `sw-<target>-<YYYYMMDD>-q<floor(H/6)>`；daily = `sw-<target>-d<YYYYMMDD of (now − hour_utc h)>`（桶 = 從 hour_utc 起算 24h，錯過設定時刻的後續 heartbeat 會補跑，同桶只一次）；update_only（Slice 2）= `sw-<target>-upd-<ops_action_run_id>`。語意：每桶最多一次、只跑當前桶、不補歷史桶；停擺跨桶時 `skipped_buckets` = 中間漏掉桶數。`hour_utc` 預設 22（台北 06:00）。冪等 = `site_watch_results UNIQUE(target_id, run_key, page_id)`：只有插入成功那次動 page_state。heartbeat 每次挑「到期 ∪ 欠通知」。
- **C3 租約**（`site_watch_claim/renew/release`）：搶 = `lease_gen+1, lease_until=now+window WHERE lease_until IS NULL OR < now`，0 行 = 跳過；每次搶都新 gen。window = `leaseWindowSeconds(pages)` = min(900, max(300, pages×90+120))。每頁開跑前 renew，0 行 = 被接手、立即停。所有狀態寫入經 `site_watch__hold`（過期舊執行者 0 行）。Trigger task `maxAttempts=1`：當掉靠租約到期後下一次 heartbeat 重搶（最長延遲 = window + 1h）。Telegram 硬逾時在 fetch 本身。
- **C4 執行時限**：一 target 一次 route 呼叫（`run/[targetId]` `maxDuration=300`），heartbeat 不在 route 內迴圈客戶。
- **C5 renderer `/snapshot`**：獨立 route，不套 `/render` 的 `SKIPPED_RESOURCE_TYPES`（否則畫面殘缺）；egress 同 `/render`。回 `{ok, status, finalUrl（去 query）, failureCode, detail, consoleErrors[], pageErrors[], screenshotBase64, screenshotBytes, screenshotSkipped, timingMs}`；failureCode ∈ `timeout|http_4xx|http_5xx|dns|connect|blocked|navigation`（null = 站點正常）；console 只收 error 級 + pageerror，各 ≤20 條 ≤300 字；`too_large`／截圖失敗 ≠ 站點失敗 → `screenshotSkipped`。renderer 對 `url_*` 回 400 → next-admin 視為站點 `blocked`（網址設定錯）。renderer 掛掉／逾時 = 監控自身故障（`RendererUnavailable`）：不記 result、不算 streak、run 不 complete、同桶下次重試、Trigger run 標紅 + Sentry。
- **C6 比對**（`diff.ts`）：首次成功即建基準；pixelmatch threshold 0.1；差異像素（含高度差列）> 5% = visual 失敗；寬度不同 = ratio 1（capture 變了，提示重建基準）。基準只在操作者按「接受為新基準」時換（`site_watch_accept_baseline`，只歸零 visual streak）。每頁遮罩 selector = Slice 2。
- **C7 資料**：專用表 `site_watch_targets`（設定 + lease + `last_completed_run_key/_bucket_start` + `version`）、`site_watch_results`（一行一次）、`site_watch_page_state`（PK `(target_id, page_id, kind)`，kind ∈ `availability|visual`；`failure_streak/episode_id/alert_state/recovery_state/recovery_reason/incident_id/baseline_*`）、`site_watch_maintenance`（cleanup 單例）。**不寫** `organizations.metadata.client_config`（read-merge-write 會互蓋）。設定更新 = `site_watch_update_config` 帶 `version` 樂觀鎖、記 actor、任何改動 streak 歸零、關閉 → 開著的 episode 以 `disabled` 結束。`ops_incidents_source_check` 加 `site_watch`（基底 0073 值）；`IncidentSource` 型別同步。RLS：service_role only。
- **C8 通知**（`notify.ts` + 0091 `site_watch_notify_begin/finish`、`site_watch_resolve_for_recovery`）：dispatcher 對 `source='site_watch'` skip；site-watch 自己用 `TelegramNotifier.sendText`。fingerprint = external_id = `site_watch:<org>:<page_id>:<kind>`（`ops_incidents` 有 UNIQUE(source, external_id) `0013_ops_inbox.sql:54` 與 UNIQUE(fingerprint, environment)）；新 episode 以 `upsertIncidentAtomic(…, isReopen=true)` 重開同一列。狀態機（每 page_state 列）：
  - 巡檢失敗：streak+1；streak ≥2 且無 episode → 新 `episode_id`、`alert_state='pending'`。episode 結束中（recovery 進行）的新失敗只計 streak；結束後 streak 仍 ≥2 → 下一次失敗開新 episode。
  - 巡檢成功：streak=0；有 episode 且 alert ∈ {sent, uncertain} → `recovery_state='pending_resolve'`；alert ∈ {pending, skipped} → 靜默結束（resolve incident、清 episode、0 則）。
  - 通知步驟（同一 lease，每次 heartbeat）：`pending` → 確保 incident（`incident_id` 空則 upsert + `site_watch_attach_incident`）→ renew，剩餘 ≥ chats×10s+30s 才送（不足 = `deferred`，狀態不變）→ 送前 `uncertain` → 結果 sent→`sent`／4xx→`pending`／其餘保持 `uncertain`（下次重送，最多多 1 則）。Telegram 關閉或低於 min severity → `skipped`（終態，恢復靜默）。可用性 severity=high、visual=medium（D1 待決）。
  - 恢復：`pending_resolve` → `UPDATE ops_incidents SET status='resolved', resolved_by='site_watch' WHERE id=? AND status NOT IN ('resolved','ignored')`：1 行 → `pending_send`；0 行（操作者已手動結案）→ 清 episode、0 則。`pending_send` → 送恢復訊息（同三態），只有 `sent` 才清 episode。
- **C9 清理**（`cleanup.ts`；每 UTC 日一次 `site_watch_claim_daily_cleanup`）：刪 `site_watch_results` >30 天；R2 key `site-watch/<org>/<page_id>/baseline.jpg`（單 key 覆寫）與 `.../evidence/<ts>-<rand>.jpg`／`-diff.jpg`；掃 prefix 刪 DB 未引用且 >24h 的 orphan（含無 live baseline 的 baseline.jpg）；`lastModified` 未知不刪；刪失敗明天再掃，無重試佇列。不受 kill switch 影響（保留期承諾）。
- **C10 kill switch**：env `SITE_WATCH_ENABLED`（預設 OFF，AGENTS.md §0 慣例；prod 改動走 `safe-infra-patch.sh`）。`due` 回空；runner 每頁開跑前檢查，進行中的頁跑完即停；通知步驟也停。target rows 預設 `enabled=true`（操作者決策）。renderer 資源沿用 compose 現值。
- **C11 wp-update 前後比對（Slice 2）**：掛進 `NA/app/api/ops/clients/[slug]/wp-update/route.ts`（SSE；現況 health 只是 HEAD :120）。更新前 snapshot 失敗 → 記錄、不擋更新、不比對；更新失敗 → 照現有流程；更新後 snapshot 失敗 → 重試 1 次，仍敗 = warning incident；HTTP OK 但 diff 超標 = warning incident，不判更新失敗。run key `sw-<target>-upd-<ops_action_run_id>`。SSE 斷線行為沿用現有 route，實作前先讀確認，不改。
- **C12 隱私**：R2 私有 bucket `R2_SITE_WATCH_BUCKET`（**無預設**；designs bucket 是公開的；未設 = 只做可用性，visual 記 `storage_unconfigured`）；Cloudflare REST 無 signed URL → 圖只經已驗證 route `…/site-watch/image?result=<id>&which=evidence|diff` / `?page=<id>&which=baseline`，以 row id 定址、不接受 object key；Telegram 只送文字摘要 + ops 連結；存 URL 去 query；只截公開頁。

## 5. 驗收矩陣（Slice 1）
| # | 情境 | 期望 | 驗於 |
|---|---|---|---|
| 1 | 正常站 | 無通知、每桶 1 行結果 | ✅ harness（record/complete）；⬜ prod §7 步 8f |
| 2 | 站 500 兩次 | 1 張 incident、1 則 Telegram | ✅ harness（state）；⬜ prod |
| 3 | 恢復 | 1 則恢復訊息、incident resolved、episode 清 | ✅ harness |
| 4 | 兩個 heartbeat 同時觸發 | 只跑一次（第二個 claim NULL） | ✅ harness |
| 5 | kill switch OFF | 0 次 renderer 呼叫 | ⬜ vitest runner（§7 步 5）；⬜ prod 8g |
| 6 | 31 天前 evidence 刪、baseline 保留 | 同左 | ✅ harness（purge）；⬜ vitest cleanup |
| 7 | daily 目標 22:00 起 24 次 heartbeat | renderer 1 次；22–23 時失效 → 次日 00:00 補跑、key 仍前一桶 | ⬜ vitest runKey |
| 8 | 任務當掉重跑 | 租約內再觸發跳過；到期後新 gen 重跑、結果 1 行、streak 只 +1；舊執行者寫入 0 行 | ✅ harness（fence／duplicate） |
| 9 | hourly 連 6 次 500 | streak 6、incident 1、Telegram 1；恢復 1；再連敗 2 → 新 episode；操作者先手動結案再恢復 → 0 則 | ✅ harness |
| 10 | Telegram 4xx 三次後成功 | 第 4 次才送、總 1 則；期間站恢復 → 0 則 | ✅ harness（rejected→pending→silent） |
| 11 | Telegram 卡住／5xx | 10s abort → `uncertain`；期間恢復仍送 1 則恢復；4xx → `pending`、恢復 0 則；租期不足 → 不發、狀態不變 | ✅ harness（uncertain 路徑）；⬜ vitest telegram/notify（abort、deferred） |
| 12 | 連續 3 天無 heartbeat | 只跑 1 次、`skipped_buckets=2`、同桶不再跑 | ⬜ vitest runKey |
| 13 | RPC 參數名 vs 0091 簽名 | 全部相等 | ✅ 手動 16/16；⬜ vitest rpc-contract（§7 步 2） |
| 14 | `/snapshot` 真實頁 | example.com → `failureCode:null` + JPEG；404 → `http_4xx`；不存在網域 → `dns`；`/render` 未退化 | ⬜ §7 步 1 |
標準：任何路徑都不出現「有告警、無恢復」；允許最多 1 則重複。

## 6. 風險與待決
- **D1（操作者決定）**：Slice 1 visual 告警現況會送 Telegram（`notify.ts severityOf()` visual=medium ≥ 預設 min `medium`）。WP 站輪播／日期等每天可能 >5% → 噪音。建議 Slice 1 visual 降 `low`（改 `messages.ts incidentDraft` + `notify.ts severityOf` 兩處）→ 只開 incident、Telegram `skipped`；Slice 2 加遮罩後升回 `medium`。未回覆 = 照現況。
- R1 Telegram at-least-once：最多 1 則重複（已接受）。
- R2 lease window 下限 300s = run route `maxDuration`；route 被砍時最長延遲 = window + 1h（已接受）。
- R3 `IncidentSource` 型別本就缺 `collection`（`NA/lib/collect/report-store.ts:169` 繞過型別）——既有漂移；補時同步 `policy.ts` catalog。
- R4 org 轉 inactive 後其開著的 episode 收不到結束訊息（`runner.ts` monitored=false 不跑 retire）→ Slice 2 補或接受。
- R5 R2 list `last_modified` 欄位名未對 prod 實測；缺值時 cleanup 保守不刪 → prod 首次 cleanup 後查 `deletedObjects`。
- 風險等級：renderer 新 endpoint 上線、compose env、Trigger deploy、migration 皆 **High**（§7 步 8 逐項 go-ahead）。
- 工具坑：Bash 呼叫 `.ps1` 用正斜線；bash heredoc 餵 python 本機會失敗（寫 scratch 檔）；測試產物寫 `$env:TEMP`（auto-checkpoint hook 會 commit repo 內 dirty 檔）；從 `D:\Work` 根 grep 看不到 `.claude/` junction；本機無 `pwsh` 用 `powershell.exe`；Codex 接手時 hooks 可能未 trust（AGENTS.md §4）→ 手動等價執行 git log／風險分級／驗證／WORKLOG／commit。

## 7. 下一步（Slice 1 收尾；順序 = 最大未知先殺 → 最短路徑到 prod → 補測試）
步驟 1–7 本機 Low/Medium 直接做；步驟 8 每一子項 High、逐項等操作者 go-ahead。review 由**非作者模型**做（Claude 寫 → `/codex-review`；Codex 寫 → `/claude-review`）。

1. **renderer 真實測試（~10 分鐘）**：`cd RENDERER && docker build -t sw-renderer-test .`；`docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SETUID --cap-add SETGID --cap-add SETPCAP -e RENDERER_SHARED_SECRET=t -p 127.0.0.1:3999:3000 sw-renderer-test`；`curl -s -X POST localhost:3999/snapshot -H 'x-renderer-secret: t' -H 'content-type: application/json' -d '{"url":"https://example.com"}'` → `failureCode:null`、`screenshotBytes>0`、base64 解出檔頭 `FF D8`（**打開看圖**）；`https://example.com/nope` → `http_4xx`；`https://no-such-host-xyz.invalid` → `dns`；再打 `/render` 確認未退化。不符 → 先修 `server.mjs snapshot()`。
2. **RPC 契約測試** `NA/lib/site-watch/__tests__/rpc-contract.test.ts`：解析 0091 每個 `CREATE OR REPLACE FUNCTION public.site_watch_*(…)` 的 `p_*` 集合，對照 `store.ts`／`console.ts`／`cleanup.ts` 每個 `rpc("site_watch_*", {…})` 的 key 集合（`stateArgs()` 展開 p_target／p_gen／p_page／p_kind／p_episode）必須相等且函式存在。守 PGRST202 類（參數名錯 = runtime 才炸；WORKLOG 0055 兩週停擺前例）。
3. **Trigger.dev + env**：
   - `WF/src/lib/siteWatch/post.ts`（仿 `src/lib/collection/postRunDueSchedules.ts`；env `SITE_WATCH_INGEST_TOKEN` + `AWAREWAVE_WEBHOOK_BASE_URL`；POST due／run/<id>／cleanup；測試仿 `postRunDueSchedules.test.ts`）。
   - `WF/src/trigger/site-watch.ts`：`schedules.task` id `site-watch-heartbeat` cron `5 * * * *` → post due → 每 id `siteWatchRun.trigger({ targetId })` → post cleanup；`task` id `site-watch-run`、`retry: { maxAttempts: 1 }`、`result.status === "renderer_unavailable"` 時 throw；仿 `collect-scheduled-crawl.ts` 的 `captureWorkflowException`；`src/trigger/index.ts` export。
   - `WF/trigger.config.ts:55-56` 旁加 `SITE_WATCH_INGEST_TOKEN` syncEnvVars；`lobster-factory/infra/trigger/TASK_REFERENCE.md`（env 表 :29 旁 + task 段 :232 旁）；`scripts/lobster-trigger-deploy.ps1` 仿 `COLLECT_SCHEDULE_INGEST_TOKEN`（讀 VPS `.env` :56-62、export :134）。
   - repo `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` next-admin `environment:`（:275 旁）加 `SITE_WATCH_ENABLED: ${SITE_WATCH_ENABLED:-}`、`SITE_WATCH_INGEST_TOKEN: ${SITE_WATCH_INGEST_TOKEN:-}`、`R2_SITE_WATCH_BUCKET: ${R2_SITE_WATCH_BUCKET:-}`；`.env.example`（:84-87 旁）同步。repo compose 只是對照，prod 由 8d 套。
4. **UI 卡** `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（"use client"），插入 `ClientHubTabs.tsx` `MaintenanceTab`（:747）最上方；**不要**寫進 2896 行的 ClientHubTabs；樣式沿用 `Card` :181、`ChipBtn` :235。GET/PATCH `/api/ops/clients/<slug>/site-watch`；PATCH `{expectedVersion（target null 時 0）, enabled, frequency, hourUtc}`，409 → 重新 GET 提示「別人剛改過」。
   - 4a 最小：`globallyEnabled=false` 黃條「SITE_WATCH_ENABLED 未開，目前不會巡檢」；`storageConfigured=false` 提示；開關 checkbox；頻率 chips；時間 input（UTC，旁註台北 +8）；每頁 availability／visual 的 streak／alert_state／recovery_state；最近 10 筆文字列（時間、HTTP、failureCode 中文、JS 錯誤數）。failureCode 中文 map 從 `messages.ts` 移到無 import 的 `lib/site-watch/labels.ts` 供 server/client 共用。
   - 4b 證據：`evidence_key`／`diff_key` → `<img src="/api/ops/clients/<slug>/site-watch/image?result=<id>&which=evidence|diff">`；visual episode 開著 → 「接受為新基準」POST `accept-baseline {pageId}`。
5. **單元測試** `NA/lib/site-watch/__tests__/`（vitest，仿 `NA/lib/collect/__tests__/`）。優先：`runKey`（矩陣 #7、#12 + key 格式）、`notify`（fake store：notifier null→skipped；renew 不足→deferred 且不 begin；begin false→stale；rejected→finish('rejected')；closed_by_operator→不送）、`runner`（fake deps：矩陣 #5；RendererUnavailable→不 record/complete；fenced→lease_lost 且 release 仍呼叫；正常→complete 1 次）。其次：`telegram`（`NA/lib/ops-inbox/notify/__tests__/`：mock fetch 200/400/500/abort；combineDeliveries 三組合）、`pages`、`diff`（sharp 合成 100×100：相同 0、半張反色 ≈0.5、高度差計入）、`cleanup`（>30d orphan 刪；被引用不刪；live baseline 不刪；lastModified null 不刪；claim false 不動）。跑 `cd NA && npx vitest run lib/site-watch lib/ops-inbox/notify`，再全套（基準 1462 pass／13 skip）。突變證據：0091 `site_watch__apply` `>= 2`→`>= 3` → harness 紅；`notify.ts:61` 拿掉 deferred → 指名測試紅；皆還原。
6. `scripts/playwright-runner.ps1:8` `Also called post-deploy by sg-deploy hooks (Mode=smoke only)` 為假 → 改「Called only by the /playwright skill」。
7. **四動作 + WORKLOG + commit**：`npx tsc --noEmit`、`npx vitest run`、harness、renderer `npm test`；review artifact 落 `agency-os/reports/oracle/`；BUGHUNT grep `sendTelegram|TelegramNotifier|buildOperatorTelegramNotifier|IncidentSource|ops_incidents_source_check|putDesignObject|deleteDesignObject|SITE_WATCH_` scope `agency-os,scripts,lobster-factory`；WORKLOG 四行機械證據（AGENTS.md §1）。commit 被 verify gate 擋 → `/verify-recent` 或 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1`。
8. **prod（High；每項首行 `# CONFIRMED-HIGH-RISK: <reason>`；逐項 go-ahead）**：
   - a. 建私有 R2 bucket（例 `lobster-site-watch`，**不開 public dev URL**）；VPS `/root/lobster-phase1/.env` 加 `R2_SITE_WATCH_BUCKET`、`SITE_WATCH_INGEST_TOKEN=$(openssl rand -hex 32)`、`SITE_WATCH_ENABLED=false`。
   - b. `node scripts/apply-db-migration.mjs --check 0091` → `node scripts/apply-db-migration.mjs 0091`。**先於 c**：`cleanup` route 不受 kill switch 保護，部署後每小時會碰新表。
   - b2. **解除 deploy hold**：`git rm lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` + push。2026-09-23 設的（commit `8aa473d63`），在這之前 `sg-deploy.sh` 步驟 1.85 會拒絕**所有** app 部署（含手動跑），c 必定失敗。機制見 `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md §1.5`。
   - c. 主機 `/root/lobster-phase1/scripts/sg-deploy.sh renderer next-admin`（renderer 在 RESTORABLE_APPS `:116`、node gate `:215-225`、真實 render smoke `:476-491`；next-admin tsc + vitest gate）。後驗 `docker exec lobster-renderer iptables -L OUTPUT -n | head` egress 仍在。
   - d. prod compose env：`printf '<environment 區塊>' | /root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/lobster-phase1/docker-compose.yml next-admin`；驗 `docker exec <next-admin> printenv SITE_WATCH_INGEST_TOKEN R2_SITE_WATCH_BUCKET SITE_WATCH_ENABLED`（唯一可信方式）。
   - e. `scripts/lobster-trigger-deploy.ps1`（PAT = `tr_pat_*`）。
   - f. `SITE_WATCH_ENABLED=true`（safe-infra-patch）→ Trigger dashboard 手動 trigger `site-watch-heartbeat`。**預期首次全跑**：每 target 的 daily 桶尚無 `last_completed_run_key` → 全部立刻到期（snapshot 併發 1，N 客戶 ≈ N×40s）。驗：`site_watch_targets` 每 active org 一列、`site_watch_results` 每 target 1 列、R2 有 baseline.jpg、卡片顯示、Telegram 0 則（掛站也要第二桶才報）。
   - g. 關回 `false` 再手動 trigger → `due` 回 `enabled:false`、renderer log 無 snapshot 行 → 再開 `true` 留著。更新 §0。

## 8. Slice 2／P2／P3 設計備忘（動工時展開成 §7 同格式）
- **多頁**：`site_watch_targets` 加 `pages jsonb`（≤10 canonical URL）或子表；`pagesForSiteUrl` → `pagesForTarget`；`retirePages` 已支援。
- **頻率**：API 開放 `update_only`；C2 key 已定。
- **遮罩 selector**：每頁 `mask_selectors text[]`；renderer `/snapshot` 接 `masks[]`，截圖前 `page.evaluate` 蓋住；C6 門檻不變。
- **總覽表**：`/ops/clients` 列表加狀態欄；未開巡檢標黃；資料 = `site_watch_targets` ⋈ `site_watch_page_state`。
- **C11 wp-update 前後比對**：見 §4.2 C11；掛點 `NA/app/api/ops/clients/[slug]/wp-update/route.ts`。
- **MainWP 接線**：`addSiteToMainWp`（`WF/src/integrations/integration-steps.ts:371`，已對齊 MainWP 6.0.12：`sites/add`、Basic auth、`url/name/admin/uniqueid`；commit `7faa4f68a`／`363a505f4`）；OnboardWizard `PROVIDERS`（`NA/app/(shell)/onboard/OnboardWizard.tsx:69`）尚無 MainWP 與「網站巡檢」項 → 加兩項、預設勾。安全網：「MainWP 有、系統沒有」清單需新增唯讀 MainWP 站點清單讀取（next-admin 現無）。
- **R4 補洞**：org inactive → runner 仍跑 retire／結束訊息（或 sync 時對 inactive org 走 `disabled`）。
- **P2 登入後流程**：另開容器（不共用 renderer）帶憑證；憑證走 vault（`client_credentials` + `lib/secret-vault.ts`）；egress 只允許自己與客戶網域；High。
- **P3 部署後 smoke**：sg-deploy 後對 app.aware-wave.com 關鍵頁 `/snapshot`，pageErrors >0 → 觸發 rollback；掛在 `sg-deploy.sh` 步 7 smoke 段。

## 9. 回滾
`SITE_WATCH_ENABLED=false`（立即停，0 renderer 呼叫）→ Trigger 停 `site-watch-heartbeat` → `git revert` → `DB/scripts/0091_site_watch_down.sql`（會刪 source='site_watch' 的 incidents）。renderer `/render` 與 collect 路徑不受影響（`withContext` 重構有 renderer test + §7 步 1 實測）。

## 10. 文件關係與變更紀錄
- 本檔 = 計畫正本；`0091_site_watch.sql` 檔頭 = I1–I3 鏡像 + 指回本檔；`TASKS.md §I` 一列 = 進度指針；WORKLOG = 過程；`agency-os/reports/oracle/2026-09-21-review-*.md` = 09-21 四輪 Codex 對舊 plan 的審查（歷史）。
- 2026-09-21：`handoffs/2026-09-21-site-watch-plan.md`（設計 + 4 輪 Codex 修訂）、`handoffs/2026-09-21-site-watch-slice1-progress.md`（進度 + 13 項偏差）——已廢止，可自 commit `80b7897e6` 取回。
- 2026-09-23：`handoffs/2026-09-23-1116-site-watch-slice1.md`（合規 packet）——已併入本檔並刪除，可自 `76a0a2e3f` 取回。操作者要求「一份完整的」→ 本檔。
