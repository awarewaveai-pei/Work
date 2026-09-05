# Composable AI Commerce OS
## Logistics & Fulfillment LEGO

> 文件角色：運費、shipment、carrier、tracking、3PL 與超商物流整合模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

統一建立 shipment、標籤、追蹤與 carrier 狀態，支援台灣超商與國際物流。

# 2. Why This LEGO Exists

物流 provider 很多且各國差異大，必須用標準 shipment contract 隔離。

# 3. Boundary

## Owns

- Shipment
- Package
- TrackingEvent
- CarrierServiceMapping
- PickupPointRef

## Does Not Own

- Order
- Inventory
- Carrier API implementation
- Accounting

# 4. Core Dependencies

- OMS
- Commerce
- Address
- Events
- Connector Runtime

# 5. Public Capabilities

- Rates
- Create shipment
- Label
- Tracking
- Cancel
- Pickup point
- 3PL handoff

# 6. Primary Domain Objects

- Shipment
- Package
- TrackingEvent
- CarrierService

# 7. Public Service Contract

```text
getRates()
createShipment()
getLabel()
cancelShipment()
trackShipment()
findPickupPoints()
```

# 8. Events Published

```text
shipment.created
shipment.label_created
shipment.in_transit
shipment.delivered
shipment.exception
```

# 9. Events Consumed

```text
fulfillment.planned
order.cancelled
return.approved
```

# 10. Permissions

```text
logistics.read
shipment.create
shipment.cancel
shipment.override
```

# 11. AI Tool Surface

```text
get_tracking()
explain_shipping_exception()
suggest_carrier()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Taiwan: 7-ELEVEN / FamilyMart / Hi-Life / 黑貓 / 新竹 / 順豐
- Global: DHL / UPS / FedEx / USPS
- 3PL providers

# 13. Primary Workflows

1. OMS plan → rate/select carrier。
2. Create shipment/label。
3. Tracking webhook/poll → normalized tracking。
4. Delivery exception → Task/Customer Service。

# 14. UX Surfaces

- Shipment list
- Tracking timeline
- Carrier health
- Pickup point selector
- Exception queue

# 15. Data & Integration Rules

- Tracking event normalized
- Carrier-specific service codes 不進 Core
- Label binary 放 object storage

# 16. MVP

- Create shipment
- Label
- Tracking
- Taiwan aggregator + DHL/UPS one global

# 17. Explicit Non-Goals for MVP

- Own transportation network
- Fleet management

# 18. Acceptance Criteria

- 同一 Shipment UI 可顯示至少兩 carriers
- tracking exceptions 可事件化
- carrier connector 可替換

# 19. Expansion Roadmap

- V1 Taiwan
- V2 international
- V3 3PL optimization

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

Carrier 被抽象成 Logistics Connector，Shipment lifecycle 不依賴特定物流商。
