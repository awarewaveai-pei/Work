# Composable AI Commerce OS
## B2B / Wholesale LEGO

> 文件角色：公司客戶、採購人、價目、MOQ、報價、付款條件與 Credit 的 B2B 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓同一 Business OS 同時支援 D2C 與 B2B，而不把公司採購行為硬塞進一般 Contact。

# 2. Why This LEGO Exists

B2B 需要 Company、Location、Buyer role、Catalog、Payment terms，和一般 consumer checkout 不同。

# 3. Boundary

## Owns

- B2BAccount
- CompanyLocation
- BuyerRole
- Catalog
- Quote
- CreditTerm
- MOQRule

## Does Not Own

- Core Company identity
- Accounting ledger
- Inventory

# 4. Core Dependencies

- Company/Contact
- Pricing
- Commerce
- Approval
- Finance

# 5. Public Capabilities

- Company buyers
- Negotiated pricing
- Catalog
- MOQ
- Quote/RFQ
- PO number
- Net terms
- Credit limit

# 6. Primary Domain Objects

- B2BAccount
- Catalog
- Quote
- BuyerAssignment
- PaymentTerm

# 7. Public Service Contract

```text
createB2BAccount()
assignBuyer()
getCatalog()
createQuote()
approveQuote()
checkCredit()
```

# 8. Events Published

```text
b2b.account.created
quote.created
quote.accepted
credit.limit_changed
```

# 9. Events Consumed

```text
company.created
order.paid
payment.overdue
```

# 10. Permissions

```text
b2b.read
b2b.account.manage
quote.manage
credit.manage
```

# 11. AI Tool Surface

```text
draft_quote()
summarize_account()
suggest_b2b_price()
assess_account_risk()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Shopify B2B
- ERP
- Accounting
- B2B marketplace

# 13. Primary Workflows

1. Company onboarding → buyers / roles。
2. Catalog & negotiated price。
3. Quote → approval → order。
4. Net terms → AR / collection。

# 14. UX Surfaces

- B2B account
- Buyer admin
- Catalog
- Quote workspace
- Credit dashboard

# 15. Data & Integration Rules

- Company != Contact
- Credit write 高風險
- Price book 與 consumer price 分離

# 16. MVP

- Company account
- Catalog
- Quote
- Payment terms

# 17. Explicit Non-Goals for MVP

- Full EDI network
- Complex CPQ

# 18. Acceptance Criteria

- Company 有多 buyer
- Buyer 權限可不同
- Quote 可轉 Order

# 19. Expansion Roadmap

- V1 wholesale
- V2 credit/AR
- V3 EDI

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

可以在不破壞 D2C 模型的前提下處理一個公司、多採購人與 negotiated pricing。
