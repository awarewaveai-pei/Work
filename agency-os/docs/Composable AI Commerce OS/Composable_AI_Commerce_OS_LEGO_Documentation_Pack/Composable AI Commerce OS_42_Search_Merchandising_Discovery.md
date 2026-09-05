# Composable AI Commerce OS
## Search / Merchandising / Discovery LEGO

> 文件角色：站內搜尋、推薦、排序、Feed 與 AI shopping discovery 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓商品可被人與機器找到，並用 merchandising 規則控制排序、推薦與不同 discovery surface 的商品供給。

# 2. Why This LEGO Exists

Commerce 不只結帳；search quality、zero-result、ranking、feed rejection 直接影響 conversion。

# 3. Boundary

## Owns

- SearchConfig
- Synonym
- MerchRule
- RecommendationSet
- ProductFeed
- FeedIssue

## Does Not Own

- PIM canonical content
- Marketplace listing
- Ad campaign

# 4. Core Dependencies

- PIM
- Pricing
- Inventory read
- Analytics
- AI

# 5. Public Capabilities

- Search
- Autocomplete
- Facets
- Semantic search
- Boost/Bury
- Recommendations
- Feeds
- Feed quality

# 6. Primary Domain Objects

- SearchProfile
- MerchRule
- Recommendation
- ProductFeed
- FeedIssue

# 7. Public Service Contract

```text
searchProducts()
getRecommendations()
applyMerchRules()
buildFeed()
validateFeed()
```

# 8. Events Published

```text
search.no_results
feed.generated
feed.rejected
recommendation.clicked
```

# 9. Events Consumed

```text
pim.product.updated
inventory.changed
price.changed
```

# 10. Permissions

```text
search.manage
merchandising.manage
feed.manage
discovery.analytics.read
```

# 11. AI Tool Surface

```text
semantic_product_search()
suggest_merch_rule()
diagnose_feed_issue()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Google Merchant
- Meta Catalog
- Pinterest
- TikTok
- AI commerce feeds

# 13. Primary Workflows

1. PIM → searchable index。
2. Query → ranking + inventory + price context。
3. Merchant feed → channel validation。
4. Click/order → learning signals。

# 14. UX Surfaces

- Search analytics
- Merchandising console
- Recommendation rules
- Feed health

# 15. Data & Integration Rules

- Search index 是 projection，不是 source of truth
- Feed errors 回到 PIM fields
- Ranking rules versioned

# 16. MVP

- Keyword+semantic search
- Facets
- Boost/Bury
- Google/Meta feed health

# 17. Explicit Non-Goals for MVP

- Own web crawler
- Large-scale recommendation ML first

# 18. Acceptance Criteria

- 商品更新可同步 index
- 缺貨商品可降權
- feed rejection 可定位 source field

# 19. Expansion Roadmap

- V1 search/feed
- V2 personalization
- V3 agentic discovery

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

商品在網站、feed 與 AI discovery surface 都由同一 canonical data 供給。
