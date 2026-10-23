# 第 4 項：付款 → 合約 → 權利；錢包帳本泛化；營運看得到

**風險** High（金流）　**模型** Opus 5.5　**前置** 第 3 項；4b 另加：待決 1（定期扣款外掛）；待決 3（點數條款與預收）；ADR 015 順序 1（WordPress 一次性碼進入產品門，否則付了錢的人進不來）　**正本** ADR 017 §2、§3、順序 4；ADR 015 §3、§4

## Decision
- **分兩段**（2026-10-23 先後決策，WORKLOG 續36；監工台 NEXT ④）：**4a** 接頭＋收件表＋合約／權利寫入＋錢包 `grant` 入帳＋`/ops/billing`，付款來源只有 `local`（人工：轉帳後操作者登記）＝不碰 Woo、不等待決，第一個自助客戶靠它收錢；**4b** Woo 原生 webhook 六事件、定期扣款、點數條款（待決 1、3）＋ ADR 015 順序 1 一次性碼登入，同一包做。下列設計兩段共用。
- 付款走接頭 `lib/payments/provider.ts`：介面 `{ verify(req), parse(req) → PaymentEvent }`，實作 `woo.ts`（驗 WooCommerce 原生 webhook 簽章 `X-WC-Webhook-Signature` = base64(HMAC-SHA256(body, secret))，secret 即 Woo 後台設定的 webhook secret，存 `WOO_WEBHOOK_SECRET`；不是 Bearer＋HMAC，也不是 `video-billing/` 的 Stripe 驗法，Codex M10）與 `local.ts`（測試與離開 WordPress 用）；設定值 `PAYMENTS_PROVIDER=woo|local`。控制面只認 `PaymentEvent`，不認 Woo 欄位（ADR 017 §0b 第 5、6 條）。
- **收件表** `payment_events(provider, event_id, received_at, processed_at, payload)`，`unique (provider, event_id)`；route 先 insert（衝突＝重送，直接回 `replayed`），再在同一交易處理合約、權利、帳本（Codex M8）。
- 事件六種（Woo 原生 webhook，不經 wp-bridge）：訂單完成、訂閱續約、訂閱取消、點數包購買、**退款**、**拒付**。退款訂閱＝取消；退款點數包＝帳本 `refund` 分錄只退未用部分（0066 `entry_type` 已有 refund）；拒付＝合約權利列改 `suspended`、錢包凍結，人工複核後解（Codex M9）。目標 `app/api/webhooks/woo-billing/route.ts`（新；既有 `app/api/webhooks/woo-order/` 是 Printful 草稿出貨，不混用，Codex R2-9）。
- 控制面處理：用 `plans.woo_product_ids` 查方案 → 0062 upsert（冪等鍵＝Woo 訂閱編號＋事件 id）→ 重算權利列，狀態機固定（ADR 017 §3，Codex R2-2）：換方案＝舊列 `ends_at = now()`、新列 active；取消＝現有列 `ends_at = current_period_end + 寬限`，不新增列；退款＝`ends_at = now()`；拒付＝`suspended`。點數包 → 帳本 `grant` 一筆（冪等鍵＝Woo 訂單編號）。
- 同一帳戶×產品×功能同時只准一筆有效列（客戶列；internal 列由 0117 索引管）：`findActiveEntitlement` 多筆時取最舊（`tables.ts:31`），舊的寬鬆 comp 會蓋過新的 contract（Codex 2026-10-23 `partialreview-98025e41`，既有行為，段 1 後點數功能也適用）。本步寫入方在同一交易結束舊列，並加測試；贈送與合約重疊時誰優先，開工前先定。
- 帳本泛化：`media_billing_accounts`／`media_credit_ledger` → `billing_accounts`／`credit_ledger`，加 `product_key`；migration `0105_credit_ledger_generalize.sql` 用 view 雙名過渡一版（ADR 012 §8 第 4 步「最後、expand-contract」）。
- 試用結束：trial 到 `current_period_end` 無付款 → 權利列 `expired`；資料保留 90 天後由同一個每日 job 標記 `erasure_due`，實際刪除走既有擦除流程（不在本步）。
- 營運看得到：`app/(shell)/ops/billing/page.tsx` 唯讀表：每個計費帳戶的合約、權利、餘額、最近 20 筆帳本；資料只經 `lib/entitlements/tables.ts`。

## 4a 狀態（2026-10-23，WORKLOG 續48 設計與驗證、續51 上線）
- **已上線**（操作者 go）：0120 已套 prod；程式 `f2139d35a`（2026-10-24 03:00 自動部署進容器）；next-admin 已有 `PAYMENTS_PROVIDERS=local`、`PAYMENTS_LOCAL_SECRET`（同值在 `mcp/user-env.ps1`／vault）。
- 登記轉帳：`scripts/secrets-vault.ps1 -Action run -Names @('PAYMENTS_LOCAL_SECRET') -Command 'node lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/record-payment.mjs credit_pack --org <uuid> --units <點數> --ref <轉帳編號>'`（`RUNNABLE_DEMOS.md`）。
- 訂閱付款前要先有方案列（plans 0 筆，操作者定）。
- 與上列設計不同處：狀態機整個在 Postgres 函式 `billing_apply_payment_event`（收件、合約、權利、帳本同一交易）；路由 `app/api/webhooks/payments/[provider]`（4b 的 woo 走同一路由，不另開 `woo-billing`）；設定 `PAYMENTS_PROVIDERS` 是清單（轉帳與 Woo 會同時存在）；錢包凍結＝新表 `credit_wallet_holds`（不動 `media_billing_accounts.status`，video Stripe webhook 會覆寫它）；贈送與合約重疊＝付費合約結束舊贈送列；全功能帳戶（0118）不能買訂閱、能買點數。
- 帳本泛化**不在 4a**：4a 只寫 `grant`／`refund`，現有 `media_credit_ledger` 夠用；留 4b。卡上的 `0105_credit_ledger_generalize.sql` 編號已被 `0105_social_v16` 用掉，4b 另取號。

## Files
- `lobster-factory/packages/wp-bridge-plugin/`（事件 hook＋簽章）→ 版本號 `AWBRIDGE_VERSION`＋`bash scripts/release-wp-bridge.sh`（兩個 repo）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/woo-billing/route.ts`、`route.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/{contracts,recompute,ledger}.ts`
- `lobster-factory/packages/db/migrations/0105_credit_ledger_generalize.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx`

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run app/api/webhooks/woo-billing lib/entitlements
```
→ 綠；測試名含 `one paid event yields one contract row and one entitlement set`、`replaying the same event id is a no-op via the inbox`、`a cancel event keeps access until period end plus grace and a plan change ends the old row now`、`a credit pack grants once per order id`、`a refund of a credit pack reverses only the unused part`、`a chargeback suspends entitlements and freezes the wallet`、`an invalid X-WC-Webhook-Signature is refused with 401`。
本機 staging（`npm run dev`）：
```bash
curl -s -X POST http://localhost:3000/api/webhooks/woo-billing -H "X-WC-Webhook-Signature: <base64 hmac-sha256 of body>" -d @fixtures/woo-subscription-active.json
```
→ `{"ok":true,"contract":"<uuid>","entitlements":N}`；同一請求再打一次 → `{"ok":true,"replayed":true}`；`/ops/billing` 顯示該帳戶。
真實：Woo 測試模式下單一筆（金流沙盒）→ prod `/ops/billing` 出現合約；`select count(*) from organization_entitlements where status='active'` ≥ 1。
突變：拔掉冪等鍵檢查 → `replaying…` 測試紅；還原綠。
離開 WordPress 測試：`PAYMENTS_PROVIDER=local LOGIN_SOURCES=local CRM_SINK=none npx vitest run` 全綠；在 `lib/entitlements/contracts.ts` 加一行 `import "@/lib/wp-bridge"` → import-boundary 測試紅；移除綠。

## Rollback
webhook route 下架（回 410）；`0105` 的 down 只在 view 過渡期內可套，帳本有新列即前進修（Codex C2）；Woo 側停用 webhook；`git revert`。
