# 第 6 項：API 通道（等第一個只串 API 的客戶）

**狀態** 未開始　**風險** Medium　**模型** Opus 5.5　**前置** 第 4 項　**正本** ADR 017 §0 C 軸、順序 6

## Decision
- 表 `api_keys(id, organization_id, product_key, scopes text[] = feature_key 子集, hashed_key, created_by, revoked_at)`；只存雜湊，明文只顯示一次。
- `actor = api_key:<id>`；用量走同一個 `report()`；`can()` 的主體＝key 所屬計費帳戶。
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
→ 綠；測試名含 `a key outside its scope is refused`、`a revoked key is refused`、`usage from a key debits the owning account with actor api_key`。
真實：curl 帶 key 打 `https://social.aware-wave.com/api/social/brands` → 200；改 scope 外路徑 → 403 `{"code":"scope"}`。

## Rollback
套 `0106_api_keys.down.sql`；middleware 不認 Bearer 即回到第 4 步狀態。
