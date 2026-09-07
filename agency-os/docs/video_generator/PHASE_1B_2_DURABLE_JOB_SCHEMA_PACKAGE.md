# Phase 1B-2 — durable video job schema package

**狀態：設計包；尚未建立 SQL migration、未寫入資料庫、未部署。**
**日期：2026-09-06**
**前置：** Phase 1B-1 lifecycle contract、受控 staging 連線、備份與還原證明。
**不變量：** 新欄位與事件只補足既有 video_jobs 的 durable execution evidence；它們不建立第二個影片工作真相，也不改寫既有 Quick Engine 路徑。

## 1. 已核實的資料基線

| 事實 | 證據 | 設計結果 |
|---|---|---|
| video_jobs 只有 running、done、error 三種狀態，並以 created_at 供約一小時 TTL 清理。 | D:\Worktrees\media-video-phase0\lobster-factory\packages\db\migrations\0047_video_jobs.sql:17-33 | 不覆寫 status 語意；另加 nullable 的 versioned lifecycle 欄位，舊列維持可讀。 |
| video_jobs 已啟用 RLS，anon／authenticated 都被顯式拒絕。 | 0047_video_jobs.sql:38-45 | 不新增瀏覽器 policy；所有新寫入仍只能走受控 server/service-role repository。 |
| organization_id 是 nullable FK，前次 migration 採 3 秒 lock timeout 並 reload PostgREST schema cache。 | 0060_video_jobs_add_org.sql:38-64 | 新 migration 必須沿用 lock-timeout、owner 與 cache reload rehearsal；不得假定以 postgres 執行可行。 |
| 已提交的 lifecycle module 是純函式，legacy mapping 單向且不會把新狀態降回舊三態。 | D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\job-lifecycle.ts:1-111 | DB check constraint、repository 與 executor 必須採同一份狀態表；不可另寫字串集合。 |
| 已有通用 idempotency_keys 表沒有組織 FK，且可過期清理。 | D:\Worktrees\media-video-phase0\lobster-factory\packages\db\migrations\0022_build_console_execution_tables.sql:164-172,220-222 | 不把它當影片 job 的唯一提交證據；影片的 immutable fingerprint 與 idempotency key 需與 video_jobs 同列、同 tenant。 |

## 2. 目標資料模型

### 2.1 擴充既有 public.video_jobs

以下欄位在第一個 additive migration 均必須 nullable 或有相容 default；migration 本身不能把歷史 running/done/error 列改寫為新 lifecycle。DB check 必須保證：lifecycle_version 為 null 的列保留 legacy shape；lifecycle_version = 1 的列同時具備非空 organization_id、合法 lifecycle_state、64 位 fingerprint 與非空 idempotency_key。

| 欄位 | 型別／constraint | 用途 |
|---|---|---|
| lifecycle_version | smallint，nullable，check = 1 | 明確辨識新狀態契約；null 代表 legacy row。 |
| lifecycle_state | text，nullable，check 為 v1 的 11 個值 | durable executor 的目前狀態；禁止使用舊 status 值冒充。 |
| request_fingerprint | text，nullable，64 個小寫 hex 的 check | 指向不可變的已驗證 render input；任何腳本、素材、比例或 provider 選擇變更都必須產生新 job。 |
| idempotency_key | text，nullable | 同一 immutable request 的重新提交 identity；新 durable row 與非空 organization_id 時必填。 |
| execution_run_id | text，nullable | Trigger 或其他 durable executor 的執行證據；不是商業 job 的 primary key。 |
| lease_owner、lease_expires_at | text、timestamptz，nullable | 原子 claim 與 crash recovery lease；未到期 lease 不可被第二個 worker 搶走。 |
| renderer_attempt_id、renderer_accepted_at | text、timestamptz，nullable | 記錄外部 renderer 已接受的事實，供 uncertain submission 查證。 |
| attempt_count | integer not null default 0，check >= 0 | renderer submission 嘗試計數；只能在合法 transition transaction 中遞增。 |
| failure_code、failure_detail | text、jsonb，nullable | 可分類、可稽核的失敗證據；禁止存 provider secret、完整私密 URL 或未清洗 stack trace。 |
| updated_at、reconciled_at | timestamptz，nullable | 順序、lease 偵測與 recovery 稽核時間；不能取代 event log。 |

### 2.2 Append-only transition evidence

建立 public.video_job_events。video_jobs 必須先加 UNIQUE (id, organization_id)，事件表以 (video_job_id, organization_id) → video_jobs (id, organization_id) 的 composite foreign key ON DELETE RESTRICT 維持同 tenant 關係。這不是第二個 job table；它只保存狀態轉換與外部觀測的不可變證據。

必備欄位為 id、video_job_id、organization_id、event_type、from_state、to_state、attempt_number、execution_run_id、renderer_attempt_id、evidence_json、created_at。它必須：

1. organization_id 為 NOT NULL，且 composite foreign key 強制與母 job 一致；repository transaction 再做授權與輸入驗證，不能取代資料庫關係約束。
2. 只允許 append，禁止 application UPDATE／DELETE；service-role 是唯一 writer。
3. 以 (video_job_id, created_at, id) 讀取單一 job 的完整順序，以 (organization_id, created_at) 支援 tenant 稽核。
4. 不能保存原始 prompt、私密素材 URL、認證 header 或 provider token。

## 3. 必須由資料庫保護的規則

1. lifecycle_state 為 null 的 legacy row 只能以 legacyVideoJobStatusToLifecycle() 作讀相容，任何 durable executor 不得 claim。
2. 新 durable row 必須同時有 lifecycle_version = 1、非空 organization_id、request_fingerprint 與 idempotency_key；條件 CHECK 先拒絕不完整列，repository 再於 renderer 呼叫前重複拒絕。
3. 建立 partial unique index：(organization_id, idempotency_key)，條件為兩者皆非 null。它阻止同 tenant 同 key 建立兩份 durable intent；不同 tenant 仍隔離。
4. 建立 recovery index，最終 shape 由 staging EXPLAIN 驗證：非終態的 lifecycle_state 加 lease_expires_at，讓 expired lease 查詢不掃全表。
5. state transition 由 compare-and-swap update 完成：條件包含 job ID、預期 lifecycle_state、lease owner 與 lease expiry。更新 0 列必須回傳 conflict，不能退化成 blind update。
6. 同一 transaction 先更新狀態再 append event；event insert 失敗時 transaction 全部 rollback。renderer acceptance 記錄失敗必須把 job 移入 unknown 或使 executor 失敗，絕不能只 console.warn。
7. 無法證明 renderer 有沒有接受請求時，只能轉 unknown → reconciling；不得因 timeout 自動產生新 attempt。

## 4. Migration packaging

Migration 編號由執行當日 main branch 的最新 packages/db/migrations 目錄決定，不能現在預填為 0065。同一 change package 預期包含：

| 產物 | 責任 |
|---|---|
| 一份 additive SQL migration | 加欄位、events table、constraints、indexes、RLS、comments、PostgREST schema reload。 |
| repository port 與 transaction tests | 實作 insert intent、atomic claim、transition/event append、lease recovery；不改既有 route。 |
| database rehearsal SQL | 在 staging 的 BEGIN/ROLLBACK 做 owner、lock、RLS、constraint、query-plan 與 rollback 行為驗證。 |
| operator runbook | backup reference、schema fingerprint、故障分類、feature flag rollback 與 evidence retention。 |
| migration receipt | 實際 staging command、輸出摘要、table/index/policy proof、restore proof 和可追溯 commit。 |

SQL migration 的基本順序必須是：

1. set lock_timeout = 3s，先做 metadata-only nullable column additions。
2. 新建 event table，enable RLS，建立 explicit deny policy；不得因此開放 browser access。
3. 加 check constraints 與 partial unique index；是否使用 concurrent index 由 migration runner transaction model 與 staging table size 決定，未驗證前不可猜。
4. notify pgrst, reload schema，讀回 schema cache 結果。
5. 只有 repository、contract tests、staging rehearsal 全數通過後，才以 feature flag 讓新 job 建立 durable lifecycle 欄位。

## 5. staging rehearsal acceptance

受控 staging 必須產生下列可保存證據：

- migration runner identity 為實際 table owner 或被授權角色；不印出憑證。
- lock timeout 在被刻意持有的相容 lock 下快速失敗，且既有 status polling 保持可用。
- BEGIN/ROLLBACK rehearsal 不保留 schema 或資料，正式 staging apply 只在備份 reference 與 restore drill 可用後進行。
- anon/authenticated 對兩張表皆拒絕；service-role path 僅能由 server repository 存取。
- 同 tenant 同 idempotency key 的第二個 durable intent 被 unique index 拒絕；跨 tenant 同字串不互相洩漏。
- 兩個 worker 競爭 claim 僅一個成功；expired lease 可由 recovery worker 接手。
- illegal transition、terminal reopen、缺 fingerprint、缺 tenant、跨 tenant event FK 與 event append 失敗都被拒絕。
- EXPLAIN (ANALYZE, BUFFERS) 證明 recovery query 使用設計索引；資料量與 query shape 必須記在 receipt。
- feature flag 關閉後，legacy Quick Engine route、video_jobs.status、history 與 R2 reconciliation 仍維持原有行為。

## 6. rollback and retention

這是 additive schema，因此正常 rollback 是關閉 durable-job feature flag、停止新的 executor dispatch、保留所有新欄位與 event evidence 可讀。不得在同一事故中執行 destructive down migration、刪 columns、刪 events 或回填舊 status 來偽造成功。

只有 staging 中尚未有任何受審核 dependency 的 migration rehearsal，才可以使用專屬 cleanup SQL；該 SQL 必須獨立 review、明確列出 target table/column、先做 backup/row-count proof，並在 receipt 記錄。Production schema 的移除是新的 High-risk change，與功能 rollback 分開審批。

## 7. 接續順序

1. 完成受控 staging access、renderer deployment inventory、Trigger worker availability 與 backup/restore proof。
2. 以本包建立 migration 與 repository tests，但先不匯入 render-draft。
3. 驗證 renderer idempotent acceptance protocol。
4. 實作 durable executor 的 claim、lease、unknown/reconcile。
5. 以 feature flag 讓一個 disposable staging tenant 選擇新路徑，完成 restart / timeout / reconcile 測試。
6. 通過獨立 review 與 release packet 後，才提出 production migration and deployment approval。
