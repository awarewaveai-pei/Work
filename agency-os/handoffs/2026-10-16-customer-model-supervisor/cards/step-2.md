# 第 2 項：方案表、權利表、組織種類；許可簽發；付費入口唯一閘

**風險** Medium（本機與 staging 先跑；套 prod 時 High，要 go）　**模型** Opus 5.5，先出計畫　**前置** 第 1 項　**正本** ADR 017 §3、順序 2、付費入口唯一閘

## Decision
- Migration `0104_plans_entitlements.sql`（＋`.down.sql`）：
  - `plans(plan_key pk, product_key, kind base|addon, features jsonb, limits jsonb, woo_product_ids int[], created_at)`。
  - `organization_entitlements(id, organization_id, product_key, feature_key, source contract|comp, source_ref, starts_at, ends_at, status, limits jsonb)`，索引 `(organization_id, product_key, feature_key) where status='active'`。
  - `organizations.kind text not null default 'customer' check (kind in ('internal','customer'))`；Account#0 這一列 update 成 `internal`（id 寫在 migration 註解，從 `organizations` 查 slug）。
  - 0062：加 `plan_key`、`source_ref`；CHECK 放寬成登記表全部 key（由測試比對）；唯一索引改 `(organization_id, product_key, plan_key) where status <> 'canceled'`。
  - 三表 RLS：`service_role` 全權；`anon`／`authenticated` 無任何 policy（控制面是唯一寫者，ADR 017 §3）。
- `lib/entitlements/`：`tables.ts`（唯一碰三表的 Supabase client 包裝）、`permit.ts`（簽發：`tenant`、`product_key`、`feature_key`、`entitlement_id`、`source_ref`、limits、`max_spend`、`actor`、`on_behalf_of`、`issued_at`、`expires_at`（≤ 10 分鐘）、`kid`、Ed25519 簽章）、`can.ts`（第 4 步接呼叫端，本步先有型別與驗章）。
- 金鑰：`ENTITLEMENT_SIGNING_KEY`（私鑰，vault → `mcp/user-env.ps1` → 容器 env）與 `ENTITLEMENT_PUBLIC_KEYS`（`kid:公鑰` 清單，可多把，換鑰時新舊並存一個 `expires_at` 窗）。產生：`scripts/secrets-vault.ps1 -Action set -Name ENTITLEMENT_SIGNING_KEY`。
- 到期：`ends_at = current_period_end + 7 天寬限`（預設，操作者可改）；過期由每日 job（既有 schedules 表加一列 `entitlements-expire`）把 status 改 `expired`，不刪列。
- 付費入口唯一閘：`lib/entitlements/__tests__/import-boundary.test.ts` 掃 `app/**`、`lib/**` 的 `import`／`require` 字串，命中 `@anthropic-ai/sdk`、`openai`、`replicate`、`@fal-ai`、`@google/genai`、`media_credit_ledger`、`organization_entitlements`、`plans`、`organization_product_subscriptions` 的檔案只准是 `lib/entitlements/**`、`lib/ai/gateway.ts`、`app/portal/**`；其餘紅燈。現有 `lib/ai/claude-request.ts` 改名為 `lib/ai/gateway.ts`，其餘呼叫端改 import 它（第 4 步才接 `can()`，本步只收斂入口）。

## Files
- `lobster-factory/packages/db/migrations/0104_plans_entitlements.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/{tables,permit,can}.ts`、`__tests__/{permit,import-boundary}.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts`（由 `claude-request.ts` 改名）
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`（對照用）＋主機 compose 走 `safe-infra-patch.sh`（env 兩個變數）

## Acceptance
```bash
cd D:/Work && node scripts/apply-db-migration.mjs --check 0104
```
→ 解析到 `0104_plans_entitlements.sql` 與 `.down.sql`，無錯（`--check` 只解析檔案，不連線）。本機拋棄式 Postgres 套用（不碰 prod 容器）：
```bash
docker run -d --name pg-0104 -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:16 && sleep 5 && for f in 0001 0062 0077 0104; do docker exec -i pg-0104 psql -U postgres -f - < D:/Work/lobster-factory/packages/db/migrations/${f}_*.sql; done
```
→ 無 ERROR；`docker exec pg-0104 psql -U postgres -c "\d public.organization_entitlements"` 看到索引；`.down.sql` 套上再套回無錯；最後 `docker rm -f pg-0104`。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/entitlements lib/portal
```
→ 綠；`permit.test.ts` 含：簽發→驗章 ok；改一個 byte → 拒；`expires_at` 過 → 拒；未知 `kid` → 拒。
突變：在 `lib/social/store.ts` 加一行 `import Replicate from "replicate"` → `import-boundary.test.ts` 紅；移除綠。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit -p .
```
→ exit 0。
套 prod：`node scripts/apply-db-migration.mjs 0104`（High，操作者 go）→ `APPLY_OK`；`node scripts/apply-db-migration.mjs --status` 的 applied 數 +1；`docker exec lobster-next-admin printenv ENTITLEMENT_SIGNING_KEY | wc -c` > 1。

## Rollback
prod 套 `0104_plans_entitlements.down.sql`（`docker exec -i supabase-db psql ... < down.sql`，0 筆資料，無損；apply 腳本沒有 down 旗標）；`git revert`；env 兩個變數留著無害。
