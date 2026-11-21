# SF-B 資料模型與紀錄

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0、§1-4、§3 的 SF-B 列。縮寫 `NA/`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、`MIG/`＝`lobster-factory/packages/db/migrations/`。模型 Opus 5.5；migration 寫完派 `db-expert` 審一次。

## 目的
讓「一個客戶多個站、每站多個環境」有地方記，而且建立客戶時不再把既有設定整包蓋掉。

## 已知事實
- `environments` 表已存在、沒有任何寫入者：`MIG/0001_core.sql:134-151`（欄位含 `base_url`、`hosting_provider`、`server_ref`、`status`、`wp_root_path`、`credentials_ref`、`metadata`）。
- `NA/app/api/ops/organizations/route.ts:41-53`：以 `metadata: body.metadata ?? {}` upsert（依 slug）＝整包覆蓋既有 `metadata`。
- `ops_action_catalog` 既有種子 `MIG/0021_seed_build_console_actions.sql:42` 用 `enabled = excluded.enabled`，重跑會蓋掉操作者開關；新種子不可照抄。
- 寫入權限沿用 `MIG/0136_control_plane_tables_writes_only.sql:50-53`（只限 service role）。
- 目前最大號是 `0174`；開工時 `ls MIG | tail` 取下一個未用號碼。

## 要做
1. 新 migration `MIG/<下一號>_site_flow.sql`＋`.down.sql`：
   - `environments` 部分唯一索引 `(site_id, environment_type) where status <> 'archived'`。
   - `ops_action_catalog` 新增 `site.preflight`、`site.create`、`site.wp_install`、`site.vhost`、`site.mainwp`、`site.bridge`、`site.open` 各一列，`enabled=false`，`on conflict (action_key) do nothing`。
   - 開頭 `set local lock_timeout`（照近期 migration 的寫法）；down 刪這些列與索引。
   - **只寫檔，不套用。**
2. 新 `NA/lib/site-flow/records.ts`：`ensureOrganization`（依 slug；既有列只合併 metadata 的指定鍵，不覆蓋其他鍵）、`ensureSite`、`ensureEnvironment`（冪等；`hosting_provider` 只收 `ks-aw-01-docker`｜`ks-aw-01-staging-subdir`｜`external-ssh`；`metadata.ingress` 只收 `host-vhost`｜`product-gateway`，預設 `host-vhost`）。workspace／project 等上游列照既有 `NA/app/api/onboarding/trigger-build/route.ts:149-295` 的做法抽出共用，不寫第二份。
3. `NA/app/api/ops/organizations/route.ts` 改呼叫 records（修整包覆蓋）；`trigger-build/route.ts:149-295` 改呼叫 records（行為不變）；`provision-staging/route.ts:437` 的隨機 `environmentId` 改為真的寫一列 staging 環境並回傳其 id。

## 檔案
新：migration 兩檔、`NA/lib/site-flow/records.ts`、`NA/lib/site-flow/__tests__/records.test.ts`。改：上列三個 route。**分兩個 commit**：①程式（不含 migration，可先併）②migration 兩檔（等操作者同意套用當天才併）。程式那個 commit 不得依賴 migration 已套用才能通過測試或啟動。

## 驗收
- vitest：既有組織帶 `metadata.{wp_update_latest, brand_colors, client_config}`，用同 slug 再建立一次 → 三個鍵原樣還在（舊資料測試）；環境列重送不重複；不合法 `hosting_provider`／`ingress` 被拒。
- migration：本機拋棄式 Postgres（先讀 `scripts/` 內現成的 migration 套用腳本照用，不手打迴圈）up → down → up 綠；`db-expert` 無 Critical／Major。
- `NA` 目錄 `npx tsc --noEmit` exit 0；`npx vitest run lib/site-flow app/api/ops/organizations app/api/onboarding` 綠。

## 邊界
不套正式庫；不建頁面；不動 `wp_sites`（SF-I）；不改 `ops_action_runs` 的 schema。
