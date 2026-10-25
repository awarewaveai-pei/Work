# Card 07 — 0136：21 張控制面表只准控制面寫＋拿掉 user_metadata 信任（草稿，不套 prod）

回報操作者一律繁體中文、極精簡。不做無效益測試：只寫本卡點名的測試；突變只做在權限守衛，一個守衛一次。

## Decision
- 依 `agency-os/reports/audits/2026-10-26-rls-member-write-sweep.md` 判定為「控制面洞」的 21 張表（不含 `partner_referrals`、`sales_leads`），照 0134 作法：對每表 drop 該表目前生效的 INSERT/UPDATE/DELETE 政策（名稱以報告 file:line 為準），`revoke insert, update, delete, truncate, references, trigger on public.<t> from anon, authenticated`，保留 SELECT。結尾 do-block 斷言（同 `lobster-factory/packages/db/migrations/0134_organizations_control_plane_writes_only.sql:15-26`）逐表檢查：無非 SELECT 政策、兩角色無表級／欄位級寫權。
- `current_clerk_org_id_from_jwt()`（`0018_rls_initplan_and_workflow_runs_index_dedupe.sql:10-21`）重建，拿掉 `j -> 'user_metadata' ->> 'org_id'` 一行（登入者可經 `auth.updateUser({data})` 自改）；其餘分支、`stable`、search_path（`0017_fix_function_search_path_rls_helpers.sql` 慣例）不變。
- **先盤點**：若任一 app 路徑以使用者 session（`lib/supabase/route-client.ts:30`、`lib/supabase/ssr.ts:27,56`）或 SECURITY INVOKER 函式寫這 21 張表，把該表移出本 migration，列在報告「保留」段並說明；不得改 app 程式。

## Constraints
- 不連 prod、不套用、不改 0001–0135 任何檔、不改 app 程式。
- migration 單一交易、`set local lock_timeout = '5s'`、結尾 `notify pgrst, 'reload schema'`（同 0134）。
- down 還原每個被 drop 的政策**原文**（取自其最後生效的 migration）與被 revoke 的權限，並還原函式原定義；開頭刪 `schema_migrations` 列（同 `0134_organizations_control_plane_writes_only.down.sql:4-9`）。

## Files
- `lobster-factory/packages/db/migrations/0136_control_plane_tables_writes_only.sql`
- `lobster-factory/packages/db/migrations/0136_control_plane_tables_writes_only.down.sql`
- `lobster-factory/packages/db/scripts/0136_control_plane_tables_writes_only_down.sql`（與 down 逐 byte 相同）
- `lobster-factory/packages/db/tests/test_0136_control_plane_writes.py`（新）
- `agency-os/reports/audits/2026-10-26-rls-member-write-sweep.md`：追加「0136 草稿」段：app 寫入點盤點結果（file:line）、納入／保留表清單、測試輸出摘要。

## Acceptance
- `test_0136_control_plane_writes.py`（pytest）：拋棄式 `postgres:15.8-alpine`＋`postgrest/postgrest:v14.6`（docker；建庫法照 `D:/tmp/codex-ref/verify_0134.py` 與 `lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py:85-93`，套建立這 21 表與其政策所需的 migrations），測試：
  1. `test_member_write_blocked_after_0136`：成員 JWT 對 `approvals`、`environments`、`workflow_runs` 的 PATCH 與 DELETE 在 0136 前成功、後回 403。
  2. `test_member_select_unchanged`：同成員 SELECT 自己 org 的列照常。
  3. `test_service_role_writes_unchanged`：service_role 對同三表 PATCH/INSERT/DELETE 照常。
  4. `test_user_metadata_org_id_ignored`：插一筆 active `clerk_organization_mappings`，非成員 JWT 帶 `user_metadata.org_id`=該 clerk id：0136 前可讀該 org 的 `projects`、後讀不到；帶 `app_metadata.org_id` 仍可讀。
  5. `test_down_then_up`：down 後 1 的攻擊重現，再 up 關閉。
  6. 斷言區塊對全部納入表跑過（up 成功即證明）。
- 突變一次：up 拿掉 `environments` 的 revoke 與 drop → 測試 1 變紅；還原變綠（寫進報告）。
- 不 commit 到 main（driver 收在 refs/codex/do）；本卡 = 草稿給操作者看。
