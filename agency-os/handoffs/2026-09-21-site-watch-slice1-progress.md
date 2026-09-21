---
slug: site-watch-slice1-progress
created_utc: 2026-09-21T12:00:00Z
hint: "site-watch slice 1 實作進度：DB/renderer/next-admin 核心完成；剩測試、Trigger task、UI 卡、env、prod"
author: Claude (Opus 5) — 週額度 96% 停手；接手者 GPT/Codex
supersedes_part_of: agency-os/handoffs/2026-09-21-site-watch-plan.md §7（契約仍以該檔 §8 為準，偏差見本檔 §3）
---

## 0. 狀態一句話
Slice 1 程式約 70%。已驗：migration harness 綠（含 down/re-apply）、renderer `npm test` 16/16、next-admin `npx tsc --noEmit` 綠。**未驗**：next-admin 單元測試（未寫）、renderer `/snapshot` 真實瀏覽器跑、任何 prod 動作。**未做 review**（Claude 寫 → 審查者須為非 Claude：接手的 GPT/Codex 即合格 oracle）。

## 1. 已完成（路徑相對 `lobster-factory/`）
| 檔 | 內容 |
|---|---|
| `packages/db/migrations/0091_site_watch.sql` | 4 表（targets/results/page_state/maintenance）+ 全部 fenced plpgsql 函式 + source check 加 `site_watch`（基底 = 0073 值，含 `collection`） |
| `packages/db/scripts/0091_site_watch_down.sql` | down |
| `packages/db/scripts/site-watch-local-verify.{sh,sql}` | docker PG16 harness：lease/fence、冪等、episode、三態通知、手動結案、disable、retire、cleanup、grants、down、re-apply。跑：`bash packages/db/scripts/site-watch-local-verify.sh` → `✅ site-watch 0091 verified` |
| `infra/hetzner-phase1-core/apps/renderer/{lib.mjs,server.mjs,test/lib.test.mjs}` | `POST /snapshot`；`withContext()` 抽出共用（`/render` 行為不變）；分類函式 + 測試 |
| next-admin `lib/ops-inbox/notify/telegram.ts` | `sendTelegram` → `TelegramDelivery` 三態（2xx sent／4xx rejected／5xx·abort·網路 uncertain）+ `AbortSignal.timeout(10s)`；`combineDeliveries`；`TelegramNotifier.sendText/chatCount/meetsMinSeverity`；`buildOperatorTelegramNotifier()`（dispatcher 與 site-watch 共用） |
| next-admin `lib/ops-inbox/notify/dispatcher.ts` | 改用 `buildOperatorTelegramNotifier()`；行為不變 |
| next-admin `lib/ops-inbox/{types.ts,notify/rules.ts}`、`lib/repair-center/policy.ts`、`app/api/ops/inbox/incidents/route.ts`、`app/(shell)/ops/inbox/components/IncidentCard.tsx` | 註冊 `site_watch` source；dispatcher skip（`site_watch_direct_notify`）；policy `human_only` |
| next-admin `lib/storage/r2.ts` | 新增 bucket 通用 `r2PutObject/r2GetObject/r2DeleteObject/r2ListObjects`；`putDesignObject/deleteDesignObject` 改委派（錯誤碼字串不變，put 無預設 timeout 保持原行為） |
| next-admin `lib/site-watch/*` | `config`（kill switch、bucket、門檻、lease 公式）、`runKey`（C2 分桶）、`pages`（C1）、`diff`（pixelmatch+sharp）、`storage`（key 佈局/解析）、`rendererClient`、`store`（只呼叫 RPC）、`messages`、`notify`（I2/I3）、`runner`、`objects`、`cleanup`、`console`（卡片後端）、`wiring`（prod deps + bearer） |
| next-admin routes | `app/api/internal/site-watch/{due,run/[targetId],cleanup}/route.ts`（bearer `SITE_WATCH_INGEST_TOKEN`）；`app/api/ops/clients/[slug]/site-watch/{route.ts,accept-baseline/route.ts,image/route.ts}` |
| next-admin `package.json` | `pixelmatch ^7.2.0`（ESM，依賴 pngjs） |

## 2. 資料流（實作後）
Trigger 每小時 heartbeat（**未寫**）→ `POST /api/internal/site-watch/due`（kill switch OFF 回空；`site_watch_sync_targets()` 為每個 active org 且有 `client_config.site_url` 建 target、預設 enabled/daily/22 UTC；回 到期 ∪ 欠通知 的 target id）→ 每 target 一個 child task → `POST /api/internal/site-watch/run/<id>` → `runTarget()`：claim lease → retire 不在清單的頁 → 到期則每頁 renew→`/snapshot`→比對→`site_watch_record_check` → `complete_run` → 通知步驟 → release。另每小時 `POST /api/internal/site-watch/cleanup`（每 UTC 日實跑一次）。
理由：renderer 只在 `renderer-net`，只有 next-admin 連得到（`docker-compose.yml` renderer 區塊註解「shared ONLY with next-admin」），所以 Trigger 端只能做薄層。

## 3. 相對 plan §8 的偏差（皆已實作，接手者勿改回）
- D1 截圖 JPEG q80（非 PNG）：1366×8000 PNG 常 >5MB。baseline key `baseline.jpg`，diff 圖 `-diff.jpg`。
- D2 `too_large` 不是站點失敗 → `screenshotSkipped`（visual='skipped'）；failureCode 枚舉 = `timeout|http_4xx|http_5xx|dns|connect|blocked|navigation`（`renderer/lib.mjs SNAPSHOT_FAILURE_CODES`）。
- D3 renderer 掛掉／DB 錯 = 監控自身故障：**不記 result、不算 streak**，run 不 complete、同桶下次重試，錯誤走 Trigger run 失敗 + Sentry（child task 須在 `status==='renderer_unavailable'` 時 throw）。renderer 對 `url_*` 400 → 視為站點 `blocked`（網址設定錯）。
- D4 冪等靠 `site_watch_results` UNIQUE(target,run_key,page)：只有插入成功的那次會動 page_state；`last_counted_run_key` 欄位取消。
- D5 狀態轉移在 plpgsql（持 target row lock + lease 檢查），TS 只編排；不變量是 CHECK constraint（`site_watch_episode_iff_alert` 等）。
- D6 關閉巡檢／頁面移出清單也走「episode 結束」：已送或不確定的告警一定補一則結束訊息（reason `disabled|page_removed`），延伸 I3。
- D7 `ops_incidents` 另有 UNIQUE(source, external_id)（`0013_ops_inbox.sql:54`）→ site-watch external_id = fingerprint = `site_watch:<org>:<page_id>:<kind>`；新 episode 以 `upsertIncidentAtomic(..., isReopen=true)` 重開同一列。
- D8 R2 走 Cloudflare REST（`lib/storage/r2.ts` 無 S3 金鑰）→ 無法產 signed URL；改 **已驗證 proxy route** `.../site-watch/image`，以 row id 定址、不接受 object key。
- D9 私有 bucket env `R2_SITE_WATCH_BUCKET` **無預設**（designs bucket 是公開的）；未設 = 只做可用性、visual 記 skipped `storage_unconfigured`。
- D10 JS 錯誤：slice 1 只記錄（count + sample，卡片顯示），不告警（多數 WP 站常駐 console error，會變噪音）。
- D11 API 接受 `hourly|every_6h|daily`；`update_only` 拒收直到 slice 2 wp-update hook。
- D12 通知 Telegram 關閉（`OPS_INBOX_TELEGRAM_NOTIFY_ENABLED` 非真）或低於 min severity → 記 `skipped`（終態，恢復靜默）。可用性 severity=high、visual=medium。
- D13 cleanup 不受 kill switch 影響（保留期承諾）；orphan 與 baseline 皆有 24h grace；`lastModified` 未知者不刪。

## 4. 剩餘工作（依序；每步完成跑對應驗證）
1. **next-admin 單元測試**（vitest，放 `lib/site-watch/__tests__/`）：`runKey`（plan §8 驗收：22:00 起 24 次 heartbeat 同 key；22:00–23:59 全失效 → 次日 00:00 仍前一桶；跳 3 桶 skipped=2）、`pages`（canonical/page_id）、`telegram`（`combineDeliveries` 四種組合；`sendTelegram` mock fetch：200/400/500/abort）、`notify`（fake store：Telegram 關→skipped；剩餘租期不足→deferred 且不 begin；begin false→stale；4xx→finish rejected；hang→uncertain）、`runner`（kill switch OFF → snapshot 0 次；`RendererUnavailable` → 不 recordCheck、不 completeRun、狀態 renderer_unavailable；recordCheck `fenced` → lease_lost 且 release 仍呼叫）、`diff`（sharp 生兩張合成圖：相同→0、半張不同→≈0.5、高度差計入）、`cleanup`（fake objects：>30d orphan 刪、baseline 活著不刪、無 lastModified 不刪）。然後 `npx vitest run`（全套，基準 1462 pass）。
2. **Trigger.dev**（`packages/workflows/`）：`src/lib/siteWatch/post.ts`（仿 `src/lib/collection/postRunDueSchedules.ts`：`SITE_WATCH_INGEST_TOKEN` + `AWAREWAVE_WEBHOOK_BASE_URL`）；`src/trigger/site-watch.ts`：`schedules.task` id `site-watch-heartbeat` cron `5 * * * *` → post due → `siteWatchRun.batchTrigger(ids)`；再 post cleanup；`task` id `site-watch-run`、`retry: { maxAttempts: 1 }`（C3：不靠 Trigger 重試）、呼叫 run route，`renderer_unavailable` 時 throw。仿 `collect-scheduled-crawl.ts` 的 `captureWorkflowException`。加 `trigger.config.ts` syncEnvVars `SITE_WATCH_INGEST_TOKEN`；`infra/trigger/TASK_REFERENCE.md` 兩處（env 表 + task 段）；`D:\Work\scripts\lobster-trigger-deploy.ps1`（仿 `COLLECT_SCHEDULE_INGEST_TOKEN` 讀 VPS .env 的 :56-62 與 export :134）。測試仿 `postRunDueSchedules.test.ts`。
3. **UI 卡**：新檔 `app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（"use client"），放進 `ClientHubTabs.tsx` `MaintenanceTab`（:747）最上方；**不要**把卡片內容寫進 2896 行的 ClientHubTabs。規則：按鈕/核取方格/chips，禁 `<select>`（操作者兩次明講）；開關 checkbox；頻率 chips 每小時／每 6 小時／每天；時間數字 input（UTC，顯示台北 = +8）；PATCH 帶 `expectedVersion`（target null 時 0），409 → 重新 GET 並提示「別人剛改過」。顯示：全域未開（`globallyEnabled=false`）黃條「SITE_WATCH_ENABLED 未開，目前不會巡檢」；`storageConfigured=false` 提示；每頁 availability/visual 狀態、streak、episode；最近 10 筆結果（時間、HTTP、failureCode 中文用 `lib/site-watch/messages.ts failureLabel`——需匯出成 client-safe 常數或複製 map 到獨立無 server import 的檔）、JS 錯誤數；有 `evidence_key` 顯示 `<img src=".../site-watch/image?result=<id>&which=evidence">`、diff 同理；visual episode 開著 → 「接受為新基準」按鈕（POST accept-baseline）。樣式沿用 `ClientHubTabs.tsx:181 Card`、`:235 ChipBtn` 的 CSS 變數。
4. **env**：repo `infra/hetzner-phase1-core/docker-compose.yml` next-admin environment（`COLLECT_SCHEDULE_INGEST_TOKEN` 在 :275 附近）加 `SITE_WATCH_ENABLED: ${SITE_WATCH_ENABLED:-}`、`SITE_WATCH_INGEST_TOKEN: ${SITE_WATCH_INGEST_TOKEN:-}`、`R2_SITE_WATCH_BUCKET: ${R2_SITE_WATCH_BUCKET:-}`；`.env.example` 同步。**prod compose 不會被 sg-deploy 同步**（AGENTS.md §0）→ 走 `safe-infra-patch.sh compose`。
5. `D:\Work\scripts\playwright-runner.ps1:8` 檔頭 `Also called post-deploy by sg-deploy hooks (Mode=smoke only)` = 假（plan §4），改為實況：只由 `/playwright` skill 呼叫。
6. **renderer 真實測試**：`docker build -t sw-renderer-test infra/hetzner-phase1-core/apps/renderer`，`docker run --rm --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SETUID --cap-add SETGID --cap-add SETPCAP -e RENDERER_SHARED_SECRET=t -p 127.0.0.1:3999:3000 sw-renderer-test`，`curl -s -X POST localhost:3999/snapshot -H 'x-renderer-secret: t' -H 'content-type: application/json' -d '{"url":"https://example.com"}'`：驗 `failureCode:null`、`screenshotBytes>0`、base64 解出是 JPEG（`FF D8`）；再打一個 404 網址驗 `http_4xx`、不存在網域驗 `dns`；再打 `/render` 確認沒退化。**看實際圖片**（memory：驗真實產物，不驗代理指標）。
7. **驗證四動作 + WORKLOG**：`npx tsc --noEmit`、`npx vitest run`、harness、renderer test；review 由非 Claude 模型做（接手者即是）；BUGHUNT grep `sendTelegram|TelegramNotifier|buildOperatorTelegramNotifier|IncidentSource|ops_incidents_source_check|putDesignObject|deleteDesignObject` scope `agency-os,scripts,lobster-factory`；WORKLOG 四行機械證據（格式見 `agency-os/AGENTS.md §1`）。突變測試建議：把 0091 `site_watch__apply` 的 `>= 2` 改 `>= 3` → harness 必紅；還原。
8. **prod（High，每步需操作者明示 go-ahead，首行 `# CONFIRMED-HIGH-RISK:`）**，順序：
   a. 建私有 R2 bucket（例 `lobster-site-watch`，**不開 public dev URL**）；VPS `/root/lobster-phase1/.env` 加 `R2_SITE_WATCH_BUCKET`、`SITE_WATCH_INGEST_TOKEN`（`openssl rand -hex 32`）、`SITE_WATCH_ENABLED=false`。
   b. migration：`node scripts/apply-db-migration.mjs 0091`（先確認該腳本存在路徑；0081 檔頭寫同指令）。
   c. renderer：code 改動需 **重建 image**；先讀 `/root/lobster-phase1/scripts/sg-deploy.sh` 確認是否處理 renderer（檔頭說只 rsync `apps/<APP>`），否則 rsync `apps/renderer` 後 `docker compose build renderer` + `safe-infra-patch.sh` 流程重建；驗 `docker exec lobster-renderer` 內 egress policy 仍在。
   d. next-admin：`sg-deploy.sh`（含 npm test gate）。
   e. compose env：`safe-infra-patch.sh compose`；`docker exec <next-admin> printenv SITE_WATCH_INGEST_TOKEN R2_SITE_WATCH_BUCKET SITE_WATCH_ENABLED` 驗。
   f. Trigger deploy（`scripts/lobster-trigger-deploy.ps1`）。
   g. 開 `SITE_WATCH_ENABLED=true`（safe-infra-patch）→ 手動觸發 heartbeat 一次 → 看一個客戶頁卡片、R2 baseline 圖、`site_watch_results` 一列。

## 5. 已知風險／待決
- R1 Telegram at-least-once：最多 1 則重複（plan I2 已接受）。
- R2 lease window 最小 300s = run route `maxDuration`；自架 Next 不強制 maxDuration，route 被砍時最長延遲 = window + 1h（plan C3 已接受）。
- R3 `IncidentSource` 型別缺 `collection`（`lib/collect/report-store.ts:169` 繞過型別直寫）＝既有漂移，未修；若補需同時補 `policy.ts` catalog。
- R4 `site_watch_sync_targets` 只看 `organizations.status='active'`；org 之後變 inactive → runner 不再檢查（monitored=false），不會 retire 也不會發 disabled 結束訊息——若該 org 有開著的 episode，恢復訊息要等 org 重新 active。可接受或 slice 2 補。
- R5 R2 list 回應的 `last_modified` 欄位名未對 prod 實測；缺值時 cleanup 保守不刪（evidence 會累積）→ prod 首次 cleanup 後查 `deletedObjects`。

## 6. 回滾
`SITE_WATCH_ENABLED=false`（立即停，0 renderer 呼叫）→ Trigger 停 schedule → `git revert` → `0091_site_watch_down.sql`（會刪 source='site_watch' 的 incidents）。renderer `/render` 與 collect 路徑不受影響（`withContext` 重構有 renderer test + 待第 6 步實測）。
