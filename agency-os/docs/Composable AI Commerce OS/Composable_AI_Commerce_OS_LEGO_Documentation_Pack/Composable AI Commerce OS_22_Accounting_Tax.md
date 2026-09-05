# Composable AI Commerce OS
## Accounting & Tax LEGO

> 文件角色：會計總帳、AR/AP、報表與稅務整合模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

提供正式會計能力或作為 Xero/QuickBooks/台灣會計軟體的交換層。

# 2. Why This LEGO Exists

Finance 管管理視角；Accounting 管可稽核 ledger、報表與法定記帳。

# 3. Boundary

## Owns

- ChartOfAccounts
- JournalEntry
- JournalLine
- AccountingPeriod
- AR/AP records if native

## Does Not Own

- Order
- Payment provider raw records
- Tax authority connector

# 4. Core Dependencies

- Finance
- Payments
- Legal Entity
- Currency
- Audit

# 5. Public Capabilities

- COA
- Journal
- GL
- AR
- AP
- Trial Balance
- P&L
- Balance Sheet
- Cash Flow
- Multi-currency

# 6. Primary Domain Objects

- Account
- JournalEntry
- JournalLine
- Period
- ARInvoice
- APBill

# 7. Public Service Contract

```text
postJournal()
closePeriod()
getTrialBalance()
getPnL()
exportToAccountingProvider()
```

# 8. Events Published

```text
journal.posted
period.closed
invoice.issued
bill.recorded
```

# 9. Events Consumed

```text
payout.reconciled
expense.recorded
refund.completed
tax.invoice.issued
```

# 10. Permissions

```text
accounting.read
journal.post
period.close
accounting.export
```

# 11. AI Tool Surface

```text
explain_journal()
find_reconciliation_issue()
summarize_financial_statement()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Xero
- QuickBooks
- NetSuite
- SAP
- Taiwan accounting software
- e-Invoice

# 13. Primary Workflows

1. Business events → accounting mapping。
2. Journal drafts → validation/post。
3. Period close。
4. External accounting export/import。

# 14. UX Surfaces

- Chart of accounts
- Journal
- Reconciliation
- Financial statements
- Period close

# 15. Data & Integration Rules

- Posted journal immutable；透過 reversal 修正
- Legal entity scope
- Currency rate source versioned

# 16. MVP

- Accounting connector first
- Journal export
- Basic native ledger later

# 17. Explicit Non-Goals for MVP

- 替代所有國家 CPA workflow on day one

# 18. Acceptance Criteria

- Finance settlement 可轉 accounting entries
- Posted entries 有 audit
- Period close 可阻止任意修改

# 19. Expansion Roadmap

- V1 connectors
- V2 native GL
- V3 consolidation

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

Business OS 與正式會計之間有清楚、可稽核的橋接，不讓 Finance projection 假裝成 ledger。
