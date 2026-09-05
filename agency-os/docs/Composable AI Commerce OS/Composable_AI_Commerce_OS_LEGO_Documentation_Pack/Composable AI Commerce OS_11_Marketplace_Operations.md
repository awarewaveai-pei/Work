# Composable AI Commerce OS
## Marketplace Operations LEGO

> 文件角色：Marketplace listing、pricing、seller health、settlement 與 channel operations 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

集中管理 Amazon、Shopee、Etsy、eBay、Walmart、TikTok Shop 等 Marketplace 的 listings 與營運狀態。

# 2. Why This LEGO Exists

Marketplace 不只是訂單來源；listing quality、category/attribute mapping、fees、account health 都是獨立營運問題。

# 3. Boundary

## Owns

- Listing
- Offer
- ListingError
- CategoryMapping
- MarketplaceHealthSnapshot
- ChannelPricingRule

## Does Not Own

- Canonical product
- Inventory ledger
- Accounting ledger
- Raw marketplace API

# 4. Core Dependencies

- PIM
- Commerce Hub
- Pricing
- Inventory read
- Connector Runtime
- Analytics

# 5. Public Capabilities

- Listings
- Offers
- Channel mapping
- Pricing
- Promotions
- Seller health
- Settlement views
- Listing error handling

# 6. Primary Domain Objects

- MarketplaceListing
- Offer
- ListingIssue
- MarketplaceAccountHealth
- ChannelMap

# 7. Public Service Contract

```text
publishListing()
updateOffer()
syncListingStatus()
getListingIssues()
getSellerHealth()
reconcileMarketplace()
```

# 8. Events Published

```text
listing.published
listing.failed
listing.rejected
seller.health.changed
marketplace.settlement.available
```

# 9. Events Consumed

```text
pim.channel_ready
inventory.changed
pricing.changed
connector.failed
```

# 10. Permissions

```text
marketplace.read
listing.manage
listing.publish
pricing.manage
seller_health.read
```

# 11. AI Tool Surface

```text
diagnose_listing_error()
suggest_listing_fix()
suggest_channel_price()
summarize_seller_health()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Amazon SP-API
- Shopee
- Etsy
- eBay
- Walmart
- TikTok Shop
- Lazada
- Rakuten
- Mercado Libre

# 13. Primary Workflows

1. PIM channel-ready payload → Listing。
2. Connector publish → status / errors。
3. Inventory/Price change → update Offer。
4. Seller health warnings → Tasks / Alerts。

# 14. UX Surfaces

- Marketplace dashboard
- Listings grid
- Error queue
- Account health
- Channel pricing
- Settlement view

# 15. Data & Integration Rules

- 平台限制以 capability 表達
- Listing 與 Product 分離
- 發布需通過 PIM validation
- 平台 write 操作全部 audited

# 16. MVP

- Shopee + Amazon listing status
- Error queue
- Basic pricing
- Seller health

# 17. Explicit Non-Goals for MVP

- Full ad management
- Advanced repricer
- Inventory source of truth

# 18. Acceptance Criteria

- 同一 SKU 可映射多 marketplace listings
- listing error 可追到 PIM 欄位
- 平台 capability 缺失不造成核心例外

# 19. Expansion Roadmap

- V1 Shopee/Amazon
- V2 Etsy/eBay/Walmart
- V3 repricing/ads/settlement

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

可集中看到並修復多 Marketplace listing 狀態，而不把平台特有欄位污染 PIM canonical schema。
