# Card 08 — 0137：partner_referrals 只准控制面寫（佣金／歸屬，操作者 2026-10-26 定案）

回報操作者一律繁體中文、極精簡。不做無效益測試：只寫本卡點名的測試。

## Decision
`partner_referrals` 是佣金／歸屬資料（操作者定案）。照 0136（`lobster-factory/packages/db/migrations/0136_control_plane_tables_writes_only.sql`）：drop `partner_referrals_{insert,update,delete}`（定義在 `0010_clerk_org_mapping_and_rls_expansion.sql:339-351`），revoke insert/update/delete/truncate/references/trigger from anon, authenticated，保留 SELECT；結尾斷言同 0136 do-block。先確認 app 無使用者 session 寫入 `partner_referrals`（`lib/supabase/route-client.ts:30`、`lib/supabase/ssr.ts:27,56` 的呼叫端），有就停並在報告寫明。

## Constraints
- 不連 prod、不改 0001–0136、不改 app 程式。單一交易、`set local lock_timeout = '5s'`、`notify pgrst, 'reload schema'`。
- down 還原 0010:339-351 三政策原文與權限，開頭刪 `schema_migrations` 列（同 `0136_control_plane_tables_writes_only.down.sql` 開頭）。

## Files
- `lobster-factory/packages/db/migrations/0137_partner_referrals_writes_only.sql`
- `lobster-factory/packages/db/migrations/0137_partner_referrals_writes_only.down.sql`
- `lobster-factory/packages/db/scripts/0137_partner_referrals_writes_only_down.sql`（與 down 逐 byte 相同）
- `lobster-factory/packages/db/tests/test_0137_partner_referrals_writes.py`（照 `test_0136_control_plane_writes.py` 建庫法）
- `agency-os/reports/audits/2026-10-26-rls-member-write-sweep.md`：`partner_referrals` 列判定改為「控制面洞（操作者 2026-10-26 定案）→ 0137」，末行計數更新。

## Acceptance
- `test_0137_partner_referrals_writes.py`：成員 JWT PATCH 與 DELETE 在 0137 前成功、後 403；成員 SELECT 照常；service_role PATCH/INSERT/DELETE 照常；down 後重現、再 up 關閉。
