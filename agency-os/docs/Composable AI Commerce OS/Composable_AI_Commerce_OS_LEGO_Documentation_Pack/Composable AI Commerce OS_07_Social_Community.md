# Composable AI Commerce OS
## Social & Community LEGO

> 文件角色：社群內容排程、社群互動、community 與 social analytics 的模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把社群內容與 community operations 納入 Business OS，但將 platform posting mechanics 留給 Connector / Postiz。

# 2. Why This LEGO Exists

社群發文 API 變化快，不應把所有平台 posting engine 寫進 Core；Social LEGO 應管理內容、排程、審核與成效。

# 3. Boundary

## Owns

- SocialCalendar
- SocialPostPlan
- Approval state
- Community item
- SocialMetric snapshot

## Does Not Own

- Actual platform API implementation
- Customer service Conversation
- Content asset binary
- Ad campaign

# 4. Core Dependencies

- Content Studio / DAM
- Tasks / Approval
- Events
- Analytics
- Identity where available

# 5. Public Capabilities

- Calendar
- Post planning
- Approval
- Publishing orchestration
- Community monitoring
- Analytics

# 6. Primary Domain Objects

- SocialPost
- SocialSchedule
- CommunityInteraction
- SocialMetric

# 7. Public Service Contract

```text
schedulePost()
approvePost()
publishPost()
cancelPost()
ingestEngagement()
getPerformance()
```

# 8. Events Published

```text
social.post.scheduled
social.post.published
social.post.failed
social.engagement.received
```

# 9. Events Consumed

```text
content.asset.approved
campaign.started
brand.policy.updated
```

# 10. Permissions

```text
social.read
social.create
social.approve
social.publish
social.analytics.read
```

# 11. AI Tool Surface

```text
draft_social_post()
adapt_content_for_channel()
suggest_publish_time()
summarize_social_performance()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Postiz 優先
- Meta
- Instagram
- Threads
- X
- TikTok
- YouTube
- LinkedIn
- Pinterest

# 13. Primary Workflows

1. Campaign brief → Content Studio → assets。
2. Social post plan → Approval。
3. Publish → Postiz/native connector。
4. Engagement → normalized social events → Analytics / CRM / Customer Service。

# 14. UX Surfaces

- Social calendar
- Post composer
- Approval queue
- Channel preview
- Performance view

# 15. Data & Integration Rules

- Publishing provider 可替換
- Customer-service DM 不屬於 Social inbox
- 所有 asset 必須引用 DAM asset id

# 16. MVP

- Postiz connector
- Calendar
- Approval
- Publish status
- Basic metrics

# 17. Explicit Non-Goals for MVP

- 自己重做所有平台 API
- Full social listening firehose

# 18. Acceptance Criteria

- 換掉 Postiz 不需改 Social domain
- 同一內容可產生 channel-specific variants
- 失敗 publish 可重試且有 health status

# 19. Expansion Roadmap

- V1 Postiz
- V2 community & listening
- V3 influencer linkage

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

可由 Content → Approval → Postiz/native → Publish → Analytics 完成一條 social content flow。
