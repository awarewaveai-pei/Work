# Composable AI Commerce OS
## Pricing & Promotions LEGO

> 文件角色：價格、Price Book、折扣、促銷與 Channel pricing 的獨立模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

將價格與促銷從 Commerce platform 中抽離，讓同一 SKU 能針對不同市場、客群、Channel、B2B account 使用不同規則。

# 2. Why This LEGO Exists

多市場後價格會同時受到幣別、Channel fee、margin、會員、B2B 與活動影響，不能散落在各 Connector。

# 3. Boundary

## Owns

- PriceBook
- PriceRule
- Promotion
- Coupon
- BundlePrice
- ChannelPrice
- CustomerPrice

## Does Not Own

- Canonical Product
- Marketplace API
- Accounting revenue
- Inventory

# 4. Core Dependencies

- Product/SKU
- Market
- Customer/Segment
- Finance margin read
- Events

# 5. Public Capabilities

- Price books
- Market prices
- Customer/B2B prices
- Channel prices
- Coupons
- Buy X Get Y
- Bundles
- Free shipping rules
- Margin floor

# 6. Primary Domain Objects

- PriceBook
- PriceEntry
- Promotion
- PromotionRule
- Coupon

# 7. Public Service Contract

```text
getPrice(context)
evaluatePromotion(cartContext)
createPromotion()
publishPriceBook()
validateMarginFloor()
```

# 8. Events Published

```text
price.changed
promotion.started
promotion.ended
coupon.redeemed
```

# 9. Events Consumed

```text
product.created
market.enabled
customer.segment.changed
cost.changed
```

# 10. Permissions

```text
pricing.read
pricing.manage
promotion.manage
promotion.approve
```

# 11. AI Tool Surface

```text
suggest_price()
analyze_promotion()
detect_margin_risk()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Shopify/Woo/Shopee/Amazon price sync
- POS
- B2B commerce

# 13. Primary Workflows

1. Product + market + channel + customer context → resolve price。
2. Promotion rules → eligible discount。
3. Margin floor / approval。
4. Publish via connector capability。

# 14. UX Surfaces

- Price book grid
- Promotion builder
- Coupon manager
- Margin warnings
- Channel comparison

# 15. Data & Integration Rules

- 價格決策可重現
- Money 使用 currency-aware type
- Marketplace price 寫入經 Connector

# 16. MVP

- Price book
- Coupon
- Basic promotions
- Channel price

# 17. Explicit Non-Goals for MVP

- High-frequency algorithmic repricing first
- Complex tax engine

# 18. Acceptance Criteria

- 同一 SKU 可有 TW/US/B2B 不同價格
- Promotion 不修改 base price
- 低於 margin floor 會被 policy 阻止

# 19. Expansion Roadmap

- V1 rules
- V2 personalized offers
- V3 marketplace repricing

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

價格與促銷可跨 Commerce provider 使用同一套 domain contract。
