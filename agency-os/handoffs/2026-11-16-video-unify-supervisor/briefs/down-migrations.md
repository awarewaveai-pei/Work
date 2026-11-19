# 小卡「down migration 一律刪帳本列」（N2 的 db-expert 發現的一整類問題）

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`。在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；**不對任何資料庫執行任何 migration 或 down**（只改檔與測試）；回報操作者一律繁體中文。

## 問題
`lobster-factory/packages/db/migrations/` 的 down 檔退回 schema 後，若不刪 `public.schema_migrations` 裡自己那一列，`scripts/apply-db-migration.mjs` 會認為該 migration 仍已套用，重套時被拒（要 `--force-reapply`），部署的 migration 閘也會誤判。

正確寫法見 `0168_client_schedules_per_topic_cap.down.sql`：同一個 transaction 內 `if to_regclass('public.schema_migrations') is not null then delete from public.schema_migrations where filename = '<up 檔名>'; end if;`。

已知漏掉的六個（監工驗過 `grep -c schema_migrations` = 0）：
`0099_cs_ai_replies_completed_at.down.sql`、`0104_cs_crisis_holding_replies.down.sql`、`0110_plans_entitlements.down.sql`、`0125_client_schedules_daily_limit.down.sql`、`0133_seller_sites.down.sql`、`0139_wp_sites_content_plan_attempted_at.down.sql`。

## 要做（關掉整類，不只六個）
1. 掃全部 `*.down.sql`：沒有刪帳本列的都補上，filename 用對應的 up 檔名。帳本表與欄位名先讀 `scripts/apply-db-migration.mjs` 確認。down 檔沒有 `begin/commit` 包住的，把刪除放在最後一個語句，同樣可重入。
2. AGENTS／memory 提過「down 寫兩處」：grep `down` 在 `agency-os/docs` 與 `lobster-factory/packages/db` 的 README／規範，找出第二處是什麼（另一份彙整檔，或 up 檔內的註解），兩處一致；回報時寫清楚第二處在哪。
3. 加檢查器：在既有的 migration 測試新增一條（先 grep `migrations` 在 `scripts/*.test.*`、`lobster-factory/packages/db/**/*.test.*`、`tests/`；有 `apply-db-migration` 的單元測試就加在那）：每個 `NNNN_*.down.sql` 都含對自己 up 檔名的 `schema_migrations` 刪除。沒有合適的測試檔就新增一支 node 測試並接進既有測試入口（說明接在哪）。
4. 不改任何 up 檔（改 up 檔會讓帳本的「套用後被編輯」檢查變紅）。

## 既有資料
正式庫不動。

## 測試
只有上面的檢查器。不做無效益測試。

## 驗收
跑你加的檢查器與它所在的測試入口；`node scripts/apply-db-migration.mjs --status`（唯讀）確認沒有因為改 down 檔而出現「edited after applying」。`/codex-review` 一輪即可。

## 回報
`FILES:`（補了幾個 down 檔、列名單）／`TESTS:`／`RISKS:` 三行加一句結論。
