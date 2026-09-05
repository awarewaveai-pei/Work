# Composable AI Commerce OS
## Inventory & WMS LEGO

> 文件角色：庫存帳、倉庫、保留量、批號與倉內作業模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

建立跨銷售 Channel 的 inventory source of truth，並逐步擴展到 warehouse execution。

# 2. Why This LEGO Exists

庫存同步是高風險 capability，必須晚於 Unified Orders；錯一筆就會 oversell。

# 3. Boundary

## Owns

- InventoryBalance
- StockMovement
- Reservation
- Warehouse
- Bin（WMS）
- Lot/Serial（後期）

## Does Not Own

- Product content
- Marketplace listing
- Order identity
- Carrier shipment

# 4. Core Dependencies

- Product/SKU
- Commerce
- OMS
- Events
- Audit

# 5. Public Capabilities

- Available/Reserved/Allocated/Incoming
- Stock movement
- Transfers
- Multi-warehouse
- Cycle count
- WMS later

# 6. Primary Domain Objects

- Warehouse
- InventoryBalance
- StockMovement
- Reservation
- Transfer
- Bin

# 7. Public Service Contract

```text
getAvailability(sku, location)
reserve()
releaseReservation()
adjustStock()
transfer()
receiveStock()
```

# 8. Events Published

```text
inventory.changed
inventory.low
inventory.reserved
inventory.released
stock.received
```

# 9. Events Consumed

```text
order.allocated
order.cancelled
return.received
purchase_order.received
```

# 10. Permissions

```text
inventory.read
inventory.adjust
inventory.transfer
warehouse.manage
inventory.audit
```

# 11. AI Tool Surface

```text
get_inventory()
explain_stock_change()
detect_stockout_risk()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Shopify/Woo/Shopee stock push
- WMS/3PL
- Barcode devices

# 13. Primary Workflows

1. Receive / adjustment → StockMovement。
2. Order allocation → Reservation。
3. Fulfillment → decrement。
4. Cancel → release。
5. Return inspection → restock or quarantine。

# 14. UX Surfaces

- Inventory grid
- Warehouse view
- Movement ledger
- Reservations
- Transfer
- Count

# 15. Data & Integration Rules

- 所有數量變動必須來自 immutable movement
- 禁止直接 UPDATE balance
- Reservation 與 Available 分離

# 16. MVP

- Inventory ledger
- Reservation
- Single/multi warehouse
- Manual adjustment

# 17. Explicit Non-Goals for MVP

- Full WMS wave picking in first release
- Advanced robotics

# 18. Acceptance Criteria

- 任何 balance 可由 movements 重建
- Cancel 正確釋放 reservation
- 跨 store 不 oversell

# 19. Expansion Roadmap

- V1 inventory
- V2 multiwarehouse
- V3 WMS

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

庫存數量具備可稽核 movement ledger、reservation 與一致性測試。
