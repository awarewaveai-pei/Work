# Composable AI Commerce OS
## PIM / PXM LEGO

> 文件角色：商品資訊、屬性、分類、Localization 與 Channel-specific product experience 模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

建立唯一商品資訊中樞，讓同一 SKU 可向 Amazon、Shopee、Etsy、Shopify 等平台輸出符合各平台與各市場要求的 listing data。

# 2. Why This LEGO Exists

多 Marketplace 後，Product identity 與 Listing data 必須分離；否則每個平台都會變成一套商品資料。

# 3. Boundary

## Owns

- ProductFamily
- Attribute
- AttributeSet
- Taxonomy
- LocalizedContent
- ChannelContent
- Completeness
- Listing mapping

## Does Not Own

- Canonical SKU identity（Core）
- Stock quantity（Inventory）
- Order
- Actual marketplace API

# 4. Core Dependencies

- Product identity
- DAM
- Market/Locale
- Events
- Compliance

# 5. Public Capabilities

- Attributes
- Taxonomy
- Localization
- Channel content
- Completeness
- Data quality
- Syndication-ready data

# 6. Primary Domain Objects

- ProductFamily
- Attribute
- Taxonomy
- ProductContent
- ChannelProfile
- CompletenessScore

# 7. Public Service Contract

```text
getProductContent()
setAttribute()
localizeProduct()
buildChannelPayload()
validateCompleteness()
mapCategory()
```

# 8. Events Published

```text
pim.product.updated
pim.completeness.changed
pim.channel_ready
pim.validation_failed
```

# 9. Events Consumed

```text
product.created
asset.approved
compliance.updated
```

# 10. Permissions

```text
pim.read
pim.edit
pim.publish
taxonomy.manage
attribute.manage
```

# 11. AI Tool Surface

```text
draft_product_copy()
translate_product()
map_attributes()
detect_missing_fields()
adapt_channel_listing()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Amazon
- Shopee
- Etsy
- Shopify
- Google Merchant
- Meta Catalog
- Marketplace connectors

# 13. Primary Workflows

1. Canonical Product/SKU → PIM attributes。
2. DAM assets → PIM product content。
3. Market/Channel profile → localized listing payload。
4. Validation → Marketplace Ops → Connector publish。

# 14. UX Surfaces

- Product grid
- Attribute editor
- Localization editor
- Completeness dashboard
- Channel preview
- Category mapping

# 15. Data & Integration Rules

- Product identity 與 platform listing id 分離
- Channel-specific title/description 不覆蓋 canonical content
- 所有 mapping versioned

# 16. MVP

- Attributes
- Localization
- Channel payload
- Completeness
- 2 marketplace mappings

# 17. Explicit Non-Goals for MVP

- Inventory sync
- Order management
- Dynamic pricing

# 18. Acceptance Criteria

- 同一 SKU 可生成至少兩平台不同 payload
- 平台刪除/替換不影響 canonical product
- 缺欄位可被明確驗證

# 19. Expansion Roadmap

- V1 Shopify/Shopee
- V2 Amazon/Etsy
- V3 compliance/PXM intelligence

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

任何商品只維護一次 canonical identity，並能輸出多市場、多語言、多 Channel listing。
