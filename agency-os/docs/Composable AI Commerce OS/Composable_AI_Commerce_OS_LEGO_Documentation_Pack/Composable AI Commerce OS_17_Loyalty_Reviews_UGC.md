# Composable AI Commerce OS
## Loyalty / Reviews / UGC LEGO

> 文件角色：會員、點數、VIP、推薦、評論、Ratings 與 UGC 的 Customer Growth 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把購後體驗轉成 repeat purchase、loyalty 與 social proof。

# 2. Why This LEGO Exists

國際電商不只 acquisition；留存與評論直接影響 CAC、LTV、轉換率與品牌信任。

# 3. Boundary

## Owns

- LoyaltyAccount
- PointLedger
- Tier
- Reward
- Referral
- Review
- UGCAssetLink

## Does Not Own

- Contact identity
- Payment ledger
- DAM binary
- Marketplace review API

# 4. Core Dependencies

- Contact
- Commerce
- Marketing
- DAM
- Events

# 5. Public Capabilities

- Points
- VIP tiers
- Rewards
- Referral
- Store credit reference
- Reviews
- Photo/video UGC
- Moderation

# 6. Primary Domain Objects

- LoyaltyAccount
- PointEntry
- Tier
- Reward
- Review
- Referral

# 7. Public Service Contract

```text
earnPoints()
redeemPoints()
evaluateTier()
requestReview()
moderateReview()
createReferral()
```

# 8. Events Published

```text
loyalty.points.earned
loyalty.tier.changed
review.created
review.approved
referral.converted
```

# 9. Events Consumed

```text
order.paid
order.refunded
customer.birthday
return.completed
```

# 10. Permissions

```text
loyalty.read
loyalty.adjust
loyalty.rules.manage
reviews.moderate
```

# 11. AI Tool Surface

```text
summarize_reviews()
detect_review_topics()
suggest_reward()
moderate_review()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Marketplace reviews
- Google reviews where applicable
- Email/LINE review request

# 13. Primary Workflows

1. Order paid → points pending/earned。
2. Refund → reverse points。
3. Delivery → review request。
4. Review approved → UGC / Marketing activation。

# 14. UX Surfaces

- Loyalty profile
- Points ledger
- Tier manager
- Review inbox
- UGC library

# 15. Data & Integration Rules

- Points 必須 ledger-based
- Review moderation 可追蹤
- Marketplace review constraints 由 connector capability 控制

# 16. MVP

- Points
- VIP tiers
- Review request
- Review moderation

# 17. Explicit Non-Goals for MVP

- Complex coalition loyalty
- Full gift-card issuer

# 18. Acceptance Criteria

- Refund 正確 reversal
- 同一 Contact 跨 Channel 共用 loyalty
- Review 可追到 order/product

# 19. Expansion Roadmap

- V1 loyalty+reviews
- V2 referrals
- V3 advanced personalization

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

從 order → loyalty → review → repeat purchase 建立可量測閉環。
