# 第 2 項：方案表、權利表、組織種類；許可簽發；付費入口唯一閘

**風險** Medium（本機與 staging 先跑；套 prod 時 High，要 go）　**模型** Opus 5.5，先出計畫　**前置** 第 1 項　**正本** ADR 017 §3、順序 2、付費入口唯一閘

## Decision
- Migration `<次號>_plans_entitlements.sql`（＋`.down.sql`；次號＝開工時 `ls lobster-factory/packages/db/migrations | tail -1` 的最大號＋1，本文件不鎖號——2026-10-18 已到 0109，Codex R2-8）：
  - `plans(plan_key pk, product_key, kind base|addon, features jsonb, limits jsonb, woo_product_ids int[], created_at)`。
  - `organization_entitlements(id, organization_id, product_key, feature_key, source contract|comp, source_ref, starts_at, ends_at, status, limits jsonb)`，索引 `(organization_id, product_key, feature_key) where status='active'`。
  - `organizations.kind text not null default 'customer' check (kind in ('internal','customer'))`；Account#0 這一列 update 成 `internal`（id 寫在 migration 註解，從 `organizations` 查 slug）。
  - 0062：加 `plan_key`、`source_ref`；CHECK 放寬成登記表全部 key（由測試比對）；唯一索引改 `(organization_id, product_key, plan_key) where status <> 'canceled'`。
  - 三表 RLS：`service_role` 全權；`anon`／`authenticated` 無任何 policy：migration 明確 `drop policy if exists org_product_subs_select on organization_product_subscriptions`（0062:139-143 現在給 authenticated 讀），驗收查 `select policyname, roles from pg_policies where tablename in ('plans','organization_entitlements','organization_product_subscriptions')` → 只有 service_role 列（Codex M5）。
  - 試用：改 `portal_complete_signup`（0063）寫 `current_period_end = now() + interval '14 days'`、`plan_key = '<product>_trial'`，並展開 trial 權利列；唯一索引 `(organization_id, product_key) where status = 'trial'`（Codex M4）。
  - **down.sql 守衛**：三表任一非空即 `raise exception 'tables not empty: forward-fix only'`；套 prod 後寫入開始（順序 4）就不再有 rollback，只能前進修（Codex C2）。
- `lib/entitlements/`：`tables.ts`（唯一碰三表的 Supabase client 包裝）、`permit.ts`（JCS 正規化＋Ed25519＋base64url，header `X-AwareWave-Permit`；共用測試向量 `lobster-factory/packages/contracts/fixtures/permit-v1/`，Python 端同向量，ADR 017 §3；簽發條件二擇一：contract 功能需 active 權利列，credits 功能需餘額 ≥ 最低扣點（`entitlement_id` 空、`source: credits`，Codex R2-1）；簽發：`tenant`、`product_key`、`feature_key`、`entitlement_id`、`source_ref`、limits、`max_spend`、`actor`、`on_behalf_of`、`issued_at`、`expires_at`（≤ 10 分鐘）、`kid`、Ed25519 簽章）、`can.ts`（第 3 步接呼叫端，本步先有型別與驗章）。
- 金鑰：`ENTITLEMENT_SIGNING_KEY`（私鑰，vault → `mcp/user-env.ps1` → 容器 env）與 `ENTITLEMENT_PUBLIC_KEYS`（`kid:公鑰` 清單，可多把，換鑰時新舊並存一個 `expires_at` 窗）。產生：`scripts/secrets-vault.ps1 -Action set -Name ENTITLEMENT_SIGNING_KEY`；離線備份一份（vault 匯出到不在主機上的位置），WORKLOG 記「已備份」不記值。許可帶 `format_version: 1`，驗章端拒絕未知版本。
- 到期：`ends_at = current_period_end + 7 天寬限`（預設，操作者可改）；過期由 Trigger.dev 排程任務 `entitlements-expire`（`lobster-factory/packages/workflows/`，與 `schedules-heartbeat` 同模式）每日 POST `app/api/internal/entitlements/expire/route.ts`（Bearer `SCHEDULE_INGEST_TOKEN`），一次掃全部帳戶把 status 改 `expired`，不刪列；`client_schedules` 是每客戶一列，不用它（Codex M7）。
- 付費入口唯一閘：`lib/entitlements/__tests__/import-boundary.test.ts` 用三張各自的允許清單（Codex M6），掃 `app/**`、`lib/**` 的 `import`／`require` 字串：命中 `@anthropic-ai/sdk`、`openai`、`replicate`、`@fal-ai`、`@google/genai`、`media_credit_ledger`、`organization_entitlements`、`plans`、`organization_product_subscriptions` 的檔案只准是 `lib/entitlements/**`、`lib/ai/gateway.ts`、`app/portal/**`；命中 WordPress／Woo／Fluent 符號（`wp-bridge`、`woocommerce`、`fluentcrm`）的檔案只准是 `lib/payments/woo.ts`、`lib/auth/sources/awarewave-wp.ts`、`lib/crm/fluentcrm.ts`（離開 WordPress 測試，ADR 017 §0b 第 6 條）；其餘紅燈。現有 `lib/ai/claude-request.ts` 改名為 `lib/ai/gateway.ts`，其餘呼叫端改 import 它（第 3 步才接 `can()`，本步只收斂入口）。

## Files
- `lobster-factory/packages/db/migrations/<次號>_plans_entitlements.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/{tables,permit,can}.ts`、`__tests__/{permit,import-boundary}.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts`（由 `claude-request.ts` 改名）
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`（對照用）＋主機 compose 走 `safe-infra-patch.sh`（env 兩個變數）

## Acceptance
```bash
cd D:/Work && node scripts/apply-db-migration.mjs --check <次號>
```
→ 解析到 `<次號>_plans_entitlements.sql` 與 `.down.sql`，無錯（`--check` 只解析檔案，不連線）。本機拋棄式 Postgres 套用（不碰 prod 容器）：
```bash
docker run -d --name pg-ent -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:16 && sleep 5 && for f in 0001 0062 0077 <次號>; do docker exec -i pg-ent psql -U postgres -f - < D:/Work/lobster-factory/packages/db/migrations/${f}_*.sql; done
```
→ 無 ERROR；`docker exec pg-ent psql -U postgres -c "\d public.organization_entitlements"` 看到索引；`.down.sql` 套上再套回無錯；最後 `docker rm -f pg-ent`。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/entitlements lib/portal
```
→ 綠；`permit.test.ts` 跑共用向量：合法 → ok；改一個 byte → 拒；`expires_at` 過 → 拒；未知 `kid` → 拒；假私鑰簽的 → 拒。`cd D:/Work/Projects/internal/cognitive-engineering-os && python -m pytest tests/unit/test_permit_vectors.py` 同一組向量綠。
突變：在 `lib/social/store.ts` 加一行 `import Replicate from "replicate"` → `import-boundary.test.ts` 紅；移除綠。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit -p .
```
→ exit 0。
套 prod：`node scripts/apply-db-migration.mjs <次號>`（High，操作者 go）→ `APPLY_OK`；`node scripts/apply-db-migration.mjs --status` 的 applied 數 +1；`docker exec lobster-next-admin printenv ENTITLEMENT_SIGNING_KEY | wc -c` > 1。

## Rollback
prod 套 `<次號>_plans_entitlements.down.sql`（`docker exec -i supabase-db psql ... < down.sql`，0 筆資料，無損；apply 腳本沒有 down 旗標）；`git revert`；env 兩個變數留著無害。
