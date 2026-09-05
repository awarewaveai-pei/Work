# Composable AI Commerce OS
## Marketing & Growth LEGO

> 文件角色：Audience、Campaign、Journey、Retention 與 Attribution 的行銷模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

以 Customer 360 與 Consent 為基礎，建立跨 Channel 的 segmentation、campaign 與 lifecycle marketing。

# 2. Why This LEGO Exists

Marketing 不能直接等於 Email tool；它應該是 orchestration layer，LINE、Email、WhatsApp、Ads 都是可替換的 delivery connectors。

# 3. Boundary

## Owns

- Segment
- Campaign
- Journey
- Audience snapshot
- Marketing rule
- Attribution touchpoint

## Does Not Own

- Contact identity
- Consent ledger
- Messaging transport
- Ad platform implementation
- CRM Deal

# 4. Core Dependencies

- Contact/CDP
- Consent
- Events
- Automation
- AI
- Analytics

# 5. Public Capabilities

- Segmentation
- Campaigns
- Journeys
- Abandoned cart
- Win-back
- Retention
- Upsell / Cross-sell
- Attribution

# 6. Primary Domain Objects

- Segment
- Campaign
- Journey
- JourneyNode
- AudienceSnapshot
- Touchpoint

# 7. Public Service Contract

```text
evaluateSegment(segmentId)
createCampaign()
launchCampaign(campaignId)
enterJourney(contactId, journeyId)
recordTouchpoint()
getAttribution(orderId)
```

# 8. Events Published

```text
segment.entered
segment.exited
campaign.started
campaign.sent
campaign.clicked
journey.entered
journey.completed
```

# 9. Events Consumed

```text
contact.updated
order.created
order.paid
cart.abandoned
message.received
review.created
```

# 10. Permissions

```text
marketing.read
segment.manage
campaign.manage
campaign.send
journey.manage
audience.export
```

# 11. AI Tool Surface

```text
suggest_segment()
draft_campaign()
draft_journey()
analyze_campaign()
suggest_next_best_action()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- LINE OA
- Email provider
- WhatsApp
- SMS
- Meta Ads
- Google Ads
- TikTok Ads
- LINE Ads

# 13. Primary Workflows

1. CDP event → Segment update。
2. Segment + consent → Campaign audience。
3. Campaign → delivery connector。
4. Click / message / order → Attribution。
5. Order / inactivity → lifecycle journey。

# 14. UX Surfaces

- Segment builder
- Campaign calendar
- Journey builder
- Audience preview
- Performance dashboard
- Attribution view

# 15. Data & Integration Rules

- 未有有效 consent 不可送出該目的訊息
- Audience snapshot 要可重現
- Connector delivery receipt 正規化
- Campaign content 與 delivery transport 分離

# 16. MVP

- Segments
- Basic campaigns
- LINE/Email delivery
- Win-back
- Simple attribution

# 17. Explicit Non-Goals for MVP

- Full MMM
- Enterprise CDP replacement
- Ad bidding engine

# 18. Acceptance Criteria

- 同一 Segment 可換 Channel 發送
- Consent 會阻止非法 audience
- Campaign 結果可追到 order/revenue

# 19. Expansion Roadmap

- V1 Segments + campaigns
- V2 Journey
- V2.5 Ads activation
- V3 advanced attribution / experimentation

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

能從 Customer 360 產生 audience，經 consent 檢查送出 campaign，並把結果閉環回 Customer 與 Revenue。
