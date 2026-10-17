# 第 4 項：付款 → 合約 → 權利；錢包帳本泛化；營運看得到

**風險** High（金流）　**模型** Opus 5.5　**前置** 第 3 項；待決 1（定期扣款外掛）；待決 3（點數條款與預收）；ADR 015 順序 1（WordPress 一次性碼進入產品門，否則付了錢的人進不來）　**正本** ADR 017 §2、§3、順序 4；ADR 015 §3、§4

## Decision
- wp-bridge 外掛（`lobster-factory/packages/wp-bridge-plugin/`）在 Woo 訂單完成、訂閱續約、訂閱取消、點數包購買四個事件，POST 簽章 webhook 到 next-admin `app/api/webhooks/woo/route.ts`，照既有 `app/api/webhooks/video-billing/` 的驗證寫法（Bearer token＋HMAC）。
- 控制面處理：用 `plans.woo_product_ids` 查方案 → 0062 upsert（冪等鍵＝Woo 訂閱編號＋事件 id）→ 重算該計費帳戶該產品的 `organization_entitlements`（舊列 `ends_at` 設為現在、新列 active）。點數包 → 帳本 `grant` 一筆（冪等鍵＝Woo 訂單編號）。
- 帳本泛化：`media_billing_accounts`／`media_credit_ledger` → `billing_accounts`／`credit_ledger`，加 `product_key`；migration `0105_credit_ledger_generalize.sql` 用 view 雙名過渡一版（ADR 012 §8 第 4 步「最後、expand-contract」）。
- 試用結束：trial 到 `current_period_end` 無付款 → 權利列 `expired`；資料保留 90 天後由同一個每日 job 標記 `erasure_due`，實際刪除走既有擦除流程（不在本步）。
- 營運看得到：`app/(shell)/ops/billing/page.tsx` 唯讀表：每個計費帳戶的合約、權利、餘額、最近 20 筆帳本；資料只經 `lib/entitlements/tables.ts`。

## Files
- `lobster-factory/packages/wp-bridge-plugin/`（事件 hook＋簽章）→ 版本號 `AWBRIDGE_VERSION`＋`bash scripts/release-wp-bridge.sh`（兩個 repo）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/woo/route.ts`、`route.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/{contracts,recompute,ledger}.ts`
- `lobster-factory/packages/db/migrations/0105_credit_ledger_generalize.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx`

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run app/api/webhooks/woo lib/entitlements
```
→ 綠；測試名含 `one paid event yields one contract row and one entitlement set`、`replaying the same event changes nothing`、`a cancel event ends the entitlements at period end plus grace`、`a credit pack grants once per order id`。
本機 staging（`npm run dev`）：
```bash
curl -s -X POST http://localhost:3000/api/webhooks/woo -H "Authorization: Bearer $WOO_WEBHOOK_TOKEN" -H "X-Signature: <hmac>" -d @fixtures/woo-subscription-active.json
```
→ `{"ok":true,"contract":"<uuid>","entitlements":N}`；同一請求再打一次 → `{"ok":true,"replayed":true}`；`/ops/billing` 顯示該帳戶。
真實：Woo 測試模式下單一筆（金流沙盒）→ prod `/ops/billing` 出現合約；`select count(*) from organization_entitlements where status='active'` ≥ 1。
突變：拔掉冪等鍵檢查 → `replaying…` 測試紅；還原綠。

## Rollback
webhook route 下架（回 410）；套 `0105_credit_ledger_generalize.down.sql`（view 過渡期內無資料損失）；Woo 側停用外掛事件；`git revert`。
