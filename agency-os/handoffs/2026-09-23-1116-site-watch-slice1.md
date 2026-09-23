---
slug: site-watch-slice1
created_utc: 2026-09-23T03:16:37Z
hint: "site-watch slice 1：核心已落地未測未上線；接手完成測試、Trigger task、UI 卡、env、renderer 實測、review、prod"
source_session_summary: "重擬交接包，取代 09-21 的 plan 與 progress 兩份（互相矛盾、不合 SCHEMA、未登記 TASKS）；程式狀態自 deab0f709 起無變動"
---

## 1. 任務目標
每個客戶的首頁每天巡一次（預設 22:00 UTC 起算的 24h 桶）：打開、收 JS 錯誤、全頁截圖與基準圖比對。連續 2 次失敗 → 開 ops incident + Telegram 1 則；恢復 → Telegram 1 則；正常不出聲。結果 30 天自動刪、基準圖每頁 1 張、全域 kill switch、客戶頁一張「網站巡檢」卡。**完成 = prod 上一個真實客戶跑出 `site_watch_results` 1 列 + R2 baseline 圖 + 卡片顯示；`SITE_WATCH_ENABLED=false` 時 renderer 0 呼叫；WORKLOG 四動作證據行齊。**

## 2. 為什麼做
操作者 2026-09-21 定案：自架 Playwright renderer 上線後的第一個內部消費者；現況客戶站只有 Uptime Kuma 的 public reachability，沒有 JS 錯誤與畫面回歸偵測。
**操作者已拍板（勿重問）**：設定入口 = 客戶頁卡片；按鈕／核取方格／chips，禁 `<select>`，選取預設多選；新客戶預設開、每天 1 次；電商與 app.aware-wave.com 每小時（slice 1 由操作者在卡片手動改 hourly）；不產日報、失敗才通知、同一問題一次＋恢復一次、連 2 次才報；週摘要預設關；正常結果一行、30 天刪；總覽表＋多頁＋wp-update 前後比對＋MainWP wizard 接線 = slice 2；容器資源上限沿用 renderer 現值（2G／2 CPU／1024 pids）。

## 3. 已試過
### 已落地並驗證（commit `deab0f709`，2026-09-21；路徑相對 `$WORK_ROOT/lobster-factory/`）
| 檔 | 內容 | 驗證 |
|---|---|---|
| `packages/db/migrations/0091_site_watch.sql` | 表 `site_watch_targets/results/page_state/maintenance`；不變量 CHECK（`site_watch_episode_iff_alert` 等）；全部 fenced plpgsql 函式；`ops_incidents_source_check` 加 `site_watch`（基底 = 0073 值）；**檔頭 = 設計 SSOT（I1–I3、C1–C12 glossary）** | `bash packages/db/scripts/site-watch-local-verify.sh` → `✅ site-watch 0091 verified`（docker postgres:16；lease/fence、冪等、episode、三態通知、手動結案、disable、retire、cleanup、grants、down、re-apply） |
| `packages/db/scripts/0091_site_watch_down.sql` | down（刪 source='site_watch' incidents 後還原 0073 constraint） | 同上 harness |
| `infra/hetzner-phase1-core/apps/renderer/{server.mjs,lib.mjs,test/lib.test.mjs}` | `POST /snapshot`（`snapshot()` :192；常數 :52-60：1366×900、高 ≤8000、load 15s／idle 15s／shot 30s、≤5MB、JPEG q80、併發 1）；`withContext()` 抽共用，`/render` 行為不變；failure codes `lib.mjs:132` | `npm test` 16/16 |
| next-admin `lib/ops-inbox/notify/telegram.ts` | `sendTelegram` :173 → `TelegramDelivery` 三態 + `AbortSignal.timeout(10s)`（:29）；`combineDeliveries` :36；`sendText` :61；`buildOperatorTelegramNotifier` :97（dispatcher 與 site-watch 共用） | `npx tsc --noEmit` 綠；dispatcher 行為不變（`dispatcher.ts` 改用 builder） |
| next-admin `lib/ops-inbox/{types.ts,notify/rules.ts}`、`lib/repair-center/policy.ts`、`app/api/ops/inbox/incidents/route.ts`、`app/(shell)/ops/inbox/components/IncidentCard.tsx` | `site_watch` source 註冊；dispatcher skip `site_watch_direct_notify`；policy `human_only` | tsc |
| next-admin `lib/storage/r2.ts` | bucket 通用 `r2PutObject/r2GetObject/r2DeleteObject/r2ListObjects`；designs 函式改委派，錯誤碼字串不變 | tsc |
| next-admin `lib/site-watch/*`（14 檔） | `config`／`runKey`／`pages`／`diff`／`storage`／`rendererClient`／`store`（只呼叫 RPC）／`messages`／`notify`／`runner`／`objects`／`cleanup`／`console`／`wiring` | tsc；**無單元測試** |
| next-admin routes | `app/api/internal/site-watch/{due,run/[targetId],cleanup}/route.ts`（bearer `SITE_WATCH_INGEST_TOKEN`）；`app/api/ops/clients/[slug]/site-watch/{route,accept-baseline/route,image/route}.ts` | tsc；**未實跑** |
| next-admin `package.json` | `pixelmatch ^7.2.0` | `npm install` 完成 |

### 資料流（實作即 SSOT）
Trigger 每小時 heartbeat（**未寫**）→ `POST /api/internal/site-watch/due`（kill switch OFF → 空；`site_watch_sync_targets()` 為每個 active org 且 `client_config.site_url` 為 http(s) 建 target，預設 enabled／daily／22 UTC；回「到期 ∪ 欠通知」target id）→ 每 target 一個 child task → `POST /api/internal/site-watch/run/<id>` → `runner.ts runTarget()` :52：claim → retire 不在清單的頁 → 到期則每頁 renew → `/snapshot` → 比對 → `site_watch_record_check` → `complete_run` → 通知步驟（`notify.ts runNotifications` :69）→ release。另每小時 `POST /api/internal/site-watch/cleanup`（每 UTC 日實跑一次）。
理由：renderer 只掛 `renderer-net`，只有 next-admin 連得到（`docker-compose.yml:522`）→ Trigger 端只做薄層。

### 設計定案（已實作，勿改回；label 定義在 0091 檔頭）
- 截圖 JPEG q80，baseline key `site-watch/<org>/<page>/baseline.jpg`，evidence `.../evidence/<ts>-<rand>.jpg`／`-diff.jpg`（`lib/site-watch/storage.ts`）。
- `too_large`／截圖失敗 ≠ 站點失敗 → `screenshotSkipped`，visual='skipped'。failure codes = `timeout|http_4xx|http_5xx|dns|connect|blocked|navigation`。
- renderer 掛掉／DB 錯 = 監控自身故障：不記 result、不算 streak、run 不 complete、同桶下次重試（`runner.ts:91` `RendererUnavailable`）；renderer 對 `url_*` 回 400 → 視為站點 `blocked`（`rendererClient.ts`）。
- 冪等 = `site_watch_results UNIQUE(target_id, run_key, page_id)`：只有插入成功那次動 page_state。
- 狀態轉移全在 plpgsql（target row lock + lease 檢查），TS 只編排。
- 關閉巡檢／頁面移出清單也走 episode 結束：已送或不確定的告警一定補結束訊息（reason `disabled|page_removed`）。
- `ops_incidents` 有 UNIQUE(source, external_id)（`0013_ops_inbox.sql:54`）→ external_id = fingerprint = `site_watch:<org>:<page_id>:<kind>`；新 episode 以 `upsertIncidentAtomic(…, isReopen=true)` 重開同一列。
- R2 走 Cloudflare REST、無 S3 金鑰 → 無 signed URL；圖只經 `…/site-watch/image` 以 row id 定址（不接受 object key）。
- 私有 bucket env `R2_SITE_WATCH_BUCKET` **無預設**（designs bucket 是公開的）；未設 = 只做可用性，visual 記 `storage_unconfigured`。
- JS 錯誤只記錄（count + sample），不告警（WP 站常駐 console error）。
- API 只收 `hourly|every_6h|daily`；`update_only` 等 slice 2。
- Telegram 關（`OPS_INBOX_TELEGRAM_NOTIFY_ENABLED` 非真）或低於 min severity → `skipped` 終態、恢復靜默；可用性 severity=high、visual=medium。
- cleanup 不受 kill switch 影響；orphan／baseline 皆 24h grace；`lastModified` 未知不刪。

## 4. 卡在哪
無技術阻塞；停點 = 操作者 2026-09-21 週額度 96%。`git log deab0f709..HEAD -- lobster-factory` 對 site-watch 零新 commit（2026-09-23 確認）。缺：
- (a) `lib/site-watch/` 無 `__tests__/`。
- (b) `packages/workflows/src/trigger/` 無 site-watch task。
- (c) 無 UI 卡（`app/(shell)/ops/clients/[slug]/` 無 `SiteWatchCard.tsx`）。
- (d) `docker-compose.yml`／`.env.example`／`trigger.config.ts`／`TASK_REFERENCE.md`／`lobster-trigger-deploy.ps1` 皆無 `SITE_WATCH_*`／`R2_SITE_WATCH_BUCKET`。
- (e) `/snapshot` 未開真瀏覽器跑過。
- (f) 未經非 Claude 模型 review（Claude 寫 → 接手的 GPT/Codex 即合格 oracle；AGENTS.md §4）。
- (g) prod 全未動（migration／renderer／next-admin／Trigger／env）。

## 5. 下一步指令
NA = `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。步驟 1–7 本機 Low/Medium 直接做；步驟 8 每一子項 High，等操作者明示 go-ahead。

1. **單元測試** `NA/lib/site-watch/__tests__/*.test.ts`（vitest，仿 `NA/lib/collect/__tests__/`）：
   - `runKey`：daily hour_utc=22，假時鐘自 22:00 每小時 24 次 → 同一 key；22:00–23:59 全失效後 00:00 → key 仍前一桶；跳 3 桶 → `skippedBuckets`=2；hourly／every_6h key 格式。
   - `pages`：`canonicalUrl` 去 query/fragment/尾斜線、拒非 http(s)／含憑證；`pageIdFor` 16 hex。
   - `telegram`（放 `NA/lib/ops-inbox/notify/__tests__/telegram.test.ts`）：mock `fetch` 200／400／500／abort → sent／rejected／uncertain／uncertain；`combineDeliveries`：全 sent、全 rejected、混合 → uncertain。
   - `notify`（fake store）：notifier null → `skipped`；`renew` 回不足 `minLeaseForSend` → `deferred` 且 `notifyBegin` 未呼叫；`notifyBegin` false → `stale`；rejected → `notifyFinish('rejected')`；`recovery_state='pending_resolve'` 且 `resolveForRecovery` 回 `closed_by_operator` → 不送。
   - `runner`（fake deps）：`enabled()` false → snapshot 0 次、狀態 `kill_switch`；`RendererUnavailable` → `recordCheck`／`completeRun` 0 次、狀態 `renderer_unavailable`；`recordCheck` 回 `fenced` → `lease_lost` 且 `release` 仍呼叫；正常 → `complete_run` 1 次、`runKey` 為當前桶。
   - `diff`：sharp 生兩張 100×100 合成圖：相同 → 0；半張反色 → ≈0.5；高度 100 vs 150 → 額外列計入。
   - `cleanup`（fake objects）：>30 天 orphan 刪；被 result 引用不刪；live baseline 不刪；`lastModified` null 不刪；`claim` false → 不動。
   - 跑：`cd NA && npx vitest run lib/site-watch lib/ops-inbox/notify` → 綠；再 `npx vitest run`（2026-09-21 基準 1462 pass／13 skip）。
   - 突變證據：0091 `site_watch__apply` 的 `>= 2` 改 `>= 3` → harness 必紅，還原；`notify.ts:61` 拿掉 `deferred` 判斷 → 指名測試紅，還原。
2. **Trigger.dev**（`$WORK_ROOT/lobster-factory/packages/workflows/`）：
   - `src/lib/siteWatch/post.ts`：仿 `src/lib/collection/postRunDueSchedules.ts`，env `SITE_WATCH_INGEST_TOKEN` + `AWAREWAVE_WEBHOOK_BASE_URL`；三個 POST：`/api/internal/site-watch/due`、`/run/<id>`、`/cleanup`。測試仿 `postRunDueSchedules.test.ts`。
   - `src/trigger/site-watch.ts`：`schedules.task` id `site-watch-heartbeat` cron `5 * * * *` → post due → 對每個 id `siteWatchRun.trigger({ targetId })` → post cleanup；`task` id `site-watch-run`，`retry: { maxAttempts: 1 }`（不靠 Trigger 重試，靠租約到期），呼叫 run route，`result.status === "renderer_unavailable"` 時 `throw`（讓 run 標紅 + Sentry），其他狀態 return。仿 `collect-scheduled-crawl.ts` 的 `captureWorkflowException`。`src/trigger/index.ts` 加 export。
   - `trigger.config.ts:55-56` 旁加 `SITE_WATCH_INGEST_TOKEN` syncEnvVars；`$WORK_ROOT/lobster-factory/infra/trigger/TASK_REFERENCE.md` env 表（:29 旁）+ task 段（:232 旁）；`$WORK_ROOT/scripts/lobster-trigger-deploy.ps1` 仿 `COLLECT_SCHEDULE_INGEST_TOKEN`（讀 VPS `.env` :56-62、export :134）。
3. **UI 卡** 新檔 `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（"use client"），插入 `ClientHubTabs.tsx` `MaintenanceTab`（:747）最上方；**不要**把內容寫進 2896 行的 ClientHubTabs。樣式沿用 `Card` :181、`ChipBtn` :235。GET/PATCH `/api/ops/clients/<slug>/site-watch`；PATCH body `{expectedVersion（target null 時 0）, enabled, frequency, hourUtc}`，409 → 重新 GET 並提示「別人剛改過」。顯示：`globallyEnabled=false` 黃條「SITE_WATCH_ENABLED 未開，目前不會巡檢」；`storageConfigured=false` 提示；開關 checkbox；頻率 chips 每小時／每 6 小時／每天；時間數字 input（UTC，旁註台北 +8）；每頁 availability／visual 的 streak／alert_state／recovery_state；最近 10 筆結果（時間、HTTP、failureCode 中文——`messages.ts failureLabel` 匯入 client 會拖進 server import，改把 `FAILURE_LABEL` map 移到獨立無 import 的 `lib/site-watch/labels.ts` 兩邊共用）、JS 錯誤數；`evidence_key`／`diff_key` 非空 → `<img src="/api/ops/clients/<slug>/site-watch/image?result=<id>&which=evidence|diff">`；visual episode 開著 → 「接受為新基準」按鈕 POST `accept-baseline {pageId}`。
4. **env／文件**：repo `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` next-admin `environment:`（:275 `COLLECT_SCHEDULE_INGEST_TOKEN` 旁）加 `SITE_WATCH_ENABLED: ${SITE_WATCH_ENABLED:-}`、`SITE_WATCH_INGEST_TOKEN: ${SITE_WATCH_INGEST_TOKEN:-}`、`R2_SITE_WATCH_BUCKET: ${R2_SITE_WATCH_BUCKET:-}`；`.env.example` 同步（:84-87 Telegram 三行附近）。repo compose 只是「日後對照」，prod 由步驟 8d 套。
5. `$WORK_ROOT/scripts/playwright-runner.ps1:8` `Also called post-deploy by sg-deploy hooks (Mode=smoke only)` 為假（`sg-deploy.sh` 無 playwright）→ 改為「Called only by the /playwright skill」。
6. **renderer 真實測試**（本機 docker）：`cd $WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/renderer && docker build -t sw-renderer-test .`；`docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SETUID --cap-add SETGID --cap-add SETPCAP -e RENDERER_SHARED_SECRET=t -p 127.0.0.1:3999:3000 sw-renderer-test`；`curl -s -X POST localhost:3999/snapshot -H 'x-renderer-secret: t' -H 'content-type: application/json' -d '{"url":"https://example.com"}'` → 驗 `failureCode:null`、`screenshotBytes>0`、base64 解出檔頭 `FF D8`（**打開看圖**）；`https://example.com/nope` → `http_4xx`；`https://no-such-host-xyz.invalid` → `dns`；再打 `/render` 一次確認未退化。
7. **驗證四動作 + WORKLOG + commit**：`cd NA && npx tsc --noEmit`、`npx vitest run`、harness、renderer `npm test`；review 由接手者（非 Claude）做，artifact 落 `$WORK_ROOT/agency-os/reports/oracle/`；BUGHUNT grep `sendTelegram|TelegramNotifier|buildOperatorTelegramNotifier|IncidentSource|ops_incidents_source_check|putDesignObject|deleteDesignObject|SITE_WATCH_` scope `agency-os,scripts,lobster-factory`；WORKLOG 四行機械證據（格式 `$WORK_ROOT/agency-os/AGENTS.md §1`）。commit 若被 verify gate 擋：先 `/verify-recent`，或 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1`（本機無 `pwsh`）。
8. **prod（High；每項首行 `# CONFIRMED-HIGH-RISK: <reason>`，逐項等 go-ahead）**：
   - a. Cloudflare 建私有 R2 bucket（例 `lobster-site-watch`，**不開 public dev URL**）；VPS `/root/lobster-phase1/.env` 加 `R2_SITE_WATCH_BUCKET=<bucket>`、`SITE_WATCH_INGEST_TOKEN=$(openssl rand -hex 32)`、`SITE_WATCH_ENABLED=false`。
   - b. `node $WORK_ROOT/scripts/apply-db-migration.mjs --check 0091` → 看 resolve 結果 → `node $WORK_ROOT/scripts/apply-db-migration.mjs 0091`（含 `NOTIFY pgrst`）。
   - c. 主機上 `/root/lobster-phase1/scripts/sg-deploy.sh renderer next-admin`：renderer 已在 RESTORABLE_APPS（`sg-deploy.sh:116`）、有 node --check/--test gate（:215-225）與真實 render smoke（:476-491）；next-admin 走 tsc + vitest gate。部署後 `docker exec lobster-renderer iptables -L OUTPUT -n | head` 確認 egress policy 仍在。
   - d. prod compose env：`printf '<新 environment 區塊>' | /root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/lobster-phase1/docker-compose.yml next-admin`（用法 `safe-infra-patch.sh:8`）；驗 `docker exec <next-admin 容器> printenv SITE_WATCH_INGEST_TOKEN R2_SITE_WATCH_BUCKET SITE_WATCH_ENABLED`（唯一可信方式，AGENTS.md §0）。
   - e. `$WORK_ROOT/scripts/lobster-trigger-deploy.ps1`（Trigger deploy；PAT = `tr_pat_*`）。
   - f. 開關：`SITE_WATCH_ENABLED=true` 走 safe-infra-patch → 在 Trigger dashboard 手動 trigger `site-watch-heartbeat` 一次 → 驗：`site_watch_targets` 有列、`site_watch_results` 1 列、R2 有 `site-watch/<org>/<page>/baseline.jpg`、客戶頁卡片顯示、Telegram 0 則（正常站）。
   - g. 關回 `false` 再手動 trigger 一次 → `due` 回 `enabled:false`、renderer log 無 snapshot 行 → 再開 `true` 留著。

## 6. 相關資源
- **Files**（`$WORK_ROOT/lobster-factory/…`）：`packages/db/migrations/0091_site_watch.sql`（設計 SSOT）；`packages/db/scripts/{0091_site_watch_down.sql,site-watch-local-verify.sh,site-watch-local-verify.sql}`；`infra/hetzner-phase1-core/apps/renderer/{server.mjs,lib.mjs,test/lib.test.mjs}`；next-admin `lib/site-watch/*`、`lib/ops-inbox/notify/telegram.ts`、`lib/storage/r2.ts`、`app/api/internal/site-watch/**`、`app/api/ops/clients/[slug]/site-watch/**`；模式範本 `packages/workflows/src/trigger/collect-scheduled-crawl.ts`、`src/lib/collection/postRunDueSchedules.ts`、next-admin `app/api/internal/collect/run-due-schedules/route.ts`、`app/(shell)/ops/collect/CollectionSourcesPanel.tsx`（`ScheduleControls` = 卡片 UI 慣例）。
- **Commits**：`deab0f709` slice 1 核心；`80b7897e6` WORKLOG；`7ad045869`／`176301bc2` renderer 上線；`3ca1cc9d1`…`15c0d1864` 舊計畫檔演進（本包已取代；舊檔 `2026-09-21-site-watch-plan.md`／`-slice1-progress.md` 可自 `80b7897e6` 取回）。
- **VPS**（ks-aw-01 `145.239.195.47 -p 58122`）：`/root/lobster-phase1/{docker-compose.yml,.env}`、`/root/lobster-phase1/scripts/{sg-deploy.sh,safe-infra-patch.sh}`、容器 `lobster-renderer`（host port 3190，僅 127.0.0.1）。
- **Known landmines**：
  - renderer 只在 `renderer-net`（compose :522）；Trigger worker 連不到，別把截圖搬去 Trigger。
  - `R2_SITE_WATCH_BUCKET` 不得預設或回退到 designs bucket（公開）。
  - `ops_incidents` UNIQUE(source, external_id)（`0013:54`）與 UNIQUE(fingerprint, environment) 並存。
  - `IncidentSource` 型別本就缺 `collection`（`lib/collect/report-store.ts:169` 繞過型別）——既有漂移，補時要同步 `policy.ts` catalog。
  - prod compose 不被 sg-deploy 同步（AGENTS.md §0）；env 驗證只信 `docker exec printenv`。
  - lease window 下限 300s = run route `maxDuration`；route 被砍時最長延遲 = window + 1h（已接受）。Telegram at-least-once：最多 1 則重複（已接受）。
  - org 轉 inactive 後其開著的 episode 不會收到結束訊息（`runner.ts` monitored=false 不跑 retire）——slice 2 補或接受。
  - R2 list 回應 `last_modified` 欄位名未對 prod 實測；缺值時 cleanup 保守不刪 → prod 首次 cleanup 後查 `deletedObjects`。
  - 工具坑：Bash 呼叫 `.ps1` 用正斜線；bash heredoc 餵 python 在本機會失敗（寫 scratch 檔）；測試產物寫 `$env:TEMP`（auto-checkpoint hook 會 commit repo 內任何 dirty 檔）；從 `D:\Work` 根 grep 看不到 `.claude/` junction（另 grep `D:\Work\.claude`）。
  - Codex 接手時 hooks 可能未 trust（AGENTS.md §4）→ 手動等價執行 git log／風險分級／驗證／WORKLOG／commit。
