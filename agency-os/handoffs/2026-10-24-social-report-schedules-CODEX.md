續做 社群週報／月報／季報／年報排程：讀本檔，從步驟 1 開始；完成 = 0123 已套正式庫 + commit 已推 main（今晚台灣 03:00 自動部署前）。建議模型：Codex。

# Decision（操作者 2026-10-24 已核准，含資料庫變更 go ahead）
Claude 已寫完、未 commit。Codex 只做：最後審查 → 測試 → 套 migration → WORKLOG → commit → push。不要重寫功能。

# Constraints
- 順序不可反：**先套 0123，再 push**。程式先上、庫沒套 → 03:00 migration 閘擋下整個部署（含別人的功能）。
- 共用工作目錄，多個 session 同時在改：commit 只帶下列檔案；WORKLOG 只能經 `scripts/git-partial-worktree-commit.py stage` 私有 index（AGENTS.md §8）。
- 不做無效益測試；只跑下面列的。

# Files（全部是這次的改動）
NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`
- `lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.sql`（新）
- `lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.down.sql`（新）
- NA `lib/schedules/schedule.ts`、`store.ts`、`types.ts`、`jobs.ts`、`view.ts`、`adapters/site-watch.ts`
- NA `lib/social/reports.ts`、`report-period.ts`、`metrics.ts`
- NA `app/api/internal/schedules/run-due/route.ts`、`route.test.ts`
- NA `app/api/ops/clients/[slug]/schedules/[job]/route.ts`
- NA `app/api/social/reports/monthly/route.ts`
- NA `app/(shell)/tools/social/api.ts`、`app/(shell)/tools/social/(sections)/reporting/Reporting.tsx`
- NA `app/(shell)/ops/schedules/ScheduleTable.tsx`
- NA `lib/schedules/__tests__/schedule.test.ts`、`store.test.ts`、`social-report-jobs.test.ts`（由 `social-monthly-job.test.ts` git mv 改名）
- NA `lib/social/__tests__/report-period.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs`
- `agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md`
- Oracle artifacts：`agency-os/reports/oracle/2026-10-24-partialreview-232e01f7.md`、`-74be1d9f.md`、`-1b2af618.md`（若未被別的 commit 帶走）

做了什麼（一句一件）：
- 0123：`client_schedules.day_of_month`（1–28，**台北**日）＋頻率 monthly/quarterly/yearly；`social_monthly_report` 的 daily 列轉 monthly。
- `isDueNow`：週期頻率在選定日同一小時觸發，錯過再補 2 天（不跨月），每期一次。
- 四個報表 job（`REPORT_JOBS` 在 `report-period.ts`）；`runPeriodReport` 取代 `runMonthlyReport`；品牌時區落後台北時丟 `NotDueYet`（sweep 不記錄、不開事件）；週報用品牌自己的上週。
- 年報：`MAX_DAYS` 366；報表貼文不設 200 上限。
- 排程頁加「日期」欄（1–28 格子）＋批次；社群報表管理頁開關四種、顯示寄出時間。
- 舊頁相容：PATCH 沒帶 dayOfMonth 保留原值；社群 PUT 沒帶 kind = monthly，回應另帶 `monthly`；社群開關只改 enabled（`setScheduleEnabled`）；過時頻率經 `asRegistered()` 讀成 job 預設。

# Steps
1. 審查：讀上列 diff（`git diff -- <files>`，新檔直接讀）。只修會壞的（資料遺失、排程錯、測試紅）。Claude 已過 Codex 三輪：232e01f7（F1 時區、F3 down 備份修；F2 2 月 27/28 補寄天數少＝接受；F4 部分寄失敗人工重寄＝原設計）、74be1d9f（三項修）、1b2af618（兩項修，修前已寫不變量）。
2. 測試（在 NA）：
   - `npx tsc --noEmit` → exit 0
   - `npx vitest run lib/schedules lib/social app/api/ops/clients app/api/internal/schedules app/api/social` → 354 passed / 3 skipped
3. 套 migration（High，已核准）：
   - `node scripts/apply-db-migration.mjs --check 0123`
   - `node scripts/apply-db-migration.mjs 0123`
   - 驗證：`node scripts/apply-db-migration.mjs --status` 顯示 0123 已記錄；SSH 主機 `docker exec supabase-db psql -U supabase_admin -d postgres -c "\d public.client_schedules"` 看得到 `day_of_month` 與新 check。
4. WORKLOG：寫 entry（占位 `（續NNN）`）→ `python scripts/worklog-insert-entry.py <entry.md>`。必含四行機械格式：REALTEST_EVIDENCE（tsc、vitest、migration apply）、REVIEW_DONE（critic=Deep，findings 依實際）、BUGHUNT_DONE（scope=agency-os,scripts,lobster-factory | grep=runMonthlyReport|MAX_DAYS = 93|1–3 號 | hits=0；`SOCIAL_MANAGER_PLAN.md:168` 是舊卡歷史，不改）、根因／rollback。
5. Commit：`python scripts/git-partial-worktree-commit.py stage agency-os/WORKLOG.md --worklog-entry <N> -- <上列檔案>`，接著**單獨一個指令**跑它印出的 `GIT_INDEX_FILE=<path> git commit -F <msg>`（HEAD 動了就 drop 重 stage）。commit message 含根因＋驗證。
6. Push：另一個指令 `git push origin main`。確認 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` 不存在。

# Acceptance
- 0123 在正式庫 ledger；main 上有這個 commit；tsc 0；354 tests 綠。

# Rollback
- 程式：`git revert <commit>`；資料庫（先退程式）：跑 `0123_client_schedules_day_of_month.down.sql`（會先把週期列備份到 `client_schedules_0123_backup`）。
