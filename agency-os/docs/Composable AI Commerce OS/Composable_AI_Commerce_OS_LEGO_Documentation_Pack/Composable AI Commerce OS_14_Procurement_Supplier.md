# Composable AI Commerce OS
## Procurement & Supplier LEGO

> 文件角色：供應商、採購單、補貨、成本與供應商協作模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把需求預測轉成採購計畫，管理 PO、交期、收貨與供應商表現。

# 2. Why This LEGO Exists

Inventory 只知道缺貨；Procurement 要決定跟誰買、多少、何時到。

# 3. Boundary

## Owns

- Supplier
- SupplierProduct
- PurchaseRequest
- PurchaseOrder
- PurchaseOrderLine
- SupplierPerformance

## Does Not Own

- Inventory balance
- Accounting AP ledger
- Product content

# 4. Core Dependencies

- Product/SKU
- Inventory
- Finance read
- Tasks/Approval

# 5. Public Capabilities

- Supplier master
- PO
- MOQ
- Lead time
- Receiving coordination
- Supplier performance

# 6. Primary Domain Objects

- Supplier
- PurchaseOrder
- PurchaseRequest
- SupplierQuote

# 7. Public Service Contract

```text
createPurchaseRequest()
approvePurchaseRequest()
createPurchaseOrder()
confirmPO()
recordETA()
receivePO()
```

# 8. Events Published

```text
purchase_request.created
purchase_order.created
purchase_order.confirmed
purchase_order.received
supplier.eta.changed
```

# 9. Events Consumed

```text
inventory.low
forecast.reorder_suggested
quality.issue.created
```

# 10. Permissions

```text
procurement.read
procurement.request
procurement.approve
purchase_order.manage
supplier.manage
```

# 11. AI Tool Surface

```text
suggest_reorder()
compare_suppliers()
draft_purchase_order()
detect_supplier_risk()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Supplier email/API/SFTP
- ERP
- Accounting
- WMS

# 13. Primary Workflows

1. Inventory/Demand → Purchase Request。
2. Approval → PO。
3. Supplier confirm / ETA。
4. Warehouse receive。
5. AP / cost handoff to Finance。

# 14. UX Surfaces

- Supplier directory
- Reorder suggestions
- PO board
- ETA exceptions
- Supplier scorecard

# 15. Data & Integration Rules

- PO approval threshold 走 Policy engine
- Cost 版本化
- 收貨改 Inventory，不直接改 balance

# 16. MVP

- Supplier
- PO
- Approval
- Receiving handoff

# 17. Explicit Non-Goals for MVP

- Manufacturing MRP
- Complex contract procurement

# 18. Acceptance Criteria

- PO 可從 request 到 receiving 追蹤
- PO approval audited
- Supplier lead time 可分析

# 19. Expansion Roadmap

- V1 PO
- V2 supplier portal
- V3 automated replenishment

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

能把補貨需求轉成有審核、有 ETA、有收貨結果的 PO workflow。
