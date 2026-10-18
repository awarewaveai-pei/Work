# 第 9 項：客戶自己的網址指到 hosted 產品門（白牌；等第一個要的客戶）

**風險** Medium（憑證自動化）　**模型** Opus 5.5　**前置** 第 8 項　**正本** ADR 017 順序 9；ADR 018 §2

## Decision
- 表 `custom_domains(host text unique, organization_id uuid → 根計費帳戶, product_key, verified_at, created_by)`；一客戶一產品可多個 host。
- `lib/portal/doors.ts` `doorForHost`：先比設定網址（portal、各產品子網域），再查 `custom_domains`（快取 5 分鐘）；命中＝`{ kind: "product", product, organizationId }`，middleware 把 `organizationId` 當該請求的計費帳戶候選（仍要登入，不因網址就信任）。
- 驗證：客戶在自己 DNS 加 `_awarewave-verify.<host>` TXT＝`sha256(organization_id + host)` 前 32 字；`/ops/billing` 或客戶門設定頁按「驗證」→ 查到即填 `verified_at`；未驗證的 host 不路由。
- 憑證：Cloudflare for SaaS（客戶 CNAME 到 `customers.aware-wave.com`）優先；沒有 Cloudflare 時 on-demand ACME（lobster-nginx 換 Caddy 或 certbot hook）。選哪個＝待決 4。
- 登入來源不變（ADR 018 §3）；cookie 以該 host 為界。買斷安裝不用本項。

## Files
- `lobster-factory/packages/db/migrations/<次號>_custom_domains.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts`、`__tests__/doors.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts`
- `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`（通配 server）

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/portal middleware
```
→ 綠；測試名含 `an unverified custom host is not routed`、`a verified custom host routes to its product door and names the organisation`、`a custom host never grants a session by itself`。
真實：測試網域 CNAME → 驗證 → `curl -sI https://social.<測試網域>/` 200 且畫面是產品門；刪 TXT 後重驗 → 不路由。
突變：拔掉 `verified_at` 檢查 → 指名測試紅；還原綠。

## Rollback
套 `<次號>_custom_domains.down.sql`；`doorForHost` 不查表即回到第 8 項狀態。
