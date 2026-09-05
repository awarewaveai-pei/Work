# Composable AI Commerce OS
## Returns / Warranty / After-Sales LEGO

> 文件角色：退貨、換貨、RMA、保固、維修與售後問題模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把退貨與售後從單純 refund 拆成可追蹤流程，連接客服、物流、庫存與財務。

# 2. Why This LEGO Exists

跨境電商的 return、inspection、refund、exchange、warranty 是完整生命週期。

# 3. Boundary

## Owns

- ReturnRequest
- RMA
- Inspection
- WarrantyClaim
- RepairCase
- Disposition

## Does Not Own

- Payment refund execution
- Inventory ledger
- Shipment carrier

# 4. Core Dependencies

- Commerce
- Customer Service
- Logistics
- Inventory
- Payments
- Policy

# 5. Public Capabilities

- Return request
- Approval
- Return label
- Inspection
- Refund/Exchange handoff
- Warranty
- Repair

# 6. Primary Domain Objects

- ReturnRequest
- RMA
- Inspection
- WarrantyClaim
- RepairCase

# 7. Public Service Contract

```text
requestReturn()
approveReturn()
receiveReturn()
inspectReturn()
approveRefund()
createWarrantyClaim()
```

# 8. Events Published

```text
return.requested
return.approved
return.received
return.inspected
warranty.claimed
```

# 9. Events Consumed

```text
order.delivered
message.received
shipment.delivered
```

# 10. Permissions

```text
returns.read
returns.approve
returns.inspect
warranty.manage
```

# 11. AI Tool Surface

```text
classify_return_reason()
suggest_disposition()
summarize_warranty_case()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Logistics
- Payments
- Marketplace return APIs

# 13. Primary Workflows

1. Customer request → eligibility。
2. Approval → return shipment。
3. Receive / inspect。
4. Restock / quarantine / dispose。
5. Refund / exchange → Finance / Inventory。

# 14. UX Surfaces

- Returns queue
- RMA detail
- Inspection form
- Warranty/repair timeline

# 15. Data & Integration Rules

- Refund 與 inventory action 分開
- 高額 refund 走 approval
- 每次 disposition audited

# 16. MVP

- Return request
- Approval
- Inspection
- Refund handoff

# 17. Explicit Non-Goals for MVP

- Repair parts ERP
- Service center routing

# 18. Acceptance Criteria

- Return lifecycle 可完整追蹤
- Refund 不會在未核准前執行
- Inspection 結果正確更新 inventory disposition

# 19. Expansion Roadmap

- V1 returns
- V2 warranty
- V3 repair network

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

任何退貨都可從 customer request 追到 disposition / refund / restock。
