# Composable AI Commerce OS
## Commerce Hub LEGO

> 文件角色：跨商店、跨 Marketplace 的 Product/Order/Customer commerce abstraction。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把不同 commerce platform 的 customer/order/product 資料正規化成統一視圖，但不在此處處理平台 API 細節。

# 2. Why This LEGO Exists

Business OS 必須能拔掉 WooCommerce 換 Shopify，而 Customer 360 與 Order View 不需要重寫。

# 3. Boundary

## Owns

- CommerceStore mapping
- Normalized Order projection
- OrderItem projection
- CommerceCustomer mapping
- Commerce capability service

## Does Not Own

- Contact identity
- Marketplace listing ops
- Inventory ledger
- Payment accounting
- Woo/Shopify raw schemas

# 4. Core Dependencies

- Contact/Identity
- Product/SKU
- Connector Runtime
- Events

# 5. Public Capabilities

- Store connections
- Unified orders
- Unified customers
- Order detail
- Read-only products initially

# 6. Primary Domain Objects

- Store
- CommerceCustomerRef
- Order
- OrderItem
- OrderStatusMap

# 7. Public Service Contract

```text
findCustomer(contactId, storeId)
getOrders(contactId)
getOrder(orderId)
listStores()
normalizeOrder(providerOrder)
```

# 8. Events Published

```text
order.imported
order.updated
order.cancelled
order.refunded
```

# 9. Events Consumed

```text
identity.linked
connector.connected
product.mapped
```

# 10. Permissions

```text
commerce.read
commerce.order.read
commerce.customer.read
commerce.connector.manage
```

# 11. AI Tool Surface

```text
get_customer_orders()
get_order()
search_orders()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- WooCommerce
- Shopify
- SHOPLINE
- Shopee
- Amazon
- Etsy
- eBay
- Walmart

# 13. Primary Workflows

1. Connector fetch/webhook → normalize order。
2. External customer identity → Contact mapping。
3. Unified order → Customer 360 / Analytics。
4. 初期只讀；write operations 後續經 Policy。

# 14. UX Surfaces

- Unified Orders
- Store selector
- Order detail
- Customer order timeline

# 15. Data & Integration Rules

- Order != provider raw order
- External ids 存 mapping
- V1 read-only first
- Status mapping 必須可 version

# 16. MVP

- WooCommerce + Shopify
- Unified order read
- Customer mapping
- Order detail

# 17. Explicit Non-Goals for MVP

- Inventory sync
- OMS orchestration
- Marketplace listing management
- Refund write

# 18. Acceptance Criteria

- Woo + Shopify orders 顯示同一 UI
- 拔 Woo 不影響 Shopify
- 同一 Contact 可跨 store 查訂單

# 19. Expansion Roadmap

- V1 Woo/Shopify
- V1.x Shopee/SHOPLINE
- V2 global marketplaces
- V3 write operations

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

至少兩個 commerce providers 共用同一 Order/Customer service contract，且 Consumer module 不含 provider-specific conditional。
