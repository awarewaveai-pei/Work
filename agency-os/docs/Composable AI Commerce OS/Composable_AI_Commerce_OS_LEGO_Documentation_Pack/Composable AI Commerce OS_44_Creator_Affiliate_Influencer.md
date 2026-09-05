# Composable AI Commerce OS
## Creator / Affiliate / Influencer LEGO

> 文件角色：創作者、Affiliate、Seeding、佣金、UGC rights 與成效追蹤模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

管理 creator acquisition、內容合作、affiliate link/code、commission 與 revenue attribution。

# 2. Why This LEGO Exists

國際品牌 growth 經常依賴 influencer/affiliate；不能把這些關係硬塞 CRM Deal 或 Marketing Campaign。

# 3. Boundary

## Owns

- CreatorProfile
- AffiliateProgram
- AffiliateLink
- PromoCodeAssignment
- Commission
- SeedingCampaign
- UGCRight

## Does Not Own

- Contact identity
- Payment payout execution
- DAM binary
- Ad platform

# 4. Core Dependencies

- Contact/Company
- Marketing
- Content/DAM
- Commerce
- Finance

# 5. Public Capabilities

- Creator CRM view
- Seeding
- Links/codes
- Commission
- UGC rights
- Performance

# 6. Primary Domain Objects

- Creator
- AffiliateProgram
- CommissionRule
- Seeding
- UGCRight

# 7. Public Service Contract

```text
enrollCreator()
createAffiliateLink()
attributeSale()
calculateCommission()
grantUsageRight()
```

# 8. Events Published

```text
creator.enrolled
affiliate.sale_attributed
commission.accrued
ugc.right.expiring
```

# 9. Events Consumed

```text
order.paid
content.asset.created
campaign.started
```

# 10. Permissions

```text
creator.read
creator.manage
affiliate.manage
commission.approve
```

# 11. AI Tool Surface

```text
find_creator_fit()
summarize_creator_performance()
draft_outreach()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Social connectors
- Affiliate networks
- Payment payout providers

# 13. Primary Workflows

1. Creator outreach → agreement。
2. Seeding / content。
3. Link/code → sale attribution。
4. Commission → Finance payout。

# 14. UX Surfaces

- Creator directory
- Campaign board
- Commission ledger
- UGC rights calendar

# 15. Data & Integration Rules

- UGC usage rights 有期限/市場
- Commission 可重建
- Payout 與 commission calculation 分離

# 16. MVP

- Creator
- Affiliate link/code
- Commission
- Performance

# 17. Explicit Non-Goals for MVP

- Full influencer marketplace

# 18. Acceptance Criteria

- Sale 可歸因 creator
- refund 會 reversal commission
- UGC rights expiry 可警告

# 19. Expansion Roadmap

- V1 affiliate
- V2 seeding/UGC
- V3 creator intelligence

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

Creator 合作從 outreach 到 revenue/commission/UGC rights 可完整追蹤。
