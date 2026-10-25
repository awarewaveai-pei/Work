# public RLS 成員寫入盤點（2026-10-26）

## 範圍與判準

- 依 `lobster-factory/packages/db/migrations/*.sql` 的正向 migration 檔名順序重建 `public` 政策；同名政策以最後一次建立為準，不把 `.down.sql` 當成已套用。`0020_splinter_duplicate_indexes_and_rls_stray_policies.sql:60` 的迴圈先清空四張身分表政策；`0134_organizations_control_plane_writes_only.sql:12` 與 `0135_profiles_control_plane_writes_only.sql:11` 再移除 `organizations`／`profiles` 的成員寫入政策，因此兩表不在下表。這是**原始碼推導**，沒有查正式資料庫的實際 migration／ACL 狀態。
- 下表只計入有 `INSERT`、`UPDATE`、`DELETE` 或 `ALL` 政策，且政策適用 `PUBLIC`（未寫 `TO`）、`anon` 或 `authenticated` 的表；`TO service_role` 專用政策不計入。`PUBLIC` 政策同時適用 anon 與 authenticated。`0010_clerk_org_mapping_and_rls_expansion.sql:47`、`0018_rls_initplan_and_workflow_runs_index_dedupe.sql:39` 的 `user_has_org_access` 包含 active membership **或** Clerk org mapping；後者取 JWT 的 `user_metadata.org_id`（`0018_rls_initplan_and_workflow_runs_index_dedupe.sql:19`）。因此「成員可寫」並非政策所能證明的唯一可寫身分；mapping／JWT 信任邊界需另審。
- `lib/supabase/route-client.ts:30` 定義的 `createSupabaseUserClient` 在 next-admin 非測試碼沒有呼叫端；`lib/supabase/ssr.ts:27,56` 的 session client 呼叫端只做 Auth 操作，沒有下表的 `.from(...).insert/update/delete/upsert`。故「使用者端寫入呼叫端」逐列皆為「無」。伺服端範例：`lib/ops-actions/record.ts:32`、`lib/content/blocks/video-pipeline.ts:174` 取 `getSupabaseWriteClient`，其 service-role 來源見 `lib/supabase-server.ts:29`。無 app 呼叫**不等於**無漏洞：有 JWT 的成員仍能直接呼叫 PostgREST；`0094_public_tables_rls_default_deny.sql:2` 說明 public 表的預設 ACL。
- 判定 `客戶業務資料可寫 OK` 表示本卡未找到可改控制面／計費／權限欄位的允許政策；括號「拒寫」表示只有 `false` 政策。`控制面洞` 指列或欄位不應交由一般成員任意增改刪；這是 migration 定義造成的暴露，**沒有**對正式環境做寫入實測。

## 逐表結果

下表政策引用的檔案均位於 `lobster-factory/packages/db/migrations/`；I/U/D 分別為 INSERT/UPDATE/DELETE，全部三項均為未指定 `TO` 的 `PUBLIC` 政策，且只用 `user_has_org_access` 限定 `organization_id`（`approval_steps` 經所屬 `approvals` 間接限定）。每個「控制面洞」的「刪三策／撤六權」建議均指本文下方的同一完整方案，對該列三個具名政策與該表逐一執行。

| 表名 | 目前生效的非 SELECT 政策（file:line） | 使用者端寫入呼叫端 | 判定與理由 |
|---|---|---|---|
| `agent_runs` | I `0010_clerk_org_mapping_and_rls_expansion.sql:244`; U `0010_clerk_org_mapping_and_rls_expansion.sql:248`; D `0010_clerk_org_mapping_and_rls_expansion.sql:253` | 無 | 控制面洞：可改執行狀態、輸出與 `cost_amount`（`0003_agents_approvals_observability.sql:117`）；建議刪三策／撤六權。 |
| `ai_image_jobs` | I `0016_ops_console_and_permission_catalog_rls_policies.sql:56`; U `0016_ops_console_and_permission_catalog_rls_policies.sql:61`; D `0016_ops_console_and_permission_catalog_rls_policies.sql:67` | 無 | 控制面洞：可偽造作業狀態、provider 與輸出資產（`0011_ops_console_control_plane.sql:56`）；建議刪三策／撤六權。 |
| `app_theme` | ALL `0052_app_theme.sql:34`（`anon, authenticated`，`false`） | 無 | 客戶業務資料可寫 OK（拒寫）：唯一非 SELECT 政策的 `USING`／`WITH CHECK` 都是 `false`。 |
| `approval_steps` | I `0010_clerk_org_mapping_and_rls_expansion.sql:197`; U `0010_clerk_org_mapping_and_rls_expansion.sql:208`; D `0010_clerk_org_mapping_and_rls_expansion.sql:227` | 無 | 控制面洞：可自填 `approved`／`approver_user_id`，政策只驗所屬 org（`0003_agents_approvals_observability.sql:57`）；建議刪三策／撤六權。 |
| `approvals` | I `0010_clerk_org_mapping_and_rls_expansion.sql:171`; U `0010_clerk_org_mapping_and_rls_expansion.sql:175`; D `0010_clerk_org_mapping_and_rls_expansion.sql:180` | 無 | 控制面洞：可把核准狀態改成 `approved` 或刪除核准列（`0003_agents_approvals_observability.sql:42`）；建議刪三策／撤六權。 |
| `cx_retention_runs` | I `0010_clerk_org_mapping_and_rls_expansion.sql:436`; U `0010_clerk_org_mapping_and_rls_expansion.sql:440`; D `0010_clerk_org_mapping_and_rls_expansion.sql:445` | 無 | 控制面洞：可改系統健康分數、嚴重度與處理狀態（`0009_cx_retention_upsell_baseline.sql:3`）；建議刪三策／撤六權。 |
| `cx_upsell_opportunities` | I `0010_clerk_org_mapping_and_rls_expansion.sql:455`; U `0010_clerk_org_mapping_and_rls_expansion.sql:459`; D `0010_clerk_org_mapping_and_rls_expansion.sql:464` | 無 | 控制面洞：可改商機分數與 `won` 等商業狀態（`0009_cx_retention_upsell_baseline.sql:17`）；建議刪三策／撤六權。 |
| `decision_recommendations` | I `0010_clerk_org_mapping_and_rls_expansion.sql:417`; U `0010_clerk_org_mapping_and_rls_expansion.sql:421`; D `0010_clerk_org_mapping_and_rls_expansion.sql:426` | 無 | 控制面洞：可改系統建議的優先級、理由與已執行狀態（`0008_decision_engine_recommendations.sql:3`）；建議刪三策／撤六權。 |
| `decision_scores` | I `0010_clerk_org_mapping_and_rls_expansion.sql:378`; U `0010_clerk_org_mapping_and_rls_expansion.sql:382`; D `0010_clerk_org_mapping_and_rls_expansion.sql:387` | 無 | 控制面洞：可直接偽造系統計算的 `score_value`（`0007_v3_skeleton_modules.sql:52`）；建議刪三策／撤六權。 |
| `environments` | I `0010_clerk_org_mapping_and_rls_expansion.sql:512`; U `0010_clerk_org_mapping_and_rls_expansion.sql:516`; D `0010_clerk_org_mapping_and_rls_expansion.sql:521` | 無 | 控制面洞：可改 `production` 環境的主機、路徑與 `credentials_ref`（`0001_core.sql:134`）；建議刪三策／撤六權。 |
| `error_events` | I `0010_clerk_org_mapping_and_rls_expansion.sql:282`; U `0010_clerk_org_mapping_and_rls_expansion.sql:286`; D `0010_clerk_org_mapping_and_rls_expansion.sql:291` | 無 | 控制面洞：可偽造或抹除錯誤證據（`0003_agents_approvals_observability.sql:159`）；建議刪三策／撤六權。 |
| `incidents` | I `0010_clerk_org_mapping_and_rls_expansion.sql:263`; U `0010_clerk_org_mapping_and_rls_expansion.sql:267`; D `0010_clerk_org_mapping_and_rls_expansion.sql:272` | 無 | 控制面洞：可把重大事件標成 resolved 或刪除（`0003_agents_approvals_observability.sql:139`）；建議刪三策／撤六權。 |
| `marketing_campaigns` | I `0010_clerk_org_mapping_and_rls_expansion.sql:321`; U `0010_clerk_org_mapping_and_rls_expansion.sql:325`; D `0010_clerk_org_mapping_and_rls_expansion.sql:330` | 無 | 控制面洞：可改預算 `budget` 與活動狀態（`0007_v3_skeleton_modules.sql:16`）；建議刪三策／撤六權。 |
| `media_assets` | I `0010_clerk_org_mapping_and_rls_expansion.sql:359`; U `0010_clerk_org_mapping_and_rls_expansion.sql:363`; D `0010_clerk_org_mapping_and_rls_expansion.sql:368` | 無 | 控制面洞：可改 `object_key`、`checksum_sha256`、`is_current` 等資產來源欄（`0038_media_assets_reconcile.sql:33,37,40`）；建議刪三策／撤六權。 |
| `merchandising_insights` | I `0010_clerk_org_mapping_and_rls_expansion.sql:397`; U `0010_clerk_org_mapping_and_rls_expansion.sql:401`; D `0010_clerk_org_mapping_and_rls_expansion.sql:406` | 無 | 控制面洞：可偽造系統洞察的優先級與建議（`0007_v3_skeleton_modules.sql:62`）；建議刪三策／撤六權。 |
| `ops_action_runs` | I `0016_ops_console_and_permission_catalog_rls_policies.sql:32`; U `0016_ops_console_and_permission_catalog_rls_policies.sql:37`; D `0016_ops_console_and_permission_catalog_rls_policies.sql:43` | 無 | 控制面洞：可偽造 `approval_status`、`actor_role` 與執行結果（`0011_ops_console_control_plane.sql:13`）；建議刪三策／撤六權。 |
| `ops_audit_events` | I `0016_ops_console_and_permission_catalog_rls_policies.sql:80`; U `0016_ops_console_and_permission_catalog_rls_policies.sql:85`; D `0016_ops_console_and_permission_catalog_rls_policies.sql:91` | 無 | 控制面洞：稽核事件可被任意增改刪（`0011_ops_console_control_plane.sql:76`）；建議刪三策／撤六權。 |
| `organization_product_subscriptions` | I `0062_organization_product_subscriptions.sql:148`; U `0062_organization_product_subscriptions.sql:152`; D `0062_organization_product_subscriptions.sql:156`（`authenticated`, `false`）；ALL `0062_organization_product_subscriptions.sql:163`（`anon`, `false`） | 無 | 客戶業務資料可寫 OK（拒寫）：計費／產品資格列只有顯式拒寫政策；SELECT 另以直接 membership 限定（`0062_organization_product_subscriptions.sql:139`）。 |
| `package_install_runs` | I `0010_clerk_org_mapping_and_rls_expansion.sql:151`; U `0010_clerk_org_mapping_and_rls_expansion.sql:155`; D `0010_clerk_org_mapping_and_rls_expansion.sql:160` | 無 | 控制面洞：可偽造安裝／回滾狀態與結果（`0002_factory.sql:108`）；建議刪三策／撤六權。 |
| `partner_referrals` | I `0010_clerk_org_mapping_and_rls_expansion.sql:340`; U `0010_clerk_org_mapping_and_rls_expansion.sql:344`; D `0010_clerk_org_mapping_and_rls_expansion.sql:349` | 無 | 需人判：`status`／`referred_entity`（`0007_v3_skeleton_modules.sql:28`）若用於佣金或歸屬，應改 service role 專寫；若只是客戶 CRM 資料，可保留 org 範圍 CRUD。現無使用者端寫入需求證據。 |
| `projects` | I `0010_clerk_org_mapping_and_rls_expansion.sql:484`; U `0010_clerk_org_mapping_and_rls_expansion.sql:488`; D `0010_clerk_org_mapping_and_rls_expansion.sql:493` | 無 | 控制面洞：可改 `client_organization_id`、擁有者與專案狀態（`0001_core.sql:101`）；建議刪三策／撤六權。 |
| `repair_runs` | ALL `0033_repair_runs_rls_deny_anon.sql:18`（`anon`, `false`） | 無 | 客戶業務資料可寫 OK（拒寫）：唯一相關政策只拒絕 anon，authenticated 無允許政策。 |
| `sales_leads` | I `0010_clerk_org_mapping_and_rls_expansion.sql:302`; U `0010_clerk_org_mapping_and_rls_expansion.sql:306`; D `0010_clerk_org_mapping_and_rls_expansion.sql:311` | 無 | 客戶業務資料可寫 OK：`source/status/score` 是 org 內銷售線索欄（`0007_v3_skeleton_modules.sql:4`），未見計費或權限欄；政策允許成員直接改同 org 線索。 |
| `sites` | I `0010_clerk_org_mapping_and_rls_expansion.sql:498`; U `0010_clerk_org_mapping_and_rls_expansion.sql:502`; D `0010_clerk_org_mapping_and_rls_expansion.sql:507` | 無 | 控制面洞：可改網域、`stack_profile`、`apply_mode` 與站點狀態（`0001_core.sql:117`、`0022_build_console_execution_tables.sql:35`）；建議刪三策／撤六權。 |
| `video_jobs` | ALL `0047_video_jobs.sql:44`（`anon, authenticated`，`false`） | 無 | 客戶業務資料可寫 OK（拒寫）：唯一相關政策的 `USING`／`WITH CHECK` 都是 `false`。 |
| `workflow_runs` | I `0010_clerk_org_mapping_and_rls_expansion.sql:132`; U `0010_clerk_org_mapping_and_rls_expansion.sql:136`; D `0010_clerk_org_mapping_and_rls_expansion.sql:141` | 無 | 控制面洞：可改風險、執行、核准與費用欄（`0002_factory.sql:80`）；建議刪三策／撤六權。 |
| `workspaces` | I `0010_clerk_org_mapping_and_rls_expansion.sql:470`; U `0010_clerk_org_mapping_and_rls_expansion.sql:474`; D `0010_clerk_org_mapping_and_rls_expansion.sql:479` | 無 | 控制面洞：可改工作空間識別、狀態或刪除整列（`0001_core.sql:16`）；建議刪三策／撤六權。 |

## anon 寫入政策清單

`PUBLIC` 默認套用 anon：`agent_runs`、`ai_image_jobs`、`approval_steps`、`approvals`、`cx_retention_runs`、`cx_upsell_opportunities`、`decision_recommendations`、`decision_scores`、`environments`、`error_events`、`incidents`、`marketing_campaigns`、`media_assets`、`merchandising_insights`、`ops_action_runs`、`ops_audit_events`、`package_install_runs`、`partner_referrals`、`projects`、`sales_leads`、`sites`、`workflow_runs`、`workspaces`（共 23 張；一般無 JWT 的 anon 無法通過 `user_has_org_access`，但政策本身仍適用 anon）。另有顯式 `TO anon` 且 `false` 的 `app_theme`、`organization_product_subscriptions`、`repair_runs`、`video_jobs`（共 4 張）。合計 27 張，並非聲稱 27 張可由未登入者實際寫入。

## 控制面洞的逐表修補方案（本卡不執行）

對上表每一個「控制面洞」，依該列 I/U/D 的**實際政策名稱**各執行 `DROP POLICY IF EXISTS <name> ON public.<table>`，再對該表執行 `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.<table> FROM anon, authenticated`；保留既有 SELECT，驗證 `pg_policies` 無非 SELECT 政策、兩角色無 table／column 寫權。這是 `0134_organizations_control_plane_writes_only.sql:12` 與 `0135_profiles_control_plane_writes_only.sql:11` 的做法。對需要客戶編輯的欄位，應先確立產品規則，再新增只更新安全欄位的受控 API／資料庫函式；不可讓舊的整列 CRUD 政策留著。`partner_referrals` 在佣金語意定案前不歸入已確認洞，也不宣稱安全。

tables=27 holes=21 needs_human=1

## Claude 驗收（2026-10-26）

- 抽查 `0010:512`（environments_insert）、`0016:56`（ai_image_jobs_insert）、`0010:302`（sales_leads）屬實。
- 追加 C1（潛伏）：`user_has_org_access`（`0018_rls_initplan_and_workflow_runs_index_dedupe.sql:45-54`）接受 `current_clerk_org_id_from_jwt()`，其來源含 `user_metadata.org_id`（`0018:19`）——GoTrue 讓登入者用 `auth.updateUser({data})` 自改 user_metadata。prod `clerk_organization_mappings` 0 列（2026-10-26 唯讀查證）→ 目前不可利用；一旦新增 mapping 即成跨組織存取。修法：拿掉 `user_metadata` 分支（只信 `app_metadata`／簽發端 claim）。

## 0136 草稿（未套用）

- 使用者 session 寫入盤點：`lib/supabase/route-client.ts:30` 的 `createSupabaseUserClient` 無非測試呼叫點；`lib/supabase/ssr.ts:27,56` 的 browser／middleware client 只用於 `app/login/LoginForm.tsx:29`、`app/portal/login/PortalLoginForm.tsx:35`、`app/login/wp/WpSignIn.tsx:40-57`、`app/login/set-password/SetPasswordForm.tsx:51-74`、`app/LogoutButton.tsx:16` 等 Auth 呼叫。跨正向 migrations 搜尋 21 表的 INSERT／UPDATE／DELETE（含跨行）無命中；SECURITY INVOKER 函式沒有寫這 21 表。伺服端寫入仍走 `lib/supabase-server.ts:29` 的 service role。
- 納入（21）：`agent_runs`、`ai_image_jobs`、`approval_steps`、`approvals`、`cx_retention_runs`、`cx_upsell_opportunities`、`decision_recommendations`、`decision_scores`、`environments`、`error_events`、`incidents`、`marketing_campaigns`、`media_assets`、`merchandising_insights`、`ops_action_runs`、`ops_audit_events`、`package_install_runs`、`projects`、`sites`、`workflow_runs`、`workspaces`。政策來源逐表見上表 `逐表結果`；up 逐表撤三策／六權並斷言，down 還原 0010／0016 原政策、權限及 0018 函式。
- 保留於 migration 外：`partner_referrals`（佣金語意待人判）、`sales_leads`（客戶業務資料），依上表判定；21 張控制面表沒有因 app session 或 SECURITY INVOKER 寫入而移出。
- 測試：`python -m pytest -q lobster-factory/packages/db/tests/test_0136_control_plane_writes.py` → 5 passed（Postgres 15.8／PostgREST 14.6 拋棄式容器）；包含成員 PATCH/DELETE 前後、SELECT、service role CRUD、`user_metadata` 攻擊與 `app_metadata` 正例、down→up。fixture 為避開 `0038_media_assets_reconcile.sql:22` 記錄的 0007／0011 fresh-replay 欄位衝突，先套 0011 再套 0007，其餘相依 migration 照序。
- 權限突變一次：測試載入 up 時移除 `environments` 的三個 DROP POLICY 與 REVOKE，`test_member_write_blocked_after_0136` 紅（up 的 do-block 報 `environments still has a non-SELECT policy`）；關閉突變後同一測試 1 passed。正式 up 檔無突變。
