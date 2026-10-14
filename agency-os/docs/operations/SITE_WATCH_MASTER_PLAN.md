# SITE-WATCH — 客戶網站巡檢（Playwright）MASTER PLAN（唯一計畫正本）

> **這份是什麼**：客戶網站巡檢系統的完整計畫——範圍與分期（Slice 1／Slice 2／P2／P3）、操作者決策、架構、合約（I1–I3、C1–C12）、驗收矩陣、現況、下一步、操作手冊、回滾。**其他檔一律連結此檔、不複述**：`lobster-factory/packages/db/migrations/0091_site_watch.sql` 檔頭只鏡射 I1–I3（schema 自述；改動兩處同步）；`agency-os/TASKS.md §I` 一列 = 進度指針；`agency-os/WORKLOG.md` = 過程。
> **給 AI 的開工指南**：接到「site-watch／網站巡檢／Playwright 巡檢」→ 讀 §0 現況 → 照 §7 下一步做；設計問題查 §3–§4；產品問題查 §2，**不重問**；告警處置查 §11；Slice 2 以後查 §8。
> **建立** 2026-09-23（整併 09-21 plan／progress 兩份 + 實作事實）。**最後更新** 2026-09-23（v2.6：§7 步 1–8 + D1 執行結果、D2 待決；§10 變更紀錄）。
> 路徑：`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`；`WF` = `lobster-factory/packages/workflows`；`DB` = `lobster-factory/packages/db`；`RENDERER` = `lobster-factory/infra/hetzner-phase1-core/apps/renderer`；`INFRA` = `lobster-factory/infra/hetzner-phase1-core`。

## 0. 現況（每次改動更新此段）
| 項 | 狀態（2026-09-23） |
|---|---|
| Slice 1 程式 | core `deab0f709`（2026-09-21）+ §7 步 1–3、D1（`7e710ae50`）+ 步 4（`8849676fe`）+ 步 5（`2d86e8548`）+ 步 6–7（`ffef25e9c`）+ 步 9 review 修正（`a58b34758`、`f39559f1d`：Trigger 部署入口收斂為一支、token 取運行中 next-admin）：DB migration + harness、renderer `/snapshot`、next-admin `lib/site-watch/*` + 6 個 route、Telegram 三態送達、RPC／Trigger 契約測試、watchdog、Trigger tasks、env 接線、deploy smoke、客戶頁「網站巡檢」卡 |
| Slice 1 已驗 | 步 1 renderer 真瀏覽器實測（§5 #14）；步 2 `rpc-contract.test.ts` 3/3（突變紅）；步 3 harness 綠（含 owed_since／heartbeat 斷言，突變紅）＋ watchdog 12 種判定以假時戳實證 ＋ 對 prod 實跑 ⚪ NOT_DEPLOYED；步 4 workflows vitest 99/99 + Trigger 契約測試 + `/snapshot` smoke 片段實跑；步 5 卡片 jsdom 8 項 + 真瀏覽器 harness；步 6 單元測試 57 項 + 3 突變；next-admin 全套 1533 pass／13 skip／0 fail（原 core 遺留的 1 紅已修）；renderer `npm test` 16/16；tsc 綠；步 9 codex 三輪（round 1 high、round 2 兩個 medium 皆修；round 3 fallback：F1 駁回、F2 記為 §6.1 已知缺口）＋ token 取值 harness 4/4、2 個突變皆紅 |
| Slice 1 未做 | 2026-09-26 已做 §7 步 10b（0091 prod）→ b2（hold 解除 `b8c191698`）→ c（部署 b8c191698，smoke 全綠）→ a（私有 bucket `lobster-site-watch`，r2.dev 關）；watchdog a heartbeat FAIL 為預期（WORKLOG 2026-09-26）。同日 d → e（自架 Trigger 20260926.1）→ f 金絲雀 → g 開關演練 → h 放量全部完成：2 站（awarewave-ops、soulful-expression）每日 UTC 22:05 巡檢，watchdog PASS。**Slice 1 上線完成**。原文：只剩 §7 步 10（prod a → b → b2 → c → d → e → f → g → h，每項首行 `# CONFIRMED-HIGH-RISK`、逐項等操作者 go-ahead；token 在 10d 才寫）；待決 D2（§6.2）。注意：任何 session 的 push 只要動到 `packages/workflows` 就是 prod Trigger 部署（post-push hook），10d 前無害（heartbeat 安靜略過）。本機紀錄：WORKLOG 2026-09-23（續109） |
| Slice 2／P2／P3 | 未開始（§8） |
| 待決 | D2 客戶站被 Uptime Kuma 與 site-watch 重複告警（§6.2，建議照現況；未回覆 = 照現況）。D1 已決（visual 降 `low`） |

## 1. 目標與分期
**目標**：客戶網站掛了、JS 壞了、畫面走樣，操作者在上班前收到一則 Telegram；正常時系統零聲音；證據可在客戶頁看到；30 天自動清；一個開關全關；**監控者自己掛了也會被發現**（§7 步 3）。

| 期 | 內容 | 完成定義（缺一不算） | 狀態 |
|---|---|---|---|
| **Slice 1** | 每客戶 1 URL（`client_config.site_url` 首頁）、daily（22:00 UTC 桶）、`/snapshot`、pixelmatch、incident（連 2 次）+ Telegram 告警／恢復各 1 則、30 天清理、kill switch、客戶頁設定卡、watchdog | §7 步 10f–g 通過；`check-site-watch-health.ps1` 在 AO-RESUME 出現一次 🟢；RUNNABLE_DEMOS 一列；WORKLOG 四動作 + 非作者模型 review；§0 更新 | 本機 §7 步進行中（見 §0），未上線 |
| **Slice 2** | 多頁（手填 ≤10／客戶）、hourly／every_6h／update_only、每頁遮罩 selector、總覽表（未開巡檢標黃）、wp-update 前後比對（C11）、OnboardWizard「網站巡檢」＋MainWP 接線、「MainWP 有、系統沒有」安全網清單、容量閘（R6） | ≥1 電商客戶 hourly 多頁跑 7 天，遮罩後 visual 誤報 0；wp-update 真跑一次前後比對；總覽表上線；OnboardWizard 勾選一次真接上 MainWP | 未開始 |
| **P2** | 登入後流程：另開容器帶憑證（vault）、只連自己與客戶網域 | 一個登入流程真跑；憑證只存 vault、訊息／log 0 洩漏；容器 egress 實測只到白名單 | 未開始 |
| **P3** | sg-deploy 後瀏覽器 smoke（JS 錯誤 → rollback） | 一次演練：故意注入 pageerror → sg-deploy 自動 rollback 並通知 | 未開始 |

## 2. 操作者已拍板（產品決策，勿重問；2026-09-21）
- 設定入口 = 客戶頁 `/ops/clients/[slug]` 一張「網站巡檢」卡；按鈕／核取方格／chips，**禁 `<select>`**；選取預設多選。
- 新客戶預設開、每天 1 次；電商與 app.aware-wave.com 每小時（Slice 1 由操作者在排程表改 hourly）。頻率 chips：每小時／每 6 小時／每天／只在更新時（後者 Slice 2）。
- 正常不出聲、不產日報；失敗才 Telegram：同一問題一次、恢復一次、連續 2 次失敗才報。週摘要預設關。
- 不留垃圾：基準圖每頁只留最新 1 張；正常結果只記一行、30 天自動刪；失敗證據 30 天自動刪。
- 總覽表列全部網站狀態，未開巡檢者標黃（Slice 2）。
- 負擔上限：沿用 renderer 現有 2G／2 CPU／1024 pids；全域 kill switch。
- 自建網站接入唯一動作 = 在系統新增客戶（填網址）；OnboardWizard 加「網站巡檢」項預設勾（Slice 2）。

## 3. 架構（實作即 SSOT；`file:line` 以 2026-09-23 為準，改程式時同步 §3／§4）
### 3.1 資料流
Trigger.dev 每小時 heartbeat（`WF/src/trigger/site-watch.ts` `site-watch-heartbeat`，cron `5 * * * *`）→ `POST /api/internal/site-watch/due`（bearer `SITE_WATCH_INGEST_TOKEN`；先寫 heartbeat 時戳（§7 步 3）；kill switch OFF → 空；`site_watch_sync_targets()` 為每個 active org 且 `client_config.site_url` 為 http(s) 建 target，預設 enabled／daily／22；回「到期 ∪ 欠通知」target id）→ 每 target 一個 child task → `POST /api/internal/site-watch/run/<id>` → `NA/lib/site-watch/runner.ts runTarget()` :52：claim lease → retire 不在清單的頁 → 到期則每頁 renew → renderer `/snapshot` → 比對 → `site_watch_record_check` → `site_watch_complete_run` → 通知步驟（`notify.ts runNotifications` :65）→ release。另每小時 `POST /api/internal/site-watch/cleanup`（每 UTC 日實跑一次）。
**為何 Trigger 只做薄層**：renderer 只掛 `renderer-net`，只有 next-admin 連得到（`INFRA/docker-compose.yml:522`）。同 collect 模式（`WF/src/trigger/collect-scheduled-crawl.ts` 檔頭）。

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
| 排程 | `WF/src/trigger/site-watch.ts`（`site-watch-heartbeat` + `site-watch-run`）、`WF/src/lib/siteWatch/post.ts`（+ `post.test.ts`）；跨套件狀態字串守在 `NA/lib/site-watch/__tests__/trigger-contract.test.ts` | heartbeat → batchTrigger per-target child（`concurrencyLimit: 2`）→ cleanup；兩者 `maxAttempts: 1`；token 未設 → heartbeat 安靜略過（watchdog a 抓） |
| UI | `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（維護分頁最上方）；共用 `hub-ui.tsx`（`Card/ChipBtn/NoData/SubLabel/relativeTime` 自 ClientHubTabs 原樣搬出）；文案 `NA/lib/site-watch/labels.ts`（server 訊息與卡片共用，無 import） | 狀態 + 最近 10 次 + 證據圖 + 接受新基準；測試 `__tests__/SiteWatchCard.render.test.tsx`。開關／頻率／小時 2026-10-14 移到排程表（`SCHEDULES_PAGE_PLAN.md` §4.2，`lib/schedules/adapters/site-watch.ts`；PATCH `/api/ops/clients/[slug]/schedules/site_watch`） |
| Watchdog | `scripts/check-site-watch-health.ps1` → `agency-os/reports/status/site-watch-LATEST.{md,json}`；`scripts/ao-resume.ps1` capacity 區塊之後呼叫；`TOOL_TRIGGER_MAP.md` 一列 | 監控者的監控（§7 步 3 探針 a–d）；prod 走 SSH ks-aw-01 → `supabase-db` psql（SQL base64 進容器解碼）；`-LocalDbContainer` = 同 SQL 對本機容器（判定實證用） |

### 3.3 重用（已查證，不建新輪子）
排程模式 = collect（`NA/app/api/internal/collect/run-due-schedules/route.ts`、`WF/src/lib/collection/postRunDueSchedules.ts`）；incident = `NA/lib/ops-inbox/upsertIncidentAtomic.ts`；瀏覽器 = 既有 renderer 容器（不另開）；儲存 = `r2.ts`；UI 慣例 = `NA/app/(shell)/ops/collect/CollectionSourcesPanel.tsx` `ScheduleControls`；watchdog 慣例 = `scripts/check-backup-health.ps1` 等 5 個 `check-*.ps1`（runbook §2）。既有 e2e `INFRA/tests/e2e/client/wp-site-health.spec.ts` 保留為手動工具，不搬進 prod。

### 3.4 環境變數（誰讀、哪裡設、缺了會怎樣）
| 變數 | 讀者 | 設在 | 預設 | 缺了 |
|---|---|---|---|---|
| `SITE_WATCH_ENABLED` | next-admin（`config.ts siteWatchEnabled`） | VPS `/root/lobster-phase1/.env` → compose next-admin `environment:` | **OFF** | 全系統靜止（`due` 回空、runner 立即返回、通知不送）；cleanup 仍跑 |
| `SITE_WATCH_INGEST_TOKEN` | next-admin（`wiring.ts verifySiteWatchToken`）、Trigger worker（`WF/src/lib/siteWatch/post.ts`） | VPS `.env`（步 10d 才寫）→ compose；Trigger 由 `scripts/lobster-trigger-deploy.ps1`（唯一部署入口，push 動到 workflows 時 post-push hook 自動跑；`deploy-workflows.ps1` 已退役）取**運行中 next-admin 容器**的值（`docker exec lobster-next-admin printenv`，不讀 `.env`：Trigger 只會拿到 next-admin 認得的 token；**選填**，沒有就不同步、不擋部署；反方向見 §6.1）→ `trigger.config.ts syncEnvVars`（同名覆寫、不刪其他鍵）。輪替：`.env` 改值 → safe-infra-patch → 立刻重跑部署（期間最多一次紅 heartbeat） | 無 | next-admin 端 401 全拒（fail closed）；Trigger 端 heartbeat 安靜略過（上線後 watchdog a 🔴） |
| `R2_SITE_WATCH_BUCKET` | next-admin（`config.ts siteWatchBucket`） | VPS `.env` → compose | **無**（禁回退 designs bucket） | 只做可用性；visual 全記 `storage_unconfigured`；cleanup 跳過物件 |
| `R2_API_TOKEN`／`R2_ACCOUNT_ID` | `r2.ts`（既有） | 既有 | 既有 | 同上 |
| `RENDERER_URL`／`RENDERER_SHARED_SECRET` | `NA/lib/collect/net/providers.ts:44`（既有 renderer 條目） | 既有（compose next-admin + renderer） | `http://renderer:3000` | `RendererUnavailable("not_configured")` → run 不 complete、不算站點失敗 |
| `OPS_INBOX_TELEGRAM_NOTIFY_ENABLED`／`TELEGRAM_BOT_TOKEN`／`OPS_INBOX_TELEGRAM_CHAT_IDS`／`OPS_INBOX_TELEGRAM_NOTIFY_MIN_SEVERITY` | `telegram.ts buildOperatorTelegramNotifier`（與 ops-inbox 共用） | 既有 | min severity `medium` | 關閉 → 所有告警記 `skipped`（終態），incident 仍開 |
| `OPS_INBOX_PUBLIC_URL` | `wiring.ts`（訊息內連結） | 既有 | `https://app.aware-wave.com` | 連結指錯站 |
| `AWAREWAVE_WEBHOOK_BASE_URL` | Trigger worker | Trigger syncEnvVars（既有） | `https://app.aware-wave.com` | heartbeat 打錯站 |
驗證唯一可信方式：`docker exec <next-admin> printenv <VAR>`（AGENTS.md §0）。

### 3.5 安全邊界
- **攻擊者控制**：客戶網站內容（任意 JS／redirect／巨大頁面）。邊界 = renderer 容器：egress iptables 只到公網（`RENDERER/entrypoint.sh`）、`validateTargetUrl` 拒私網／內部主機名（`lib.mjs`）、非 root、cap_drop、pids 上限；`/snapshot` 有硬 deadline（`withContext`）；console/pageerror 各 ≤20 條 ≤300 字進 DB（不執行、只存字串）。
- **操作者控制**：`site_url`（owner/admin 才能改 client_config）；renderer 對 `url_*` 拒絕 → 記 `blocked`，不會 SSRF。
- **內部 API**：`/api/internal/site-watch/*` 專用 bearer（不與 `OPS_INBOX_INGEST_TOKEN`／`COLLECT_SCHEDULE_INGEST_TOKEN` 共用；timingSafeEqual）；`/api/ops/clients/[slug]/site-watch*` 走 middleware session + `resolveOpsRole`，寫入 owner/admin。
- **資料**：4 表 RLS service_role only；R2 私有 bucket、圖只經 `image` route 以 row id 定址（object key 不出伺服器）；存 URL 去 query；Telegram 只文字 + ops 連結，無圖、無 token。
- **不在範圍**：客戶登入態（P2）、寫入客戶站（永遠不做）。

## 4. 合約
### 4.1 不變量（鏡射於 0091 檔頭）
- **I1 單一有效執行者**：任一時刻對同一 target 的狀態寫入只有一個執行者生效。每次取得執行權都換新 `lease_gen`；每筆寫入在同一交易內驗「gen 是我的且未過期」（`site_watch__hold`）。對外副作用（Telegram）只在「剛 renew 成功且剩餘租期 ≥ chat 數 × 10s + 30s」才開始；但這**不是**保證——請求送出後 abort 只停止等待，Telegram 仍可能收下，`sendMessage` 無 idempotency key。所以送達正確性不靠 fence，由 I2 的「不確定」狀態承擔。截圖可重複，狀態不可。
- **I2 通知 = 狀態，不是事件**：「該發」先落 DB（`pending`）；送出前寫 `uncertain`；「已發」只在送達回傳後寫 `sent`。三種結果：確定送達（2xx）、確定沒送（4xx 或根本沒發出）、**不確定**（5xx／abort／網路錯誤／送出後當掉）。不確定一律當「可能已送達」。代價 = at-least-once：最多多收 1 則重複或延遲訊息（已接受）。
- **I3 一段問題一組訊息**：一個 episode（連 2 次失敗 → 恢復送完）告警與結束成對：只要告警可能已送達（sent／uncertain），一定補結束訊息；只有確定沒送（pending／skipped）的告警才允許 0 則結束。結束原因 `recovered|disabled|page_removed`。保證「不會只收到告警、永遠等不到恢復」；不保證不重複。

### 4.2 C1–C12（as implemented；Slice 2 項標註）
- **C1 頁面**：Slice 1 = `client_config.site_url` 首頁；canonical = 小寫 scheme/host、去 query/fragment、去尾斜線；page_id = sha256(canonical)[0:16]（`pages.ts`）。Slice 2：手填清單 ≤10 頁／客戶；不做 crawl／sitemap。
- **C2 排程桶**（`runKey.ts`）：不重用 `lib/collect/schedule.ts`（只有 daily|weekly）。hourly = `sw-<target>-<YYYYMMDDHH>`；every_6h = `sw-<target>-<YYYYMMDD>-q<floor(H/6)>`；daily = `sw-<target>-d<YYYYMMDD of (now − hour_utc h)>`（桶 = 從 hour_utc 起算 24h，錯過設定時刻的後續 heartbeat 會補跑，同桶只一次）；update_only（Slice 2）= `sw-<target>-upd-<ops_action_run_id>`。語意：每桶最多一次、只跑當前桶、不補歷史桶；停擺跨桶時 `skipped_buckets` = 中間漏掉桶數。`hour_utc` 預設 22（台北 06:00；台灣無 DST）。冪等 = `site_watch_results UNIQUE(target_id, run_key, page_id)`：只有插入成功那次動 page_state。heartbeat 每次挑「到期 ∪ 欠通知」。
- **C3 租約**（`site_watch_claim/renew/release`）：搶 = `lease_gen+1, lease_until=now+window WHERE lease_until IS NULL OR < now`，0 行 = 跳過；每次搶都新 gen。window = `leaseWindowSeconds(pages)` = min(900, max(300, pages×90+120))。每頁開跑前 renew，0 行 = 被接手、立即停。所有狀態寫入經 `site_watch__hold`（過期舊執行者 0 行）。Trigger task `maxAttempts=1`：當掉靠租約到期後下一次 heartbeat 重搶（最長延遲 = window + 1h）。Telegram 硬逾時在 fetch 本身。
- **C4 執行時限**：一 target 一次 route 呼叫（`run/[targetId]` `maxDuration=300`），heartbeat 不在 route 內迴圈客戶。
- **C5 renderer `/snapshot`**：獨立 route，不套 `/render` 的 `SKIPPED_RESOURCE_TYPES`（否則畫面殘缺）；egress 同 `/render`。回 `{ok, status, finalUrl（去 query）, failureCode, detail, consoleErrors[], pageErrors[], screenshotBase64, screenshotBytes, screenshotSkipped, timingMs}`；failureCode ∈ `timeout|http_4xx|http_5xx|dns|connect|blocked|navigation`（null = 站點正常）；console 只收 error 級 + pageerror，各 ≤20 條 ≤300 字；`too_large`／截圖失敗 ≠ 站點失敗 → `screenshotSkipped`。renderer 對 `url_*` 回 400 → next-admin 視為站點 `blocked`（網址設定錯）。renderer 掛掉／逾時 = 監控自身故障（`RendererUnavailable`）：不記 result、不算 streak、run 不 complete、同桶下次重試、Trigger run 標紅 + Sentry。
- **C6 比對**（`diff.ts`）：首次成功即建基準；pixelmatch threshold 0.1；差異像素（含高度差列）> 5% = visual 失敗；寬度不同 = ratio 1（capture 變了，提示重建基準）。基準只在操作者按「接受為新基準」時換（`site_watch_accept_baseline`，只歸零 visual streak）。每頁遮罩 selector = Slice 2。
- **C7 資料**：專用表 `site_watch_targets`（設定 + lease + `last_completed_run_key/_bucket_start` + `version`）、`site_watch_results`（一行一次）、`site_watch_page_state`（PK `(target_id, page_id, kind)`，kind ∈ `availability|visual`；`failure_streak/episode_id/alert_state/recovery_state/recovery_reason/incident_id/baseline_*/owed_since`；`owed_since` = 欠訊息起算時間，CHECK `site_watch_owed_since_iff_owed` 綁「非空 ⇔ 有欠訊息」，失敗重送不重設、不確定告警轉恢復時沿用）、`site_watch_maintenance`（單例：cleanup 日期 + `last_heartbeat_at`／`last_enabled_heartbeat_at`，由 `site_watch_touch_heartbeat(p_enabled)` 在 `due` 的 kill-switch 判斷**前**寫）。**不寫** `organizations.metadata.client_config`（read-merge-write 會互蓋）。設定更新 = `site_watch_update_config` 帶 `version` 樂觀鎖、記 actor、任何改動 streak 歸零、關閉 → 開著的 episode 以 `disabled` 結束。`ops_incidents_source_check` 加 `site_watch`（基底 0073 值）；`IncidentSource` 型別同步。RLS：service_role only。org 刪除 → 4 表 CASCADE；R2 物件由 C9 orphan sweep 收。
- **C8 通知**（`notify.ts` + 0091 `site_watch_notify_begin/finish`、`site_watch_resolve_for_recovery`）：dispatcher 對 `source='site_watch'` skip；site-watch 自己用 `TelegramNotifier.sendText`。fingerprint = external_id = `site_watch:<org>:<page_id>:<kind>`（`ops_incidents` 有 UNIQUE(source, external_id) `0013_ops_inbox.sql:54` 與 UNIQUE(fingerprint, environment)）；新 episode 以 `upsertIncidentAtomic(…, isReopen=true)` 重開同一列。狀態機（每 page_state 列）：
  - 巡檢失敗：streak+1；streak ≥2 且無 episode → 新 `episode_id`、`alert_state='pending'`。episode 結束中（recovery 進行）的新失敗只計 streak；結束後 streak 仍 ≥2 → 下一次失敗開新 episode。
  - 巡檢成功：streak=0；有 episode 且 alert ∈ {sent, uncertain} → `recovery_state='pending_resolve'`；alert ∈ {pending, skipped} → 靜默結束（resolve incident、清 episode、0 則）。
  - 通知步驟（同一 lease，每次 heartbeat）：`pending` → 確保 incident（`incident_id` 空則 upsert + `site_watch_attach_incident`）→ renew，剩餘 ≥ chats×10s+30s 才送（不足 = `deferred`，狀態不變）→ 送前 `uncertain` → 結果 sent→`sent`／4xx→`pending`／其餘保持 `uncertain`（下次重送，最多多 1 則）。Telegram 關閉或低於 min severity → `skipped`（終態，恢復靜默）。Severity 單一來源 `config.ts severityFor(kind)`（incident 列與 Telegram 門檻共讀，不會分歧）：可用性 `high`、visual `low`（D1）→ 預設 min `medium` 下 visual 只開 incident、Telegram `skipped`。
  - 恢復：`pending_resolve` → `UPDATE ops_incidents SET status='resolved', resolved_by='site_watch' WHERE id=? AND status NOT IN ('resolved','ignored')`：1 行 → `pending_send`；0 行（操作者已手動結案）→ 清 episode、0 則。`pending_send` → 送恢復訊息（同三態），只有 `sent` 才清 episode。
- **C9 清理**（`cleanup.ts`；每 UTC 日一次 `site_watch_claim_daily_cleanup`）：刪 `site_watch_results` >30 天；R2 key `site-watch/<org>/<page_id>/baseline.jpg`（單 key 覆寫）與 `.../evidence/<ts>-<rand>.jpg`／`-diff.jpg`；掃 prefix 刪 DB 未引用且 >24h 的 orphan（含無 live baseline 的 baseline.jpg）；`lastModified` 未知不刪；刪失敗明天再掃，無重試佇列。不受 kill switch 影響（保留期承諾）。
- **C10 kill switch**：env `SITE_WATCH_ENABLED`（預設 OFF，AGENTS.md §0 慣例；prod 改動走 `safe-infra-patch.sh`）。`due` 回空；runner 每頁開跑前檢查，進行中的頁跑完即停；通知步驟也停。target rows 預設 `enabled=true`（操作者決策）。renderer 資源沿用 compose 現值。
- **C11 wp-update 前後比對（Slice 2）**：掛進 `NA/app/api/ops/clients/[slug]/wp-update/route.ts`（SSE；現況 health 只是 HEAD :120）。更新前 snapshot 失敗 → 記錄、不擋更新、不比對；更新失敗 → 照現有流程；更新後 snapshot 失敗 → 重試 1 次，仍敗 = warning incident；HTTP OK 但 diff 超標 = warning incident，不判更新失敗。run key `sw-<target>-upd-<ops_action_run_id>`。SSE 斷線行為沿用現有 route，實作前先讀確認，不改。
- **C12 隱私**：R2 私有 bucket `R2_SITE_WATCH_BUCKET`（**無預設**；designs bucket 是公開的；未設 = 只做可用性，visual 記 `storage_unconfigured`）；Cloudflare REST 無 signed URL → 圖只經已驗證 route `…/site-watch/image?result=<id>&which=evidence|diff` / `?page=<id>&which=baseline`，以 row id 定址、不接受 object key；Telegram 只送文字摘要 + ops 連結；存 URL 去 query；只截公開頁。

### 4.3 關鍵決策與理由（問「為什麼這樣設計」看這裡，不重推）
| 決策 | 為什麼 | 放棄的替代 |
|---|---|---|
| 狀態轉移全在 plpgsql，TS 只編排 | fence（I1）必須與寫入同一交易；Supabase JS 做不到條件式多表 UPDATE | TS 讀-改-寫（並行互蓋） |
| Trigger 只做薄層，工作在 next-admin route | renderer 只在 `renderer-net`；排程邏輯一份（同 collect） | Trigger 端截圖（連不到 renderer） |
| 不重用 `lib/collect/schedule.ts` | 只有 daily/weekly、run key 只到日期 | 硬塞 hourly（語意衝突） |
| JPEG q80 而非 PNG | 1366×8000 PNG 常 >5MB；threshold 0.1 吸收編碼噪音 | PNG（超限率高） |
| 冪等靠 `results` UNIQUE 而非 `last_counted_run_key` | 一個約束守全部路徑；少一個要同步的欄位 | 欄位 + 邏輯判斷 |
| Telegram 三態 + at-least-once | `sendMessage` 無 idempotency key；寧多一則不漏一則 | at-most-once（會漏恢復訊息） |
| 私有 bucket 無預設 + 認證 proxy route | designs bucket 公開；REST 無 signed URL；row id 定址杜絕跨客戶讀圖 | 預設回退 designs bucket（洩漏） |
| target rows 預設開、全域開關預設關 | 操作者要新客戶自動納入；AGENTS §0 自動化預設 OFF 由全域開關承擔 | rows 預設關（新客戶漏掉） |
| 基準只由操作者接受 | 自動換基準 = 改版當天靜默接受錯畫面 | 自動滾動基準 |
| JS 錯誤只記錄不告警 | WP 站常駐 console error，告警即噪音 | 告警（會被靜音） |
| renderer 故障 ≠ 站點失敗 | 監控自身故障不能變成客戶告警；由 Trigger 紅 + Sentry + watchdog 承擔 | 記為 timeout（誤報） |
| `update_only` 拒收到 Slice 2 | 沒有 wp-update hook 時是死設定 | 先開放（永不觸發） |

## 5. 驗收矩陣（Slice 1）
| # | 情境 | 期望 | 驗於 |
|---|---|---|---|
| 1 | 正常站 | 無通知、每桶 1 行結果 | ✅ harness（record/complete）；⬜ prod §7 步 10f |
| 2 | 站 500 兩次 | 1 張 incident、1 則 Telegram | ✅ harness（state）；⬜ prod |
| 3 | 恢復 | 1 則恢復訊息、incident resolved、episode 清 | ✅ harness |
| 4 | 兩個 heartbeat 同時觸發 | 只跑一次（第二個 claim NULL） | ✅ harness |
| 5 | kill switch OFF | 0 次 renderer 呼叫 | ✅ vitest `runner.test.ts`（開頭關 = 不載入不搶租約；中途關 = 不開下一頁、不 complete、不送通知）；⬜ prod 10g |
| 6 | 31 天前 evidence 刪、baseline 保留 | 同左 | ✅ harness（purge）；✅ vitest `cleanup.test.ts`（孤兒刪；被引用／<24h／日期未知／非本模組 key／live baseline 保留；刪失敗計數） |
| 7 | daily 目標 22:00 起 24 次 heartbeat | renderer 1 次；22–23 時失效 → 次日 00:00 補跑、key 仍前一桶 | ✅ vitest `runKey.test.ts` |
| 8 | 任務當掉重跑 | 租約內再觸發跳過；到期後新 gen 重跑、結果 1 行、streak 只 +1；舊執行者寫入 0 行 | ✅ harness（fence／duplicate） |
| 9 | hourly 連 6 次 500 | streak 6、incident 1、Telegram 1；恢復 1；再連敗 2 → 新 episode；操作者先手動結案再恢復 → 0 則 | ✅ harness |
| 10 | Telegram 4xx 三次後成功 | 第 4 次才送、總 1 則；期間站恢復 → 0 則 | ✅ harness（rejected→pending→silent） |
| 11 | Telegram 卡住／5xx | 10s abort → `uncertain`；期間恢復仍送 1 則恢復；4xx → `pending`、恢復 0 則；租期不足 → 不發、狀態不變 | ✅ harness（uncertain 路徑）；✅ vitest `telegram.test.ts`（200／400／502／abort／網路錯、多 chat 合併）+ `notify.test.ts`（租期不足 deferred 且不 begin、chat 數加租期門檻） |
| 12 | 連續 3 天無 heartbeat | 只跑 1 次、`skipped_buckets=2`、同桶不再跑 | ✅ vitest `runKey.test.ts` |
| 13 | RPC 參數名 vs 0091 簽名 | 全部相等 | ✅ vitest `rpc-contract.test.ts`（真呼叫經 JSON 往返取鍵 + 掃描所有呼叫點；改一個鍵名／漏測一個呼叫點 → 指名測試紅） |
| 14 | `/snapshot` 真實頁 | example.com → `failureCode:null` + JPEG；404 → `http_4xx`；不存在網域 → `dns`；`/render` 未退化 | ✅ §7 步 1（2026-09-23：example.com 200 JPEG `FFD8FF` 17.5KB 看圖正確；`/nope` 404 `http_4xx`；`.invalid` `dns` 且 finalUrl 空；`10.0.0.1` 400 `url_private_address`；`10.0.0.1.nip.io`（rebinding）URL 檢查放行、iptables 丟包 → `timeout`；wikipedia 200 105KB；`/render` 200；錯 secret 401）；⬜ sg-deploy smoke（§7 步 4） |
| 15 | 監控者掛了 | heartbeat >2h 🟡、>6h 或從未 🔴；開啟中且某 target 超過週期+2h 未完成 🟡；欠訊息 `owed_since` >3h 🟡；已部署但缺 0091 🔴；未部署 ⚪ `NOT_DEPLOYED`；探測失敗 = 盲點 🟡 | ✅ §7 步 3（本機真 Postgres + 假時戳 12 種判定全過；對 prod 實跑 ⚪）；⬜ prod：AO-RESUME 出現一次 🟢 |
標準：任何路徑都不出現「有告警、無恢復」；允許最多 1 則重複。

## 6. 風險、故障模式、待決
### 6.1 故障模式（哪個元件掛 → 系統怎麼做 → 誰會知道）
| 掛的元件 | 系統行為 | 誰會知道 |
|---|---|---|
| Trigger.dev（heartbeat 不打） | 什麼都不跑；欠的通知延後 | watchdog：heartbeat 時戳 >2h 🟡／>6h 🔴（§7 步 3）；Trigger 自身在 Uptime Kuma |
| Trigger worker 沒有 token（沒經唯一入口部署過、或 10d 前） | heartbeat 回 `{configured:false}` 安靜略過，什麼都不跑 | watchdog a 🔴（next-admin 已部署時）；處置：`scripts/lobster-trigger-deploy.ps1` |
| next-admin 失去 token（compose 被還原、`.env` 刪行），Trigger 仍保有舊值 | 同步只 upsert、部署腳本刪不掉 → heartbeat 每小時 401、run 紅（刻意不自動刪：否則 next-admin 一次短暫停機就會讓 Trigger 永久失去 token） | Sentry；watchdog a 🔴；處置：§9 先停 heartbeat，或 Trigger dashboard 刪 `SITE_WATCH_INGEST_TOKEN` |
| next-admin down | heartbeat 打不到 → Trigger run 紅 + Sentry | Uptime Kuma（既有）+ watchdog |
| renderer down／逾時 | `RendererUnavailable`：不記 result、不算 streak、run 不 complete、同桶下次重試；Trigger run 紅 | Sentry；watchdog b（該 target 超過週期 +2h 未完成）🟡；sg-deploy smoke（部署當下） |
| DB down | route 5xx → Trigger run 紅；無狀態寫入 = 無誤報 | Sentry；watchdog heartbeat 停（due 寫不進） |
| R2 down | put 失敗 → `visual='skipped'`／evidence 無圖；availability 照常；cleanup 跳過物件 | `[site-watch]` warn log；卡片顯示 skipped 原因 |
| Telegram down（5xx／逾時） | `uncertain` → 下次 heartbeat 重送；incident 已開 | 卡片顯示 alert_state；watchdog c（`owed_since` >3h）🟡 |
| Telegram 4xx（token／chat 錯） | `pending` 永遠重試不送出 | watchdog c（`owed_since` >3h）🟡；ops-inbox 既有 Telegram 也會壞 |
| 客戶站慢／半殘 | timeout／http_5xx → 正常告警路徑 | Telegram（連 2 次） |
| 操作者填錯 site_url（私網／非 http） | renderer 400 `url_*` → `blocked` 告警 | Telegram（訊息含「請檢查客戶網址設定」） |

### 6.2 風險與待決
- **D1（已決 2026-09-23，操作者）**：Slice 1 visual 降 `low`——WP 站輪播／日期等每天可能 >5%，進 Telegram 即噪音。實作 = `config.ts severityFor()` 單一來源（原本 `messages.ts`／`notify.ts` 各寫一份，會分歧）→ visual 只開 incident（ops-inbox + 卡片可見）、Telegram `skipped`、恢復靜默。Slice 2 加遮罩後升回 `medium`（改 `severityFor` 一處）。
- **D2（待操作者決定，2026-09-23 登記時發現）**：`MONITORING_SYSTEMS_INVENTORY.md` 定 Uptime Kuma 為「所有 HTTP 可用性檢查的唯一來源」，客戶站 `soulfulexpression.org` 已有 Kuma 監控 23–25；site-watch 的可用性檢查也涵蓋它。真故障時會收到兩則：Kuma 幾分鐘內一則、故障持續兩個 site-watch 時段後 site-watch 再一則（恢復時同理）。選項：(a) 照現況——兩個視角（Kuma 快、site-watch 看「訪客實際拿到什麼」），第二則等同「仍未恢復」；(b) 對已有 Kuma 監控的站，site-watch 只開 incident、不發可用性 Telegram——需要「哪些站有 Kuma」的資料來源（新欄位或對照表，Slice 2）；(c) 退掉 Kuma 對客戶站的監控、改 site-watch hourly（失去分鐘級）。建議 (a)：目前只影響一個站、代價是長故障多一則訊息，(b) 沒有準確的資料來源前做不對。未回覆 = (a)。
- R1 Telegram at-least-once：最多 1 則重複（已接受）。
- R2 lease window 下限 300s = run route `maxDuration`；route 被砍時最長延遲 = window + 1h（已接受）。
- R3 `IncidentSource` 型別本就缺 `collection`（`NA/lib/collect/report-store.ts:169` 繞過型別）——既有漂移；補時同步 `policy.ts` catalog。
- R4 org 轉 inactive 後其開著的 episode 收不到結束訊息（`runner.ts` monitored=false 不跑 retire）→ Slice 2 補或接受。
- R5 R2 list `last_modified` 欄位名未對 prod 實測；缺值時 cleanup 保守不刪 → prod 首次 cleanup 後查 `deletedObjects`。
- **R6 容量**：renderer snapshot 併發 1、每頁 ≈40s → 上限 ≈90 頁/小時。Slice 1（每客戶 1 頁、daily）遠低於此；Slice 2 hourly × 多頁必須加容量閘：`due` 對 hourly 目標的頁數總和 >60/小時 → 拒開並在卡片提示（§8）。**fan-out 必限流**（§7 步 4 `concurrencyLimit: 2`）：否則首次開啟或每日 22:00 全 target 同時到期，超過 renderer queue（`server.mjs MAX_QUEUE` 20）的 child 得 503、超過 client 150s 的先斷線——renderer 不知道客戶端走了，會把沒人等的截圖做完（`RENDERER/server.mjs` 無 `req.on('close')` 取消；P3 候選：加 abort-on-disconnect）。
- **R7 備份**：`site_watch_*` 四表在同一 Supabase，由既有備份（`check-backup-health.ps1`）涵蓋；R2 evidence **不備份**（30 天可拋棄）；baseline 不備份（操作者按一次「接受為新基準」即重建）。
- **R8 XSS 面**：`errors_sample`／`final_url`／`page_url`／`last_message` 是攻擊者（客戶站）可控字串 → 卡片與 ops-inbox 一律當純文字 render（React 預設轉義；**禁** `dangerouslySetInnerHTML`），Telegram 走 plain text（不設 `parse_mode`，`telegram.ts` 現況即是）。
- **R9 Cloudflare ~100s**：Trigger worker 經公網 `https://app.aware-wave.com` 呼叫（`AWAREWAVE_WEBHOOK_BASE_URL`），Cloudflare 對 origin 約 100s 回 524。單頁 run 通常 <30s；病態頁（載入 15s + idle 15s + 截圖 30s + R2）可能逼近 → client 端 524、該 run 紅一次、Sentry 一則；server 端 route 照跑完、租約保證不重複寫（已接受；常見時改走內網 URL）。
- 風險等級：renderer 新 endpoint 上線、compose env、Trigger deploy、migration 皆 **High**（§7 步 10 逐項 go-ahead）。
- 工具坑：Bash 呼叫 `.ps1` 用正斜線；bash heredoc 餵 python 本機會失敗（寫 scratch 檔）；測試產物寫 `$env:TEMP`（auto-checkpoint hook 會 commit repo 內 dirty 檔）；從 `D:\Work` 根 grep 看不到 `.claude/` junction；本機無 `pwsh` 用 `powershell.exe`；Codex 接手時 hooks 可能未 trust（AGENTS.md §4）→ 手動等價執行 git log／風險分級／驗證／WORKLOG／commit。

## 7. 下一步（Slice 1 收尾；順序 = 最大未知先殺 → 監控者先有人看 → 最短路徑到 prod → 補測試）
步驟 1–9 本機 Low/Medium 直接做；步驟 10 每一子項 High、逐項等操作者 go-ahead。review 由**非作者模型**做（Claude 寫 → `/codex-review`；Codex 寫 → `/claude-review`）。每步完成更新 §0。

1. ✅ **renderer 真實測試**（2026-09-23，結果 §5 #14）：`cd RENDERER && docker build -t sw-renderer-test .`；`docker network create sw-test-net`；`docker run --rm --network sw-test-net --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SETUID --cap-add SETGID --cap-add SETPCAP -e RENDERER_SHARED_SECRET=t -p 127.0.0.1:3999:3000 sw-renderer-test`；`curl -s -X POST localhost:3999/snapshot -H 'x-renderer-secret: t' -H 'content-type: application/json' -d '{"url":"https://example.com"}'` → `failureCode:null`、`screenshotBytes>0`、base64 解出檔頭 `FF D8`（**打開看圖**）；`/nope` → `http_4xx`；`https://no-such-host-xyz.invalid` → `dns`；再打 `/render`。**`--network` 不可省**：預設 bridge 的 DNS 是宿主的（Docker Desktop = `192.168.65.7`），落在 renderer 自己 egress 規則 DROP 的 192.168/16 → 每個站都 `dns`（實測）；user-defined network 用 Docker 內建 DNS `127.0.0.11`（規則放行），prod `renderer-net` 即此型。順修：沒載入的頁 `finalUrl` 原回 `about://blank` 並寫進 DB → `lib.mjs publicUrlOnly` 只認 http(s)，其餘回空字串（有單元測試）。
2. ✅ **RPC 契約測試** `NA/lib/site-watch/__tests__/rpc-contract.test.ts`（2026-09-23；實作比原設計強：鍵名取自真呼叫經 JSON 往返 = 實際上線的 payload，另掃描所有 `rpc("site_watch_*"` 呼叫點須被測到）：解析 0091 每個 `CREATE OR REPLACE FUNCTION public.site_watch_*(…)` 的 `p_*` 集合，對照 `store.ts`／`console.ts`／`cleanup.ts` 每個 `rpc("site_watch_*", {…})` 的 key 集合（`stateArgs()` 展開 p_target／p_gen／p_page／p_kind／p_episode）必須相等且函式存在。守 PGRST202 類（參數名錯 = runtime 才炸；WORKLOG 0055 兩週停擺前例）。
3. ✅ **Watchdog（監控者的監控）**（2026-09-23；prod 未套 0091，直接改 0091 不開 0092）：
   - 0091：`site_watch_maintenance` 加 `last_heartbeat_at`／`last_enabled_heartbeat_at` + `site_watch_touch_heartbeat(p_enabled)`；`site_watch_page_state` 加 `owed_since` + CHECK（C7）。harness 斷言含「失敗重送不重設 owed 時鐘」（把時戳撥回 5h 再驗，同交易 `now()` 恆等所以必須這樣證）。
   - `due/route.ts`：驗 token 後、kill-switch 判斷**前** `store.touchHeartbeat(siteWatchEnabled())`；契約測試涵蓋。
   - `scripts/check-site-watch-health.ps1` 四探針（相對原設計兩處修正，都是「原定義對它要抓的故障恆綠」）：a heartbeat >2h 🟡、>6h 或從未 🔴；b 開關開著（enabled heartbeat <2h）時**逐 target** 看 `coalesce(last_completed_bucket_start, created_at)` 超過週期 +2h（hourly 3h／6h 8h／daily 26h）→ 🟡——原「全域最新 result >26h」看不到「單一 target 的頁面每次弄垮 renderer、其餘 target 正常」；c 開關開著時 `owed_since` >3h → 🟡——原 `updated_at` 每次送信失敗都被改寫，Telegram 4xx／5xx 無限重試時恆新鮮；d 未套 0091：以未帶 token 的 `POST /api/internal/site-watch/due` 判部署（401 = 已部署 → 🔴；404 = 未部署 → ⚪ `NOT_DEPLOYED`，exit 0，避免上線前每次 AO-RESUME 常駐紅燈）。探測失敗／解析不到 = 盲點 🟡。本機真 Postgres + 假時戳 12 種判定全過（其中一次抓到 `greatest(0, NULL)=0` 讓「從未 heartbeat」讀成「剛剛」的 bug，已修）；對 prod 實跑 ⚪。三個坑已補進 `runbooks/ADD-PERIODIC-HEALTH-CHECK.md` 2026-09-23 addendum。
4. ✅ **Trigger.dev + env + deploy smoke**（2026-09-23）：
   - `WF/src/lib/siteWatch/post.ts`（`postSiteWatchDue／Run／Cleanup` + `siteWatchConfigured`；專屬 bearer、`AbortSignal.timeout`：due 60s、run／cleanup 330s > route `maxDuration` 300）+ `post.test.ts` 6 項。
   - `WF/src/trigger/site-watch.ts`：`site-watch-heartbeat`（cron `5 * * * *`）→ due → `siteWatchRun.batchTrigger` → cleanup；`site-watch-run`（`queue.concurrencyLimit: 2`、`maxDuration` 400、`renderer_unavailable` → throw + Sentry）。相對原設計的偏差：① heartbeat 也 `retry.maxAttempts: 1`（config 預設 3；children 已觸發後重試會再觸發一遍，下一小時才是重試）；② 不加 idempotency key（否則 §11「手動 trigger 立刻跑一次」同小時內無效；重複 child 由租約／bucket 擋）；③ token 未設 → heartbeat 記 warn 後安靜略過（任何 Trigger 部署都會帶上這個排程，10d 前每小時紅燈只是噪音；上線後缺 token 由 watchdog a 抓）；④ `index.ts` export 照做但非必要（`trigger.config.ts dirs` 自動發現）；⑤ 跨套件狀態字串 `renderer_unavailable` 由 `NA/.../trigger-contract.test.ts` 守（兩邊 union 必須相等）。
   - `WF/trigger.config.ts` syncEnvVars 加 `SITE_WATCH_INGEST_TOKEN`；`TASK_REFERENCE.md` env 表 + task 段；`scripts/lobster-trigger-deploy.ps1` 在主機上讀（MainWP 同模式，值不離開主機）且**選填**——照抄 collect 的必填 throw 會讓 10d 前所有不相關的 Trigger 部署失敗。（步 9 round 2 起改取運行中 next-admin 容器的值，見 §3.4。）
   - repo `INFRA/docker-compose.yml` next-admin（`RENDERER_SHARED_SECRET` 之後）加三鍵、`INFRA/.env.example`（Telegram 區後；原檔沒有 collect／R2 鍵）同步；`docker compose config` 驗過。repo compose 只是對照，prod 由 10d 套；`/check-drift` 在 10d 前會 WARN 這三鍵（預期）。
   - **deploy smoke**：`sg-deploy.sh` Step 7 renderer 段加真實 `/snapshot` example.com（`"ok":true` 且 `"failureCode":null`，否則計 `_smoke_errors` → 既有自動 rollback）；片段對本機 renderer 實跑：正確 secret 1、錯 secret 0、`set -euo pipefail` 不中止。`DEPLOY_ROLLBACK_RUNBOOK.md` renderer 列同步。
5. ✅ **UI 卡** `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（2026-09-23），插入 `ClientHubTabs.tsx` `MaintenanceTab` 最上方（ClientHubTabs 只多一行）。
   - 5a：`globallyEnabled=false` 黃條、`storageConfigured=false` 提示、無可巡檢網址提示；開關 checkbox；頻率 chips（每小時／每 6 小時／每天；「只在更新時」標示之後開放）；時間 number input **只在「每天」顯示**（`hour_utc` 只影響 daily 桶）並換算台北；狀態列（連續失敗、告警／恢復狀態、`owed_since`）；最近 10 次（時間、漏跑數、HTTP、failureCode 中文、JS 錯誤數、畫面比對 %）；最近一次 JS 錯誤樣本以 `<details>` 純文字列出。PATCH 帶 `expectedVersion`（無列時 0），409 → 重新載入 + 提示；403 → 權限提示。failureCode 中文表移到 `lib/site-watch/labels.ts`（`messages.ts` 改 import）。
   - 5b：證據／差異／基準圖按需載入（點 chip 才打 `…/site-watch/image?result=<id>|page=<id>`）；「接受為新基準」兩段式確認（舊基準圖會被覆寫、不可復原；不用 modal），顯示條件 = 該頁**最近一筆有做畫面比對**的結果是 diff（最新一筆若是載入失敗、沒有畫面判定，不能把按鈕藏起來）。
   - `Card/ChipBtn/NoData/SubLabel/relativeTime` 從 ClientHubTabs 原樣搬到 `hub-ui.tsx`，兩邊 import（避免反向 import 成循環、也不複製樣式）。
   - 驗證：jsdom 渲染測試 8 項（banner、R8 惡意字串為純文字、PATCH 版本與 409、無列時 version 0、兩段式接受、按需載圖、失敗載入不藏按鈕）；突變：錯誤樣本改 `dangerouslySetInnerHTML` → R8 測試紅；真瀏覽器（esbuild 打包真元件 + app `globals.css` + mock API，scratchpad harness）實看：版面、chip 互動、圖片經路由載入 1366×900、惡意字串未執行（`document.title` 未變）、接受按鈕第一次只進確認態。真實客戶頁需登入 session，留待步 10 由操作者看。
   - 順修（會擋 10c）：`lib/repair-center/__tests__/policy.test.ts`「covers all 7 sources」自 core `deab0f709` 加入 `site_watch` 後即紅（全套唯一失敗；sg-deploy test gate 必擋）。改為對照最後一版 migration 的 `ops_incidents_source_check`：每個 DB 允許的 source 都要有 policy，`collection` 為已登記漂移（R3）；突變（catalog 少一個 source）→ 紅。
6. ✅ **單元測試**（2026-09-23）`NA/lib/site-watch/__tests__/`：`runKey`（9：key 格式、跨月跨年、矩陣 #7／#12）、`pages`（4）、`notify`（15：含 D1 以真 `TelegramNotifier` 的門檻驗 visual skipped／availability sent、deferred 不 begin、stale、rejected／uncertain 原樣寫回、無 incident 先 upsert+attach、恢復的 resolve／closed_by_operator／fenced）、`runner`（13：矩陣 #5、C5 renderer 故障不記站點失敗、fenced／renew／retire 失租約、中途關開關、停用目標仍送結束訊息、失敗留證據、基準→diff、無 bucket）、`diff`（4：相同 0、半張 ≈0.5、高度差、寬度不同 = 1）、`cleanup`（5）；`NA/lib/ops-inbox/notify/__tests__/telegram.test.ts`（8）。全套 1533 pass／13 skip／0 fail，tsc 綠（測試檔的型別錯同樣會擋 sg-deploy 的 typecheck gate，已修）。突變：0091 `>= 2`→`>= 3` → harness「two failures open an episode」紅；拿掉 `notify.ts` deferred → 2 個指名測試紅；runner 把 renderer 故障吞成站點 timeout → C5 測試紅；皆還原（diff 空）。
7. ✅ `scripts/playwright-runner.ps1` 檔頭（2026-09-23）：「Also called post-deploy by sg-deploy hooks」為假（`sg-deploy.sh` 從不呼叫它，Step 7 smoke 是 curl）；但原訂改成「只被 /playwright 呼叫」**也是假的**——`.claude/commands/sg-deploy.md:46`（smoke）與 `wp-maintenance.md:69`（client）也把它列為操作者要跑的後續步驟。照實寫三個呼叫者並註明 sg-deploy.sh 不呼叫。
8. ✅ **登記**（2026-09-23；RUNNABLE_DEMOS 最上一列；MONITORING_SYSTEMS_INVENTORY「site-watch」段含與 Kuma 的分工與已知重疊 → D2。順修：RUNNABLE_DEMOS 既有兩列（2026-09-11 資料蒐集）的 `\apps\next-admin` 早先被 heredoc 吃成 BEL + 換行、表格斷行，已位元組還原）：`agency-os/docs/operations/RUNNABLE_DEMOS.md` 加一列（指令 = 步 1 的 docker build/run/curl + `bash DB/scripts/site-watch-local-verify.sh`；你會看到什麼；誠實範圍 = 尚未 prod 時寫明）；`agency-os/docs/operations/MONITORING_SYSTEMS_INVENTORY.md` 加「site-watch」段：分工 = Uptime Kuma 管**我們自家**服務的 public reachability，site-watch 管**客戶網站**的渲染後健康（可用性 + JS + 視覺），資料在 `site_watch_*`，watchdog `site-watch-LATEST.md`。
9. ✅ **四動作 + WORKLOG + commit**（2026-09-23；codex 三輪與修正見 §10 v2.7–v2.9，紀錄 WORKLOG 續109）：`npx tsc --noEmit`、`npx vitest run`、harness、renderer `npm test`、watchdog 假資料四色；review artifact 落 `agency-os/reports/oracle/`；BUGHUNT grep `sendTelegram|TelegramNotifier|buildOperatorTelegramNotifier|IncidentSource|ops_incidents_source_check|putDesignObject|deleteDesignObject|SITE_WATCH_|site_watch_touch_heartbeat` scope `agency-os,scripts,lobster-factory`；WORKLOG 四行機械證據（AGENTS.md §1）。commit 被 verify gate 擋 → `/verify-recent` 或 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1`。
10. **prod（High；每項首行 `# CONFIRMED-HIGH-RISK: <reason>`；逐項 go-ahead）**：
   - a. 建私有 R2 bucket（例 `lobster-site-watch`，**不開 public dev URL**）；VPS `/root/lobster-phase1/.env` 加 `R2_SITE_WATCH_BUCKET`、`SITE_WATCH_ENABLED=false`。**token 不在此步寫**（移到 d，理由見 d）。
   - b. `node scripts/apply-db-migration.mjs --check 0091` → `node scripts/apply-db-migration.mjs 0091`。**先於 c**：`cleanup` route 不受 kill switch 保護，部署後每小時會碰新表；watchdog 探針 d 在此之前會 🔴（預期）。
   - b2. **解除 deploy hold**：`git rm lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` + commit + push。2026-09-23 設的（`8aa473d63`）；存在時 `sg-deploy.sh` 步驟 1.85 拒絕**所有** app 部署（含手動），c 必定失敗（機制見 `DEPLOY_ROLLBACK_RUNBOOK.md §1.5`）。此步曾在 `ce4374a2a` 加入、v2 重寫時遺失，2026-09-23 補回。push 的兩個連帶效果（皆無害，但要知道）：① 這次 push 的範圍（hook 上次評估點之後）若含 `packages/workflows` 改動，post-push hook（`mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1:51,160`）立刻跑 Trigger 部署 → 兩個 site-watch task 上 prod，token 未寫 → 安靜略過（見 e）；② 主機 cron `auto-deploy-next-admin.sh`（03/07/11/15/19/23 UTC，遵守 hold）在 hold 消失後的下一格會**單獨**部署 next-admin——開關關、token 未進 compose → 無作用；renderer smoke 只在部署清單含 renderer 時跑（`sg-deploy.sh:497`），不會誤擋。c 緊接 b2 做。
   - c. 主機 `/root/lobster-phase1/scripts/sg-deploy.sh renderer next-admin`（renderer 在 RESTORABLE_APPS `:116`、node gate `:236-242`、`/render` + `/snapshot` smoke；next-admin tsc + vitest gate）。後驗 `docker exec lobster-renderer iptables -L OUTPUT -n | head` egress 仍在。
   - d. token + prod compose env：VPS `.env` 加 `SITE_WATCH_INGEST_TOKEN=$(openssl rand -hex 32)`，緊接 `printf '<environment 區塊>' | /root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/lobster-phase1/docker-compose.yml next-admin`；驗 `docker exec <next-admin> printenv SITE_WATCH_INGEST_TOKEN R2_SITE_WATCH_BUCKET SITE_WATCH_ENABLED`（唯一可信方式）。Trigger 端只同步**運行中 next-admin** 的值（`lobster-trigger-deploy.ps1`；codex round 2）：d 半途失敗（`.env` 有、容器沒有）時 Trigger 拿不到 token，heartbeat 照舊安靜略過，不會變成每小時 401；修好後重跑 d 即可。token 放這步 = 與唯一用到它的 compose 變更同一步。
   - e. `scripts/lobster-trigger-deploy.ps1`（唯一 Trigger 部署入口；PAT = `tr_pat_*`）。push 觸發的自動部署可能早已把兩個 task 帶上 prod（b2 或其他 session 的 push；d 之前 token 不存在 → heartbeat 回 `{configured:false}` 安靜略過，無害），此步仍要跑：它取運行中 next-admin 的 token（d 的 printenv 驗過才有；部署 log 印 `SITE_WATCH_INGEST_TOKEN set: yes (from running next-admin)`）並同步進 Trigger（同名覆寫、不刪其他鍵，CLI `deploy.js syncEnvVarsWithServer`）。驗（codex round 1 要求）：① Trigger 手動 trigger `site-watch-heartbeat` → output 是 `{enabled:false, triggered:0, cleanup:…}`（`WF/src/trigger/site-watch.ts:74`），**不是** `{configured:false}`（`:58` = token 沒到 worker），且 run 綠；② 排程列表有 `site-watch-heartbeat` `5 * * * *`；③ `scripts/check-site-watch-health.ps1` → 探針 a 🟢（`last_heartbeat_at` 剛更新；系統仍關）。
   - f. **金絲雀**：全域開關仍 `false` 時，先在 DB 手動 `SELECT public.site_watch_sync_targets();`（建出所有 target 列，預設 enabled）→ 用客戶頁卡片把**除一個測試客戶外**全部關掉（PATCH 不受 kill switch 影響）→ `SITE_WATCH_ENABLED=true`（safe-infra-patch）→ Trigger dashboard 手動 trigger `site-watch-heartbeat` → 只有 1 個 target 跑。驗：`site_watch_results` 1 列、R2 有該頁 baseline.jpg、卡片顯示截圖、Telegram 0 則、watchdog 🟢、Trigger `site-watch-run` 綠、renderer log 一行 `snapshot 200 up`。
   - g. 關回 `false` 再手動 trigger → `due` 回 `enabled:false`、renderer log 無 snapshot 行 → 再開 `true`。
   - h. **放量**：卡片逐一（或 SQL `UPDATE site_watch_targets SET enabled=true` 經 `site_watch_update_config` 語意——實務上就是卡片點開）把其餘客戶開回；下一個 heartbeat 全到期，`concurrencyLimit: 2` 讓它們排隊跑完（N 客戶 ≈ N×40s／2）。看 Trigger 無紅 run、renderer 無 503。更新 §0；Slice 1 完成定義（§1）逐項打勾。

## 8. Slice 2／P2／P3 設計備忘（動工時展開成 §7 同格式）
- **多頁**：`site_watch_targets` 加 `pages jsonb`（≤10 canonical URL）或子表；`pagesForSiteUrl` → `pagesForTarget`；`retirePages` 已支援。
- **頻率**：API 開放 `update_only`；C2 key 已定。
- **容量閘（R6）**：`due` 計算 hourly 目標頁數總和，>60/小時拒開新 hourly 並在卡片顯示原因；或提高 renderer `RENDERER_MAX_CONCURRENCY` 與 snapshot 併發（需重估 2G 記憶體）；renderer 加 `req.on('close')` 取消 context（客戶端斷線不再浪費截圖）。
- **軟開關（候選）**：env `SITE_WATCH_ENABLED` 改動要 `safe-infra-patch` 重建容器（~1 分鐘、要 SSH）；可加 `site_watch_maintenance.global_enabled` 由總覽表一鍵切、runner 同時檢查 env（硬底線，預設 OFF）與 DB（操作者軟開關）。AGENTS §0「自動化預設 OFF」仍由 env 承擔。
- **遮罩 selector**：每頁 `mask_selectors text[]`；renderer `/snapshot` 接 `masks[]`，截圖前 `page.evaluate` 蓋住；C6 門檻不變；D1 若降 low 在此升回 medium。
- **總覽表**：`/ops/clients` 列表加狀態欄；未開巡檢標黃；資料 = `site_watch_targets` ⋈ `site_watch_page_state`。
- **C11 wp-update 前後比對**：見 §4.2 C11；掛點 `NA/app/api/ops/clients/[slug]/wp-update/route.ts`。
- **MainWP 接線**：`addSiteToMainWp`（`WF/src/integrations/integration-steps.ts:371`，已對齊 MainWP 6.0.12：`sites/add`、Basic auth、`url/name/admin/uniqueid`；commit `7faa4f68a`／`363a505f4`）；OnboardWizard `PROVIDERS`（`NA/app/(shell)/onboard/OnboardWizard.tsx:69`）尚無 MainWP 與「網站巡檢」項 → 加兩項、預設勾。安全網：「MainWP 有、系統沒有」清單需新增唯讀 MainWP 站點清單讀取（next-admin 現無）。
- **R4 補洞**：org inactive → runner 仍跑 retire／結束訊息（或 sync 時對 inactive org 走 `disabled`）。
- **P2 登入後流程**：另開容器（不共用 renderer）帶憑證；憑證走 vault（`client_credentials` + `lib/secret-vault.ts`）；egress 只允許自己與客戶網域；High。
- **P3 部署後 smoke**：sg-deploy 後對 app.aware-wave.com 關鍵頁 `/snapshot`，pageErrors >0 → 觸發 rollback；掛在 `sg-deploy.sh` 步 7 smoke 段（步 4 的 `/snapshot` smoke 是它的雛形）。

## 9. 回滾
`SITE_WATCH_ENABLED=false`（立即停，0 renderer 呼叫）→ Trigger 停 `site-watch-heartbeat` → `git revert` → `DB/scripts/0091_site_watch_down.sql`（會刪 source='site_watch' 的 incidents）。renderer `/render` 與 collect 路徑不受影響（`withContext` 重構有 renderer test + §7 步 1 實測 + 部署 smoke）。watchdog 在系統關閉時：探針 a 仍 🟢（heartbeat 照打）、b／c 為 SKIP（無 enabled heartbeat；欠的訊息顯示為「暫停」）。

## 10. 文件關係、維護規則、變更紀錄
- 本檔 = 計畫正本；`0091_site_watch.sql` 檔頭 = I1–I3 鏡像 + 指回本檔；`TASKS.md §I` 一列 = 進度指針；WORKLOG = 過程；`agency-os/reports/oracle/2026-09-21-review-*.md` = 09-21 四輪 Codex 對舊 plan 的審查（歷史）；`RUNNABLE_DEMOS.md`／`MONITORING_SYSTEMS_INVENTORY.md` = 登記（§7 步 8）。
- **維護規則**：改 `lib/site-watch/*`／0091／renderer `/snapshot` 的 commit 必同步本檔 §3（元件表）與 §4（合約）；`:line` 只在 §3.2／§3.4／§7 出現，其餘以符號名引用；每完成 §7 一步更新 §0；D1 決定後改 §4.2 C8 + §6.2。
- 2026-09-21：`handoffs/2026-09-21-site-watch-plan.md`（設計 + 4 輪 Codex 修訂）、`handoffs/2026-09-21-site-watch-slice1-progress.md`（進度 + 13 項偏差）——已廢止，可自 commit `80b7897e6` 取回。
- 2026-09-23：`handoffs/2026-09-23-1116-site-watch-slice1.md`（合規 packet）——已併入本檔並刪除，可自 `76a0a2e3f` 取回。操作者要求「一份完整的」→ 本檔 v1（`67e4db98d`）。同日 v2：補 §1 完成定義、§3.4 env 表、§3.5 安全邊界、§4.3 決策紀錄、§5 #15、§6.1 故障模式、R6 容量、§7 步 3 watchdog／步 4 deploy smoke／步 8 登記、§11 操作手冊。同日 v2.1（設計層對抗審查）：步 4 `concurrencyLimit: 2`（fan-out > renderer queue 會 503／浪費算力）、步 10f 金絲雀放量、R7 備份邊界、R8 XSS 面、§11 ignored 語意、§8 軟開關候選 + abort-on-disconnect。同日 v2.2（執行 §7 步 1–3 + D1）：步 1 指令補 `--network`（預設 bridge 的宿主 DNS 被 renderer 自己的 egress 規則擋，本機每站 `dns`）+ `finalUrl` 只認 http(s)；D1 severity 收斂成 `config.ts severityFor` 單一來源；步 3 探針 b 改逐 target、c 改 `owed_since`（原 `updated_at` 對 Telegram 4xx／5xx 恆綠）、d 加部署判別（⚪ `NOT_DEPLOYED`）；0091 加 `owed_since` + CHECK、heartbeat 兩欄 + `site_watch_touch_heartbeat`；§11 加「多客戶同時同因告警 = 疑監控端」。同日 v2.3（執行 §7 步 4）：Trigger tasks + post 模組 + 跨套件狀態契約測試；Trigger token 選填、未設則 heartbeat 安靜略過（10a 前不讓任何 Trigger 部署變紅或被擋）；heartbeat 也 `maxAttempts: 1`；compose／`.env.example`／TASK_REFERENCE／`DEPLOY_ROLLBACK_RUNBOOK` 同步；`sg-deploy.sh` `/snapshot` smoke；補回遺失的步 10b2（解除 DEPLOY_HOLD）並把 hold 的 `reason=` 改指本檔；R9 Cloudflare 100s。同日 v2.4（執行 §7 步 5）：網站巡檢卡 + `hub-ui.tsx`／`labels.ts` 抽出；接受按鈕條件改「最近一筆有畫面判定」；修掉 core 起即紅、會擋 10c 的 repair-center policy 測試。同日 v2.5（執行 §7 步 6–7）：7 支單元測試 57 項 + 3 個突變證據；playwright-runner 檔頭照實寫（原訂修法本身也是錯的）。同日 v2.6（執行 §7 步 8）：RUNNABLE_DEMOS／MONITORING_SYSTEMS_INVENTORY 登記；新增待決 D2（與 Uptime Kuma 的客戶站重複告警）。同日 v2.7（步 9 codex review round 1 的 high）：「`deploy-workflows.ps1` 只同步 PostHog → heartbeat 永遠安靜略過」查證——該檔確實只萃取 PostHog（原 `:85`），但不是現役路徑（公網被 Cloudflare BFM 擋、依賴已退租的 EU tunnel；現役 `lobster-trigger-deploy.ps1` 已讀 token、post-push hook 亦走它）；`AWAREWAVE_WEBHOOK_BASE_URL` 缺也無害（`post.ts:56` 回退正確網址）；syncEnvVars 只 upsert（CLI `deploy.js:493-503`）。修整類而非這一例：舊腳本退役成 tombstone（部署入口只剩一個）；token 寫入 10a→10d（push 觸發的 Trigger 部署可能早於 e，token 不可比 next-admin 早到）；10e 加驗 heartbeat output／排程／watchdog a；b2 註記 push 的兩個連帶效果；§11 加 `{configured:false}` 判讀。同日 v2.8（codex round 2：2 medium，皆查證屬實）：① `infra/trigger/TASK_REFERENCE.md` §Deploy 仍教 EU 時期手跑 `npx trigger.dev deploy`（`README.md` PostHog「方式 B」同）→ 改指唯一入口；② 10d 先寫 `.env` 再 safe-infra-patch 非原子（`safe-infra-patch.sh` 只備份／還原 compose 檔，不碰 `.env`）→ patch 失敗時 token 留在 `.env`，下次 push 的部署就同步給 Trigger → 每小時 401。修整類（第二次同區回報 → 先寫不變量）：**Trigger 只會拿到運行中 next-admin 接受的值**（同步方向）——部署腳本改取 `docker exec lobster-next-admin printenv`、不讀 `.env`，一併涵蓋 10d 半途失敗、輪替未套用、compose 缺映射；部署 log 印 token 是否取到。同日 v2.9（round 3：companion 兩次無效——一次被 workspace gate 擋、一次 0 指令就 approve，皆不計；改走 `codex-oracle.ps1` fallback，2 finding）：F1「next-admin 停機時 `docker exec` 失敗會觸發 `set -e` 中斷部署」駁回——`export "X=$(…)"` 的狀態是 export 的（實測 `false`、缺執行檔 127 皆續跑；對照組一般賦值中斷）；F2「next-admin 失去 token 時 Trigger 留舊值」屬實、不改碼：自動刪 prod secret 會讓一次短暫停機變成持久移除，反方向改以「會吵」處理，§6.1 新增兩列。

## 11. 操作手冊（收到訊息怎麼辦）
| 訊息 | 意思 | 動作 |
|---|---|---|
| 🔴 網站打不開 — <客戶> | 首頁連續 2 個桶失敗（原因在訊息第 3 行） | 開客戶頁卡片看 failureCode／HTTP／截圖；`dns`／`connect` 先查客戶 DNS／憑證；`http_5xx` 查客戶主機；`blocked` = 你填的網址有問題，改 `site_url`；處理完**不用**手動結案，恢復時自動 resolve + 發恢復訊息；想靜音就在 ops-inbox 結案（之後恢復 0 則） |
| （Slice 1 不發 Telegram，D1）ops-inbox 出現 low 級「網站畫面大幅變動」incident | 與基準圖差異 >5% 連續 2 個桶 | 開卡片比對 evidence 與 diff 圖；是預期改版 → 按「接受為新基準」（streak 歸零，下一桶 match 即自動結束 episode）；是真壞 → 同上處理 |
| ✅ 已恢復 | episode 結束 | 不用動 |
| （在 ops-inbox 把 site-watch incident 標 ignored） | 只靜音**這一次** episode；下一次連 2 敗會重開同一張 incident（`upsert_incident_atomic` 對 resolved／ignored 同等重開，0056） | 永久不想看某客戶 → 卡片開關關掉，不是 ignored |
| ⏹ 巡檢已關閉／頁面已移出 | 你關了開關或改了網址，未結的告警在此收尾 | 不用動 |
| AO-RESUME `site-watch` 🟡／🔴 | 監控者自己出問題（§6.1） | a 🔴 heartbeat 停或從未：看 Trigger dashboard `site-watch-heartbeat` 最近 run（output `{configured:false}` = token 沒同步到 worker → 跑 `scripts/lobster-trigger-deploy.ps1`）；b 🟡 target 逾期：看 Trigger `site-watch-run` 紅 run 的錯誤（多半 renderer，報告列出客戶 slug）；c 🟡 欠訊息 >3h：查 Telegram token／chat id（ops-inbox 既有告警多半也壞了）；d 🔴 已部署缺 0091：步 10b；⚪ `NOT_DEPLOYED` = 尚未上線，不用動 |
| 同一時間很多客戶同一原因告警 | 多半是**監控端**壞（renderer egress／DNS），不是客戶全掛 | 先 `docker logs lobster-renderer --tail 50`、`docker exec lobster-renderer iptables -L OUTPUT -n`；確認後 `SITE_WATCH_ENABLED=false` 止血（§9） |
| 想暫停某客戶 | — | 卡片開關關掉（開著的告警會收到 ⏹ 結束訊息） |
| 想全部暫停 | — | `SITE_WATCH_ENABLED=false` 走 `safe-infra-patch.sh`（§9） |
| 想馬上跑一次 | — | Trigger dashboard 手動 trigger `site-watch-heartbeat`（只跑到期的；daily 目標同桶不重跑） |
