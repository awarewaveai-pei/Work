# Composable AI Commerce OS
## OMS / Order Orchestration LEGO

> 文件角色：跨 Channel 訂單分配、拆單、履約路由與例外處理模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

在 Commerce Hub 之上決定訂單要從哪個庫存、倉庫、3PL 或商店履約。

# 2. Why This LEGO Exists

Unified Orders 只是看得到訂單；真正營運需要 allocation、split、routing、ATP/ATS、exception。

# 3. Boundary

## Owns

- OrderAllocation
- FulfillmentPlan
- OrderSplit
- RoutingRule
- OrderException

## Does Not Own

- External order raw data
- Inventory ledger
- Shipment carrier API
- Payment ledger

# 4. Core Dependencies

- Commerce Hub
- Inventory
- Logistics
- Events
- Policy

# 5. Public Capabilities

- Allocation
- Split/Merge
- Routing
- Backorder
- Preorder
- Partial fulfillment
- Exception management

# 6. Primary Domain Objects

- FulfillmentPlan
- Allocation
- OrderException
- RoutingRule

# 7. Public Service Contract

```text
planFulfillment(orderId)
allocate(orderId)
reroute(orderId)
splitOrder(orderId)
raiseException()
```

# 8. Events Published

```text
order.allocated
order.split
fulfillment.planned
order.exception.created
```

# 9. Events Consumed

```text
order.imported
inventory.changed
warehouse.disabled
shipment.failed
```

# 10. Permissions

```text
oms.read
oms.allocate
oms.override
oms.rules.manage
```

# 11. AI Tool Surface

```text
explain_allocation()
suggest_reroute()
summarize_order_exception()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Commerce connectors
- Inventory/WMS
- 3PL / logistics connectors

# 13. Primary Workflows

1. Order → validate payment / address。
2. Check availability。
3. Apply routing rules。
4. Create fulfillment plan。
5. Handle exceptions / reroute。

# 14. UX Surfaces

- Order orchestration board
- Exception queue
- Allocation trace
- Routing rules

# 15. Data & Integration Rules

- Inventory quantity 不由 OMS 擁有
- 每次 allocation 有可追蹤決策原因
- Override 必須 audited

# 16. MVP

- Single warehouse allocation
- Exception queue
- Manual reroute

# 17. Explicit Non-Goals for MVP

- Full WMS
- Carrier label generation

# 18. Acceptance Criteria

- Allocation 可重現
- Inventory 變動會觸發 re-evaluation
- Manual override 有 audit

# 19. Expansion Roadmap

- V1 single warehouse
- V2 multi-warehouse
- V3 store fulfillment / dropship

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

能對 normalized Order 產生可追蹤 fulfillment plan，且不直接控制庫存 ledger 或 carrier API。
