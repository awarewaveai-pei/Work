# Composable AI Commerce OS
## Finance / Treasury LEGO

> 文件角色：營收、成本、費用、Payout、Cash Flow、Unit Economics 與資金視圖。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

從各 Channel 的 sales/payment/fees/ads/shipping 形成可營運決策的 finance view。

# 2. Why This LEGO Exists

Marketplace GMV 不等於獲利；管理層真正需要 contribution margin、payout reconciliation 與 cash visibility。

# 3. Boundary

## Owns

- FinancialMetricProjection
- Payout
- Settlement
- ExpenseRecord
- CostAllocation
- CashForecast

## Does Not Own

- General ledger
- Payment raw lifecycle
- Tax filing

# 4. Core Dependencies

- Commerce
- Payments
- Marketplace Ops
- Logistics
- Ads/Marketing
- Accounting connector

# 5. Public Capabilities

- Revenue
- COGS
- Fees
- Ad spend
- Shipping cost
- Payout
- Reconciliation
- Cash flow
- Unit economics

# 6. Primary Domain Objects

- Settlement
- Payout
- Expense
- CostAllocation
- ContributionMargin

# 7. Public Service Contract

```text
calculateOrderEconomics()
reconcilePayout()
recordExpense()
getCashPosition()
getProfitability()
```

# 8. Events Published

```text
finance.reconciliation.completed
finance.margin.changed
payout.reconciled
```

# 9. Events Consumed

```text
order.paid
refund.completed
marketplace.settlement.available
shipment.created
ad.spend.recorded
```

# 10. Permissions

```text
finance.read
finance.expense.manage
finance.reconcile
finance.export
```

# 11. AI Tool Surface

```text
explain_margin_change()
summarize_cash_flow()
find_unreconciled_payouts()
analyze_unit_economics()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Marketplace settlements
- Stripe/PayPal/ECPay payouts
- Banks/CSV
- Accounting systems

# 13. Primary Workflows

1. Order revenue + COGS + fees + shipping + ads。
2. Compute contribution margin。
3. Provider settlement → expected vs actual payout。
4. Bank deposit → reconciliation。

# 14. UX Surfaces

- P&L-lite dashboard
- Payout reconciliation
- Order economics
- Cash flow
- Expense

# 15. Data & Integration Rules

- Finance metric 與 Accounting ledger 分離
- 所有成本來源可追溯
- 跨幣別需保存原幣與 base currency

# 16. MVP

- Order economics
- Payout reconciliation
- Expenses
- Cash flow

# 17. Explicit Non-Goals for MVP

- Full GAAP ledger
- Tax filing

# 18. Acceptance Criteria

- 每筆 order 可算 contribution margin
- Payout 可 reconcile
- refund 會修正 economics

# 19. Expansion Roadmap

- V1 unit economics
- V2 treasury
- V3 forecasting

# 20. LEGO Test

這個模組完成前必須通過：

1. **Remove Test** — 停用本模組後，Core 與其他模組仍可啟動。
2. **Replace Test** — 外部 Provider 可替換，不需修改本模組 Domain。
3. **Boundary Test** — 不可直接讀寫其他模組擁有的資料表。
4. **Event Test** — 跨模組 side effects 透過 public service 或 event 發生。
5. **Tenant Test** — 所有資料都必須 organization scoped。
6. **Audit Test** — 敏感 write action 都可追蹤。
7. **Contract Test** — 對外 contract 有自動化測試。

# 21. Definition of Done

管理者可從 sale 看見真正淨貢獻，而不只 GMV。
