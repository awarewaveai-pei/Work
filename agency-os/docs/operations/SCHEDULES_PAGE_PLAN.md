# app.aware-wave.com 排程頁 — 規劃卡

> 讀者：執行這張卡的 agent。路徑縮寫：`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`WF` = `lobster-factory/packages/workflows`、`DB` = `lobster-factory/packages/db`。所有 `file:line` 以 2026-10-14 `f8ffaf4b1` 為準。

## 0. 現況（每次改動更新此段）

| 項 | 狀態（2026-10-14） |
|---|---|
| 卡 | 操作者 2026-10-14 看過 §3.4，步 2、5 給 go |
| Slice 1 | 步 1–3、5、7 完成（`4ff292b38`、`d6e537717`、0097 已套、`schedules-heartbeat` 18:00 UTC 首跑綠、過渡 route 與舊 token 已刪）。**剩**：步 4 寫入 smoke 與步 6 真實一跑需操作者登入（改一格 → `ops_audit_events`；勾一格到下一個整點 → `collection_runs`） |
| 前置 | 筆電 tenant 自動化已退役（`f8ffaf4b1`，WORKLOG 2026-10-14 續22） |
| 時鐘（2026-10-24） | 頻率多一種 `every_5m`（0121；`lib/schedules/schedule.ts` isDueNow 4.5 分鐘下限）供 `content_pipeline` 格用。主機 cron `*/5` `schedules_run_due`（`cron.d/awarewave-schedules`，`HOST/poke.sh`；2026-10-25 起取代 `schedules-run-due.sh`，失敗寫 `/var/log/poke.log`）呼叫同一支 run-due，2026-10-24 12:11Z 裝好；每輪結果在 `/var/lib/awarewave/jobs/schedules_run_due.json`。跑順一天後停用 Trigger `schedules-heartbeat`（等操作者，`AUTO_CONTENT_EXECUTION_PLAN.md` P4.4） |

## 1. 目標

一頁看完所有客戶的例行工作並能改；客戶頁同一份資料；工作只能從程式寫好的菜單選。不再有第二套排程機制。

## 2. 操作者已拍板（勿重問）

- 放 app.aware-wave.com，不是 api.aware-wave.com（2026-10-14）。
- 總表＋客戶頁兩邊都能改，資料只存一份（2026-10-14）。
- UI：核取方格／按鈕 chips，禁 `<select>`，預設多選；一頁一張圖、細節放旁邊（memory `feedback_no_dropdowns_multiselect`、`user_working_memory_one_thing_at_a_time`）。
- 不讓人輸入指令（退役的 tenant runner 用 `Invoke-Expression` 跑清單裡的字串，那是這次要關掉的整類）。
- 自動化預設 OFF（AGENTS.md §0）。

## 3. 決策（含「這是最好的做法嗎」的答案）

### 3.1 現有兩套「每客戶排程」已經是同一個形狀，差在資料表名

| | 自動爬取 | 網站巡檢 |
|---|---|---|
| 表 | `collection_schedules`（`DB/migrations/0081_collection_schedules.sql`）：org PK、enabled、frequency daily/weekly、hour_utc、day_of_week_utc、last_run_at、last_run_key | `site_watch_targets`（`0091_site_watch.sql`）：org UNIQUE、enabled、frequency hourly/every_6h/daily/update_only、hour_utc、lease_*、last_completed_* |
| 到時判斷 | `NA/lib/collect/schedule.ts:35-48` `isDueNow`（純函式） | `NA/lib/site-watch/runner.ts` `isDue`（桶＋租約） |
| 心跳 | Trigger `collect-scheduled-crawl` cron `0 * * * *` → `POST /api/internal/collect/run-due-schedules`（`WF/src/lib/collection/postRunDueSchedules.ts:20`） | Trigger `site-watch-heartbeat` → `POST /api/internal/site-watch/due` |
| 每客戶設定 API | `NA/app/api/ops/clients/[slug]/collection-schedule/route.ts`（GET :39、PATCH :53；`canWriteTenantConfig` `lib/ops-role.ts:64`；audit `ops_audit_events` :27-37） | `/api/ops/clients/[slug]/site-watch`（`lib/site-watch/console.ts`；同 audit :25-44） |
| 設定 UI | `NA/app/(shell)/ops/collect/CollectionSourcesPanel.tsx:733-828` `ScheduleControls`（:497 使用；客戶頁「資料蒐集」分頁 `ClientHubTabs.tsx:1973` 共用同一面板） | `NA/app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx`（:204 開關、:211 頻率 chips、:216-232 小時；在「維護」分頁 `ClientHubTabs.tsx:701`） |
| 新客戶預設 | 無列＝關（route.ts:49） | `store.ts:124-129` 每個 active 且有 site_url 的 org 自動建列、預設開 |

0081 檔頭已經寫明為什麼用表不用 Trigger.dev 自己的動態排程（第二份真相、無法察覺不一致）。同一個理由反對再開第三種機制。

### 3.2 決定

1. **把 `collection_schedules` 一般化成 `client_schedules`，主鍵 (organization_id, job_key)**。`isDueNow` 不動（它本來就不知道自己在排什麼）；`schedule-store` 多一個 `jobKey`；心跳 route 改成「對每個 due 的 (org, job) 呼叫 registry 裡該 job 的 `run`」。新工作 = registry 加一筆 + 一個 `run(orgId, runKey)` 函式；不加表、不加 route、不加 Trigger task。
2. **網站巡檢不併表**。它不是「到點跑一次」的工作，是帶租約、桶、每頁狀態、告警狀態機的監控（0091 四張表）。併進去只會把 `isDueNow` 弄髒。頁面上用一個 adapter 讀 `site_watch_targets`、寫走它現有的 PATCH route，顯示在同一張表裡。
3. **兩個畫面、一個元件、一份資料**：總表 `/ops/schedules` 和客戶頁「維護」分頁頂端同一個 `ScheduleTable`，差別只有 org 過濾。回答操作者的問題：是，兩邊都放是對的，因為兩種問法（「今天誰失敗」、「這家有誰在跑」）都真實存在；資料只在 `client_schedules`／`site_watch_targets` 各一份，所以不會對不上。
4. **一列 = 一種工作，格子 = 一個客戶**。格子的核取方格 = 該 (job, org) 的 enabled；點格子，右側欄顯示那一格的細節：頻率 chips（每天／每週＋星期）、UTC 小時（旁邊換算台北）、上次執行時間、上次結果、audit 最近一筆。總表上方一行摘要：幾個排程、今天跑了幾個、幾個失敗。
   - **2026-10-24 版面改版（操作者：痛恨「請先點選一個排程」、不要一直往下滑；「之後有很多網站怎麼辦」）**：右側欄刪除。分頁＝工作（固定幾個）＋伺服器三群（備份／部署與監控／網站與服務維護），**不按客戶分頁**（客戶會無限增加）。工作分頁＝一列一個客戶：開關、頻率、星期 chips、台北時間（點時間開 24 格小時表，兩下選到任何時間）、上次結果全在列上；搜尋、篩選（全部／失敗／已啟用／未啟用）、失敗排最上；勾選多個客戶批次開關／改頻率／改時間。伺服器分頁＝一列一筆，細節第二行直接顯示，可搜尋、只看異常。客戶頁 `only`＝那家所有工作一張表、一列一個工作。§3.4 草圖為舊版。
5. **新客戶的預設來自 registry，不靠開站流程**：registry 每筆宣告 `defaultEnabled`（client_schedules 一律 false；site-watch 沿用它自己的 true＋自動建列）。GET 在無列時回 registry 預設（同 route.ts:49 現行做法），sweep 只讀 enabled 列。沒有列就沒有東西要維護；一鍵架站不必多做任何事。這比「開站時插入預設列」乾淨，也不會在 registry 改預設時留下一堆舊列。
6. **失敗走現有的事件路**：sweep 裡一個 job 丟錯 → `upsertIncidentAtomic`（`NA/lib/ops-inbox/upsertIncidentAtomic.ts:22`，fingerprint `schedule:<job_key>:<org>`）→ Ops Inbox → Slack/Telegram（`lib/ops-inbox/notify/dispatcher.ts`）。不寫新的通知器。成功時零聲音。
7. **系統排程只顯示「主機看得到的」**：目前 app 能讀到的只有備份覆蓋（`NA/lib/backup/coverage.ts` 讀 `/host-status/backup-coverage.json`，compose :254 `/var/lib/awarewave:/host-status:ro`；主機上該目錄 2026-10-14 只有這一個檔）和網站巡檢心跳（`site_watch_maintenance.last_heartbeat_at`，`store.ts:118`）。筆電的每晚檢查、雲端 Claude routine、GitHub Actions **不放進 app**：沒有誠實的資料路徑（要新建推送管線＝範圍外），它們已在 AO-RESUME 開工報告裡。之前草圖裡把它們畫進總表是錯的，以此卡為準。
   - **2026-10-24 擴充（操作者「都要」）**：主機上所有排程都上這頁。主機 `scripts/report-host-schedules.py`（每 10 分）讀實際的 crontab／`/etc/cron.d`／`cron.{daily,…}`／`/etc/systemd/system` timer（dpkg 套件自帶的略過），加上 `cron-run.sh` 寫的每輪結果，寫 `/var/lib/awarewave/host-schedules.json`；頁面 `NA/lib/schedules/adapters/host-schedules.ts` 讀它。我們的排程 SSOT = `hetzner-phase1-core/scripts/cron.d/*`（`install-host-schedules.sh` 安裝；root crontab 退役併入 `awarewave-schedules`）；文案 `NA/lib/schedules/host-jobs.ts`。主機上沒登記的排程顯示「未登記」，登記了主機沒有的顯示「尚無資料」，cron 檔與 repo 不一致顯示「排程版本不一致」——三個方向都不會再有看不到的排程。
   - **2026-10-25 改寫「不放筆電與雲端」（handoffs/2026-10-25-schedules-off-trigger C5）**：前提「沒有資料路徑」已不成立——主機 `/root/Work` 每天 `git fetch`。頁面承諾：**AwareWave 設定的每個時鐘在這頁一列**。`report-host-schedules.py` 另讀 pg_cron（`cron.job`＋最新 `job_run_details`）、n8n（啟用且有時間觸發的流程＋最新 execution）、repo 內雲端 routine 報告與筆電狀態報告的最後 commit 時間；分頁「資料庫與 n8n」「筆電與雲端」。筆電與雲端列過時只標黃、不推播（筆電關機≠故障；雲端 routine 已有 `routine_watchdog` 的 Telegram）。GitHub Actions 待 token（監工台待決 1）。
8. **不做**：monthly 頻率（現在沒有任何每月工作；有了再加 `day_of_month` 和測試）、「立即執行」按鈕（爬取已有自己的「正式抓取」）、新工作（Slice 1 只搬現有兩個；第一個真的新工作出現時走 §9）。

### 3.3 為什麼不是其他做法

- **只放客戶頁**：「今天誰失敗」要一家家點。**只放總表**：處理某家時要跳出去。
- **用 `ops_action_runs` 當排程**（0011＋`WF/src/trigger/dispatch-action-run.ts` cron */10）：那是一次性動作的佇列（action_key → Trigger task），沒有「下次幾點」的概念；拿來當排程要再長出 cadence 欄＝第三套。保留它做一次性動作。
- **每個 job 各一張表**（照 0081／0091 現狀再複製）：新工作要 migration＋route＋task 三件，正是這次要關掉的重工。

### 3.4 草圖

總表：

```
排程                                            7 個排程 · 今天跑了 4 · 1 失敗
──────────────────────────────────────────────────────────────────────────
客戶例行工作（在這裡設定）
 工作          Soulful   Mongolia   P1試點   │ 右側欄（點了格子才有內容）
 自動爬取      [x] ●     [ ]        [ ]      │ 自動爬取 · Soulful
 網站巡檢      [x] ●     [x] ●      [ ]      │ 每天 / 每週 一二三四五六日
                                            │ UTC 03 時（台北 11 時）
在主機跑（只顯示）                             │ 上次 10/14 03:00 · 正常 · 寫入 12 筆
 備份覆蓋      每天 03:30   10/14 正常         │ 最近改動 owner:claims 10/01
 巡檢心跳      每小時       10/14 19:05 活著   │
```

● = 上次失敗時改紅。客戶頁「維護」分頁頂端 = 同一張表只留這家那一欄（右側欄相同）。

## 4. 架構（Slice 1 實作即 SSOT；改程式時同步本段）

### 4.1 資料

`DB/migrations/0097_client_schedules.sql`（建表＋搬資料＋刪舊表＋`ops_incidents.source` 加 `'schedule'`；down：`DB/scripts/0097_client_schedules_down.sql` 還原 0081 表與列）：

```
client_schedules(
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  job_key         text CHECK (job_key ~ '^[a-z][a-z0-9_]{2,40}$'),
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly')),
  hour_utc int NOT NULL DEFAULT 3 CHECK (0..23), day_of_week_utc int NOT NULL DEFAULT 1 CHECK (0..6),
  last_run_at timestamptz, last_run_key text, last_error text, last_error_at timestamptz,
  updated_by text, created_at, updated_at,
  PRIMARY KEY (organization_id, job_key))
INSERT ... SELECT organization_id, 'collect_crawl', ... FROM collection_schedules;  DROP TABLE collection_schedules;
RLS service_role only、REVOKE anon/authenticated、NOTIFY pgrst（照 0081 :40-47）
```

`last_error`：sweep 失敗時存前 200 字（現在 route 只回在 JSON 裡，頁面看不到）；成功時清空。job_key 不做 FK 到任何表：registry 在程式裡（§4.2），表只存設定。

### 4.2 程式（`NA`）

| 檔 | 內容 | 來源 |
|---|---|---|
| `lib/schedules/schedule.ts` | `isDueNow`（不變）、`scheduledRunKey(org, jobKey, now)` → `scheduled-<job>-<org8>-<date>` | `git mv lib/collect/schedule.ts` |
| `lib/schedules/store.ts` | `listSchedules(org?)`、`listEnabledSchedules()`、`upsertSchedule`、`claimScheduleRun`（一個 run key 只有一個贏家）、`recordScheduleRun`（清 error）、`recordScheduleError`（不動 last_run_at）；讀與記錄失敗一律 throw（「沒列」不能代替「讀不到」） | `git mv lib/collect/schedule-store.ts` |
| `lib/schedules/types.ts` | `JobMeta`／`ScheduleCell`／`SystemRow`／`SchedulesView`（client 元件也 import，無 server 依賴） | 新 |
| `lib/schedules/jobs.ts` | registry `CLIENT_JOBS`：`{ key, label, frequencies, defaults, run(orgId, runKey) }`；Slice 1 只有 `collect_crawl`（`runCollection`） | 新 |
| `lib/schedules/adapters/site-watch.ts` | `siteWatchCells`（`site_watch_targets`＋`site_watch_page_state` → cell；無列＝`SITE_WATCH_DEFAULTS`）、`writeSiteWatchCell`（`console.ts` `parseConfigInput`＋`updateConfig`＋`auditSiteWatch`） | 新 |
| `lib/schedules/adapters/host-status.ts` | 備份覆蓋（`readBackupCoverage`）、巡檢心跳（`site_watch_maintenance`）→ 唯讀 row | 新 |
| `lib/schedules/view.ts` | `loadSchedulesView(sb, {slug?})`：org × job cells＋系統列＋摘要 | 新 |
| `lib/ops-inbox/ingest.ts` | `ingestIncident`：snapshot → transition → `upsertIncidentAtomic` → `dispatchNotifications` | 新 |
| `app/api/internal/schedules/run-due/route.ts` | sweep：due → claim（回應前）→ `after()` 裡 `run` → `recordScheduleRun`；丟錯 → `recordScheduleError`＋`ingestIncident`（fingerprint `schedule:<job>:<org>`）；讀不到 store = 500；token `SCHEDULE_INGEST_TOKEN`。為何 after：爬取預算 10 分（`lib/collect/run.ts` DEFAULT_BUDGET），Trigger task 300 s 就重試（`WF/trigger.config.ts` maxDuration/retries） | `git mv` 自 `collect/run-due-schedules` |
| `app/api/internal/collect/run-due-schedules/route.ts` | **過渡** re-export POST；步 7 刪 | 新 |
| `app/api/ops/schedules/route.ts` | GET `?slug=` 選填 → `SchedulesView` | 新 |
| `app/api/ops/clients/[slug]/schedules/[job]/route.ts` | PATCH 一格（不做 GET，表格只讀上一列）；registry 外的 job → 404；`site_watch` → adapter（409 照舊） | `git mv` 自 `collection-schedule/route.ts` |
| `app/api/ops/clients/[slug]/site-watch/route.ts` | 只剩 GET（卡片狀態）；PATCH 刪 | 改 |
| `app/(shell)/ops/schedules/page.tsx`＋`ScheduleTable.tsx` | 總表＋右側欄；客戶頁 `only={slug}` | 新 |
| `SidebarNav.tsx`（Clients & Ops）、`ClientHubTabs.tsx` MaintenanceTab 頂端 | 連結「排程」、`<ScheduleTable only>` | 改 |
| `CollectionSourcesPanel.tsx` | 刪 `ScheduleControls`＋其型別；留一行指向排程頁 | 刪 |
| `SiteWatchCard.tsx` | 刪開關／頻率／小時／儲存；留狀態、證據圖、接受基準 | 刪一段 |
| `ops-inbox/types.ts`、`repair-center/policy.ts`、`IncidentCard.tsx`、`inbox/incidents/route.ts` | incident source `schedule`；incidents route 的允許清單改由 policy 表導出 | 改 |
| `WF/src/trigger/collect-scheduled-crawl.ts` → `schedules-heartbeat.ts` | id `schedules-heartbeat`，cron 不變；URL `/api/internal/schedules/run-due`；token 名 | 改名（步 5，單獨 commit） |

測試：`lib/schedules/__tests__/schedule.test.ts`（runKey 含 job）、`app/api/internal/schedules/run-due/route.test.ts`（一個 job 丟錯 → incident 一筆、其他照跑；registry 外的列算失敗）、`lib/schedules/__tests__/site-watch-adapter.test.ts`（cell 映射、400／409／audit）。搬過去照改：`store.test.ts`、`schedules/[job]/route.test.ts`。`SiteWatchCard.render.test.tsx` 刪 3 支設定段測試。

### 4.3 權限與安全

- 讀：viewer+。寫：`canWriteTenantConfig`（`lib/ops-role.ts:64`）。每次寫 `ops_audit_events`（照 route.ts:27-37）。
- internal route：專屬 bearer，fail-closed（照現行 :30-35）。
- 頁面不接受任何命令字串；job_key 只能是 registry 裡有的（PATCH 時驗）。

## 5. Slice 1 步驟（順序 = 先不改行為地換引擎 → 再換 UI → 最後切 Trigger）

Low/Medium 直接做；標 **High** 的逐項等操作者 go-ahead。每步完成更新 §0。主機 cron `auto-deploy-next-admin.sh` 每天 19:00 UTC（台灣 03:00）從 main 自動部署 next-admin（2026-10-15 起；之前每 4 小時），所以**每個 commit 都要能獨立上線**。

1. 0097 migration + down；`lib/schedules/*`（搬＋jobKey）；generic sweep route；舊 collect route 變 re-export；`collection-schedule` route 改讀新 store（路徑先不動）。測試三支綠、`npx tsc --noEmit` 綠、`npm test` 綠。**行為不變**：Trigger 仍打舊 URL，舊 URL 轉到新 sweep。
2. **High**：`node scripts/apply-db-migration.mjs --check 0097` → 操作者 go → apply。驗：`client_schedules` 列數 = 原 `collection_schedules` 列數；`collection_schedules` 不存在。
3. `ScheduleTable` + `/ops/schedules` + sidebar + 客戶頁維護分頁；刪 `ScheduleControls`、SiteWatchCard 的設定段；`collection-schedule` route 改名 `schedules/[job]`。
4. 部署隨 auto-deploy 上線後 smoke：`/ops/schedules` 200、改一格 → `ops_audit_events` 多一筆、`client_schedules` 該列 updated_by 正確；客戶頁同一格同步。
5. **High**：Trigger task 改名＋URL（`scripts/lobster-trigger-deploy.ps1`）；env `SCHEDULE_INGEST_TOKEN` 先用 `safe-infra-patch.sh compose` 加到 next-admin（舊 token 保留到步 7）。驗：Trigger 下一個整點 run 綠；`docker exec lobster-next-admin printenv SCHEDULE_INGEST_TOKEN` exit 0。
6. 等一個整點：`client_schedules.last_run_at` 更新、`collection_runs` 多一列 run_key `scheduled-collect_crawl-…`。
7. 刪過渡 route、舊 token（compose 走 safe-infra-patch）、`WF` 舊檔。健康檢查／`/check-drift` 綠。
8. 更新本卡 §0、`SITE_WATCH_MASTER_PLAN.md` §3.2（設定入口改到排程表）、`CollectionSourcesPanel.tsx:666-732` 的註解、WORKLOG。

## 6. 驗收（缺一不算）

| # | 證據 |
|---|---|
| 1 | `npm test`（NA）綠；三支新測試在列 |
| 2 | 步 4 smoke：改總表一格 → 客戶頁同格相同；反向亦然（同一份資料） |
| 3 | 步 6：真實心跳跑出一筆 `collection_runs`，`last_run_at` 更新 |
| 4 | 故意讓一個 job 丟錯（測試或 dry）→ `ops_incidents` 一筆、Telegram 一則；其他 org 的 job 照跑 |
| 5 | 主機上只剩 `schedules-heartbeat`、`site-watch-heartbeat` 兩個 app 心跳 task（Trigger dashboard） |
| 6 | grep `collection_schedules|collection-schedule|run-due-schedules|ScheduleControls` 在 NA／WF／DB／agency-os docs = 0 程式命中 |
| 7 | WORKLOG 四行證據（REALTEST／REVIEW／BUGHUNT／本段） |

## 7. 邊界（不在本卡）

- 筆電每晚檢查、雲端 routine、GHA 的狀態進 app：需要主機側接收端，另開卡。
- `update_only` 巡檢頻率、多頁巡檢：`SITE_WATCH_MASTER_PLAN.md` §8。
- 每月頻率、立即執行、新工作：§9。

## 8. 回滾

- 步 1–4（app）：`git revert`；auto-deploy 下一輪帶回舊版。DB 已套 0097 時先跑 down（還原 0081 表與列），再 revert。
- 步 5：Trigger 重新部署上一版（`lobster-trigger-deploy.ps1` 指舊 commit）；過渡 route 還在，舊 URL 仍通。

## 9. 之後（動工時展開成 §5 同格式）

- 第一個新工作候選：WP 外掛更新檢查（`NA/app/api/ops/clients/[slug]/wp-update/` 既有邏輯包成 `run`）、客戶月報（先定內容與收件人，否則不做）。每個新工作 = registry 一筆 + `run` + 一支測試。
- monthly：`frequency` CHECK 加 'monthly'、`day_of_month` 1–28、`isDueNow` 加一個分支＋測試。
  - **2026-10-24 已做**（`DB/migrations/0123_client_schedules_day_of_month.sql`）：另加 quarterly（1/4/7/10 月）、yearly（1 月）；`day_of_month` 是**台北**日（UTC 表達不了台北的「幾號」）；錯過的那天同一小時再補 2 天，每期只跑一次（`NA/lib/schedules/schedule.ts` `periodicDue`）。用者：社群週報／月報／季報／年報（`NA/lib/social/report-period.ts` `REPORT_JOBS`）。
