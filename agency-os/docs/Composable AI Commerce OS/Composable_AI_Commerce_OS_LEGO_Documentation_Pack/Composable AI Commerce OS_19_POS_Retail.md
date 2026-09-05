# Composable AI Commerce OS
## POS / Retail LEGO

> 文件角色：門市、展場、快閃與 O2O 零售模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓線上 Customer、Loyalty、Inventory、Order 與實體門市共用同一 Business OS。

# 2. Why This LEGO Exists

真正 omnichannel commerce 需要 online/offline customer 與 stock consistency。

# 3. Boundary

## Owns

- Register
- RetailShift
- POSCart
- CashDrawerSession
- StoreSale metadata

## Does Not Own

- Canonical Contact
- Inventory ledger
- Payment processor implementation

# 4. Core Dependencies

- Commerce
- Inventory
- Payments
- Loyalty
- Identity

# 5. Public Capabilities

- POS checkout
- Barcode
- Receipt
- In-store return
- Click&Collect
- Ship-from-store
- Customer lookup

# 6. Primary Domain Objects

- Register
- Shift
- POSSession
- Receipt

# 7. Public Service Contract

```text
openShift()
createPOSCart()
checkout()
returnInStore()
closeShift()
```

# 8. Events Published

```text
pos.shift.opened
pos.sale.completed
pos.return.completed
pos.shift.closed
```

# 9. Events Consumed

```text
inventory.changed
loyalty.updated
customer.merged
```

# 10. Permissions

```text
pos.sell
pos.return
pos.discount.override
pos.shift.manage
```

# 11. AI Tool Surface

```text
lookup_customer()
suggest_product()
explain_return_policy()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Payment terminals
- Receipt printer
- Barcode hardware
- Shopify POS connector optional

# 13. Primary Workflows

1. Customer lookup。
2. Scan products。
3. Price / loyalty / discount。
4. Payment。
5. Inventory movement / receipt。

# 14. UX Surfaces

- Fast checkout
- Customer lookup
- Shift
- Returns
- Store inventory

# 15. Data & Integration Rules

- Offline resilience 後期
- POS sale 仍是 Commerce Order
- Discount override audited

# 16. MVP

- Basic POS checkout
- Customer lookup
- Receipt
- Inventory decrement

# 17. Explicit Non-Goals for MVP

- Full restaurant POS
- Fleet offline sync first

# 18. Acceptance Criteria

- POS order 出現在 Unified Orders
- 同一 Contact 共用 loyalty
- Store inventory 正確扣減

# 19. Expansion Roadmap

- V1 retail basics
- V2 click&collect
- V3 offline

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

門市交易成為同一 Customer / Order / Inventory ecosystem 的一部分。
