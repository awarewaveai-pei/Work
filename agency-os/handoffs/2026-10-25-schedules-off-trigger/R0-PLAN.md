# 排程離開 Trigger、所有時鐘一頁看完 — R0 七段

> 起因：2026-10-25 Trigger prod 停擺 34h（WORKLOG 2026-10-25 續20，`runbooks/TRIGGER-RUNS-STUCK-QUEUED.md`）。操作者要求：盡量不用 Trigger；所有依賴外部服務的排程在一處看完；懶得跑 AO-RESUME 也要知道。狀態只在 `data.mjs`。

## 1. 任務理解

- 根本問題：時鐘（定時叫一聲）與工人（長流程）共用 Trigger 一個 10 格名額池；名額漏光 → 全部時鐘停。
- 第二層：停擺只在頁面與 AO-RESUME 可見，沒有推播；告警系統自己壞了 = 安靜 = 看起來正常。
- 不變量：①時鐘不與工人共用資源；②我們設定的每個時鐘在 `/ops/schedules` 一列，太久沒成功就推播；③安靜必須可區分「正常」與「告警壞了」（每日一行）。

## 2. 現況分析

- Trigger 20 個 task（`packages/workflows/src/trigger/*.ts`）。排程 10 個：
  | task | cron UTC | 呼叫 | token |
  |---|---|---|---|
  | social-dispatch | `*/5 * * * *` | NA `/api/internal/social/dispatch` | `SOCIAL_DISPATCH_TOKEN` |
  | cs-inbound-sweep | `*/5 * * * *` | NA `/api/internal/cs/sweep` | `CS_SWEEP_TOKEN` |
  | pod-order-inbox-sweep | `*/10 * * * *` | NA `/api/internal/pod-orders/sweep` | `POD_INBOX_SWEEP_TOKEN` |
  | social-rotation | `5 0 * * *` | NA `/api/internal/social/rotation` | `SOCIAL_DISPATCH_TOKEN` |
  | social-metrics | `30 19 * * *` | NA `/api/internal/social/metrics` | `SOCIAL_DISPATCH_TOKEN` |
  | entitlements-expire | `0 1 * * *` | NA `/api/internal/entitlements/expire`（`lib/entitlements/postExpire.ts`） | `SCHEDULE_INGEST_TOKEN` |
  | site-watch-heartbeat | `5 * * * *` | NA `/site-watch/due` → 每 target `site-watch-run` child → `/site-watch/run/<id>` → `/site-watch/cleanup`（`site-watch.ts:46-80`） | `SITE_WATCH_INGEST_TOKEN` |
  | schedules-heartbeat | `0 * * * *` | NA `/api/internal/schedules/run-due` | 已被主機 cron `schedules_run_due` 取代（`cron.d/awarewave-schedules:6,12`）＝重複 |
  | dispatch-action-run-schedule | `*/10 * * * *` | Trigger `dispatch-action-run`（kick 失敗的撿漏，`dispatch-action-run.ts:262-271`） | Trigger 內 |
  | ao-infrastructure-check-schedule | `0 4 * * *` | Trigger `ao-infrastructure-check`（`ao-infrastructure-check.ts:82-89`） | Trigger 內 |
- 其餘 10 個 task 由 NA 按鈕／API 啟動（`kick-dispatcher.ts:26`、`api/tools/tarot/batch/route.ts:92`、`api/build/provision-services/route.ts:68`、`api/provision/route.ts:162`、`api/internal/collect/runs/route.ts:40`）——留在 Trigger。
- 先例：`schedules_run_due` 主機 cron → `cron-run.sh` 記結果 → `report-host-schedules.py`（每 10 分）→ `/host-status/host-schedules.json` → `/ops/schedules`（`lib/schedules/adapters/host-schedules.ts`）。NA 主機埠 `127.0.0.1:3002`（`schedules-run-due.sh`），Trigger 主機埠 `127.0.0.1:8030`。
- 推播：5 支主機腳本各自 curl Telegram／Slack（`endpoint-alert.sh`、`check-drift-and-alert.sh`、`auto-deploy-next-admin.sh`、`reconcile-videos.sh`、`scripts/routine-output-watchdog.sh`），變數名不一（`TELEGRAM_PRIMARY_CHAT_ID`／`TELEGRAM_ALLOWED_CHAT_IDS`／`TELEGRAM_CHAT_IDS`；`SLACK_WEBHOOK_URL`／`SLACK_INCIDENTS_WEBHOOK`）。備份完整性、部署版本只送 Slack（`host-jobs.ts:21,37`）。
- 頁面未涵蓋：pg_cron `archive-stale-repair-runs`（`0 2 * * *`；`job_run_details` 2026-10-24 failed、10-25 succeeded，無人知）；GHA `weekly-workflows-security-audit.yml:16`；n8n（5 個 workflow 全停用）；雲端 4 routine 與筆電產出的狀態報告（`SCHEDULES_PAGE_PLAN.md:50` 定為不放——前提「無資料路徑」已不成立：主機 `routine-output-watchdog.sh:39` 每日 `git fetch`）。
- 內部 API token 7 把（同 `.env`、同信任等級）。主機唯一（AGENTS.md §0），所有監控在同一台。

## 3. 風險清單

- R1 切換重複執行：cron 與 Trigger 同時跑（C2.1–C2.3 之間）→ 各端點冪等（site-watch 租約＋bucket `SITE_WATCH_MASTER_PLAN.md` C2/C3；social 0100 每槽一次；run-due claim）吸收。順序：裝 cron → 綠 → 再刪 Trigger 排程。
- R2 site-watch 每 target 最長 300s（`run/[targetId]` `maxDuration=300`）：主機腳本 `xargs -P 2`、`curl -m 330`，整輪必須在下一次 :05 前結束；超時記 exit 1。
- R3 主機 `.env` 缺 token → poke 腳本 exit 1（不安靜略過），頁面紅＋推播。
- R4 推播洗版：只在狀態變化發（state 檔），每日一行固定時間。
- R5 GitHub token 外洩面：fine-grained、單 repo、Actions read-only。
- R6 C7 動 auth（Medium）；C2、C3.4、C4.6、C6 動 prod 主機（High）。
- R7 push `packages/workflows` ＝ Trigger 部署：刪 Trigger 排程只能在 cron 綠之後（C2.3）。

## 4. 方案比較

- A 不搬，只顯示 Trigger 排程＋死名額偵測：單點還在。rollback revert。
- **B 時鐘全搬主機 cron，Trigger 只當工人**：沿用既有先例；自動上頁面。rollback：cron 檔 revert＋`install-host-schedules.sh`；Trigger 排程 revert＋部署。
- C 併入 `client_schedules` 引擎：`organization_id NOT NULL` 為主鍵（`0097_client_schedules.sql:24,38`），系統級工作要改 schema＋新 UI；目前無「頁面調頻率」需求 → 過度設計。

## 5. 建議方案

B ＋ 單一推播出口 ＋ 頁面補齊外部時鐘。C6–C8 為同一不變量的後續卡，各自獨立 commit／上線。決策：頻率維持原值（cron 每次成本 ≈ 0；social 每小時會晚到 50 分，`lib/social/dispatch.ts:88` 送窗 10 分）。

## 6. 實作計畫

每節一張卡。狀態只在監工台 `data.mjs`，本節不寫狀態。NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`，HS = `lobster-factory/infra/hetzner-phase1-core/scripts`，WF = `lobster-factory/packages/workflows`。

### C1 一支叫醒腳本，時鐘搬主機

| 卡號 | 做什麼 |
|---|---|
| C1.1 | `HS/poke.sh <key> <path> <TOKEN_VAR>`：讀 `/root/lobster-phase1/.env`、POST、非 2xx 或回 `"ok":false` → exit 1，只記失敗（樣式照 `schedules-run-due.sh`）；`schedules-run-due.sh` 刪除，其 cron 行改用 `poke.sh`（主機舊檔由 `sync-host-scripts.sh:15` 保留，C2 重裝前舊 cron 照跑） |
| C1.2 | `HS/site-watch-tick.sh`：`/due` → targets 以 `xargs -P 2` 逐一 `/run/<id>`（`curl -m 330`）→ `/cleanup`；任一步失敗 exit 1 |
| C1.3 | `HS/cron.d/awarewave-schedules` 加 9 行（§2 表前 7 個 NA 端點＋`dispatch_action_run`、`ao_infrastructure_check` 經 `HS/trigger-task.sh`：本機 `127.0.0.1:8030` 觸發、ttl 9m、等結果，非 COMPLETED 或 output `status:fail` → exit 1；`ao-infrastructure-check` 的 org 預設移進 task），頻率照原 cron |
| C1.4 | `NA/lib/schedules/host-jobs.ts` 登記 9 列（中文說明一次過 GPT）；`host-schedules.test.ts` 綠 |
| C1.5 | 測試：`bash -n`；本機對假 NA 跑 poke 成功／401／`ok:false` 三種 exit；site-watch-tick 0 target／2 target／一個失敗；NA `tsc`＋vitest |

### C2 C1 上線

push `packages/workflows` 即觸發 Trigger 部署（`.claude/hooks/post-push-trigger-deploy.ps1`），所以刪 Trigger 排程的程式碼在 cron 綠之後才寫、才 push。

| 卡號 | 做什麼 |
|---|---|
| C2.1 | 主機：`sync-host-scripts.sh` 取 C1 → `install-host-schedules.sh --check` 目視差異 → 安裝（High，操作者 2026-10-25 同意）；`.env` 確認 9 行所需 token 皆在 |
| C2.2 | 15 分後 `/ops/schedules` 9 列綠（NA 未部署前顯示為「未登記排程」＝預期） |
| C2.3 | WF 刪 10 個 `schedules.task`：刪檔 social-dispatch／cs-inbound-sweep／pod-order-inbox-sweep／social-rotation／social-metrics／entitlements-expire／schedules-heartbeat／site-watch（含 `lib/siteWatch/post.ts`、`site-watch-run`）；`dispatch-action-run.ts`、`ao-infrastructure-check.ts` 只刪 schedule export；`NA/.../trigger-contract.test.ts` 與 `lobster-trigger-deploy.ps1` 對應 token 同步段移除；WF vitest 綠 → push（＝Trigger 部署） |
| C2.4 | Trigger 排程列表為空；24h `list_runs` 無排程 run |
| C2.5 | 文件：`SITE_WATCH_MASTER_PLAN.md`（heartbeat 改主機）、`check-site-watch-health.ps1` 文字、TASK_REFERENCE、RUNNABLE_DEMOS、runbook；截圖給操作者 |

### C3 Trigger 名額檢查

| 卡號 | 做什麼 |
|---|---|
| C3.1 | `HS/check-trigger-slots.sh`：Redis env `currentConcurrency` 成員 vs trigger-postgres `TaskRun.status`；占格且非 EXECUTING 超過 15 分 → exit 1，輸出 run id 與 task |
| C3.2 | cron `*/10`，`host-jobs.ts` 一列；失敗訊息指向 `runbooks/TRIGGER-RUNS-STUCK-QUEUED.md` |
| C3.3 | 本機 redis＋postgres 容器假資料：0 格 ok、1 死格 fail、1 真執行中 ok |
| C3.4 | 上線：`install-host-schedules.sh`（High） |

### C4 一個推播出口：停擺告警與每日一行

| 卡號 | 做什麼 |
|---|---|
| C4.1 | `HS/notify.sh`：主機腳本唯一發送出口，讀 `.env` 的 NA 同名變數（`TELEGRAM_BOT_TOKEN`、`OPS_INBOX_TELEGRAM_CHAT_IDS`、`OPS_INBOX_TELEGRAM_NOTIFY_ENABLED`、`OPS_INBOX_SLACK_INCIDENTS_WEBHOOK`；不改名），token／webhook 不進 argv；任一已設通道失敗 → exit 1 |
| C4.2 | 判斷只一處＝NA `hostStatusRows`（頁面同源，不在 Python 重寫）：`NA/lib/schedules/alerts.ts`＋`/api/internal/schedules/alerts`（cron `*/10` poke）；failed／stale 變紅一則、恢復一則、持續不重送；狀態＝`ops_incidents`（`host-schedule:<key>`，open＝已通知），先送後記；不經 inbox dispatcher（它每 15 分重送，`notify/rules.ts:53-61`） |
| C4.3 | 同 route `?digest=1`，cron `0 1 * * *`（09:00 台北）：「N 個排程全部正常」或列出需注意；這行沒來＝告警壞了 |
| C4.4 | 舊發送改呼叫 `notify.sh`，刪各自 curl：repo 內 6 支（`endpoint-alert.sh`、`auto-deploy-next-admin.sh`、`check-drift-and-alert.sh`、`reconcile-videos.sh`、`verify-backup.sh`、`scripts/routine-output-watchdog.sh`）＋主機上未進 repo 的 2 支（`/root/scripts/verify-backup-eu.sh`、`verify-backup-ks-aw-01.sh`，先收進 repo）。備份完整性／部署版本失敗的兩邊通知已由 C4.2 涵蓋（任一排程 exit≠0 即通知） |
| C4.5 | `slack-alert-drill.sh` 改演練 `notify.sh`；本機假 webhook 驗變紅一則、恢復一則、重複不送 |
| C4.6 | 上線（High）：`install-host-schedules.sh` 裝 alerts／digest 兩行；`/etc/default/awarewave-endpoint-alert.telegram` 與 `.local` 中與 `.env` 相同的值退役（endpoint-alert 專屬 Slack 頻道 `WEBHOOK_URL` 移入 `.env`）；第一則每日一行截圖給操作者 |
| C4.7 | 兩列「先回答再做」會綠而實際失敗（critic 2026-10-25 L4）：`pod-orders/sweep` 在 `after()` 才 drain（`route.ts:20-24`）；`dispatch-action-run` 失敗列記 `dispatch_failed` 但回傳無 `status`（`dispatch-action-run.ts:208,256`）→ 改回報真實結果 |

### C5 排程頁補齊外部時鐘

| 卡號 | 做什麼 |
|---|---|
| C5.1 | 盤點加 pg_cron：`cron.job` ⨝ 最新 `cron.job_run_details` → 列（failed 即紅） |
| C5.2 | 盤點加 n8n：API 列啟用且含 Schedule Trigger 的 workflow＋最後執行 → 列；目前 0 列 |
| C5.3 | 盤點加 GitHub：Actions API 列含 `schedule:` 的 workflow＋最新 run conclusion → 列（需待決 1 token） |
| C5.4 | 「筆電與雲端」區：主機讀 `git fetch` 後 repo 內 4 routine 報告與 `reports/status/*-LATEST.*` 的產生時間；超過週期 → 黃，標「由筆電產生」 |
| C5.5 | `SCHEDULES_PAGE_PLAN.md:50` 舊決定改寫；頁面承諾一句：AwareWave 設定的每個時鐘一列 |

### C6 狀態報告改在主機產生

| 卡號 | 做什麼 |
|---|---|
| C6.1 | 清點 `scripts/ao-resume.ps1` 讀的 9 份報告各自產生者與資料來源（SSH 讀主機者＝可搬） |
| C6.2 | 可搬者改主機 cron 產生，寫 `/var/lib/awarewave/*.json`；筆電改讀 |
| C6.3 | 頁面「筆電與雲端」區只剩真正依賴筆電者 |

### C7 內部 API 一把鑰匙

| 卡號 | 做什麼 |
|---|---|
| C7.1 | `verifyInternalToken()` 一個函式、`INTERNAL_API_TOKEN` 一把；7 route 改用；舊名移除 |
| C7.2 | compose、`.env.example`、`poke.sh` cron 行、測試同步；`/codex-review` 獨立審（auth） |

### C8 主機外看守與第二台主機

| 卡號 | 做什麼 |
|---|---|
| C8.1 | 主機外探針：每 5 分打 `app.aware-wave.com`，失敗推 Telegram（Cloudflare Health Checks 或外部服務，待決 2） |
| C8.2 | 第二台主機決策記錄 `reports/decisions/`：成本、RPO／RTO、搬遷步驟（待決 3） |

## 7. 驗證計畫（四動作）

- 實測：C1.5、C3.3、C4.5 本機；C2、C3.4、C4.6 prod 實跑；`/ops/schedules` 截圖。
- Review：每卡 `/codex-review`；C7 加 critic Deep。
- 抓蟲：grep 10 個排程 task id、7 個 token 名、5 種推播變數名，scope `agency-os,scripts,lobster-factory,.claude,runbooks`。
- WORKLOG：每卡一條，四行機械證據。
