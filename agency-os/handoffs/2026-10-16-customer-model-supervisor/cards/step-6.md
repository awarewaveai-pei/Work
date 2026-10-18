# 第 6 項：API 通道（等第一個只串 API 的客戶）

**風險** Medium　**模型** Opus 5.5　**前置** 第 3 項　**正本** ADR 017 §0 C 軸、順序 6

## Decision
- 表 `api_keys(id, billing_account_id, product_key, scopes text[] = feature_key 子集, hashed_key, created_by, revoked_at)`：`billing_account_id` 必須是根組織（`parent_organization_id is null`，CHECK＋測試），子組織不得持有 key，扣點與許可都對根帳戶（Codex M21）；只存雜湊，明文只顯示一次。加 `expires_at`（預設簽發後 365 天）、`rotated_from`（換鑰時舊鑰保留 7 天寬限後自動撤）；只有該根帳戶的 owner／admin 能簽發與撤銷，每次簽發、撤銷、拒絕都寫稽核列；速率上限走該產品的 RATE_LIMIT 功能；Bearer 無 cookie，不受 CSRF（Codex R2-5）。
- `actor = api_key:<id>`；用量走同一個 `report()`；`can()` 的主體＝key 所屬計費帳戶。scope 檢查查第 3 項 `withFeature` 登記的「路由→功能」表，沒登記功能的路由不接受 API key（Codex M20）。
- 登記表 `accessChannels` 加 `"api"` 的產品才接受 key；產品門 nginx 區塊對 `/api/<product>` 放行 `Authorization: Bearer awk_…`。
- 發放與撤銷：`/ops/billing` 該帳戶列的「API 金鑰」區塊（員工門）；客戶門 V2 再開自助。

## Files
- `lobster-factory/packages/db/migrations/0106_api_keys.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/api-keys.ts`、`__tests__/api-keys.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts`（Bearer → actor）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx`

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/entitlements middleware
```
→ 綠；測試名含 `a key outside its scope is refused`、`a revoked key is refused`、`usage from a key debits the owning account with actor api_key`、`a key cannot be issued to a child organisation`、`a route without withFeature refuses any api key`、`an expired key is refused`、`a rotated key keeps working for 7 days then is refused`、`a non-owner cannot issue a key`。
真實：curl 帶 key 打 `https://social.aware-wave.com/api/social/brands` → 200；改 scope 外路徑 → 403 `{"code":"scope"}`。

## Rollback
套 `0106_api_keys.down.sql`；middleware 不認 Bearer 即回到第 3 步狀態。
