# Card 06 — RLS 成員寫入盤點（只寫報告）

回報操作者一律繁體中文、極精簡。不做無效益測試：只寫報告，不寫測試、不改程式。

## Decision
盤點 public schema 每張「anon／authenticated 有非 SELECT 政策」的表，判定成員能否寫入控制面欄位或計費／權限相關列。不變量同 0134（`lobster-factory/packages/db/migrations/0134_organizations_control_plane_writes_only.sql`）與 0135（`0135_profiles_control_plane_writes_only.sql`）：控制面列只由 service role 寫。

## Constraints
- 唯讀：只讀 `lobster-factory/packages/db/migrations/*.sql`（後蓋前：同名政策以最後一個 migration 為準，注意 `0020_splinter_duplicate_indexes_and_rls_stray_policies.sql` 的 drop-all 迴圈、0134/0135 的 drop）與 next-admin 程式。
- 使用者端 client＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/route-client.ts:30`（createSupabaseUserClient）、`lib/supabase/ssr.ts:27,56`；其餘（`lib/supabase-server.ts`）是 service role。
- 不碰 prod、不寫 migration、不改任何程式檔。

## Files
- 只新增：`agency-os/reports/audits/2026-10-26-rls-member-write-sweep.md`

## Acceptance
- 表格逐表一列：表名｜目前生效的非 SELECT 政策（`file:line`）｜使用者端寫入呼叫端（`file:line` 或「無」）｜判定：`客戶業務資料可寫 OK`／`控制面洞`／`需人判`＋一句理由。
- 涵蓋所有有 insert/update/delete/all 政策的表（至少 workspaces、projects、sites、environments、approvals、approval_steps、agent_runs、workflow_runs、incidents、media_assets、sales_leads 等；`organization_product_subscriptions` 的 deny 政策列為 OK）。
- 另列：anon 有任何寫入政策的表。
- 每個「控制面洞」附建議方案（照 0134：drop policy＋revoke insert/update/delete/truncate/references/trigger），不寫成 migration 檔。
- 報告末行：`tables=<N> holes=<N> needs_human=<N>`。
