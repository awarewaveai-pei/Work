# Composable AI Commerce OS
## CRM & Sales LEGO

> 文件角色：客戶關係、Lead、Deal、Pipeline 與 Sales activity 的獨立模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

將 Contact 轉化為可管理的商機與銷售流程，但不重新建立另一份 Customer identity。

# 2. Why This LEGO Exists

CRM 應建立在 Core Contact 上，而不是複製客服或 Commerce 的 Customer；這讓 CRM 可單獨販售，也可替換為 HubSpot / Salesforce 等外部 CRM。

# 3. Boundary

## Owns

- Lead
- Deal
- Pipeline
- Stage
- SalesActivity
- FollowUp
- LeadScore configuration

## Does Not Own

- Contact / Identity
- Conversation / Message
- Order
- Campaign
- External CRM token / API logic

# 4. Core Dependencies

- Contact / Identity
- Organization / User / Team
- Tasks
- Events
- Audit

# 5. Public Capabilities

- Lead management
- Pipeline
- Deal stages
- Activities
- Lead scoring
- Cold/Warm/Hot
- Sales forecast
- Follow-up

# 6. Primary Domain Objects

- Lead
- Deal
- Pipeline
- PipelineStage
- Activity
- LeadScore

# 7. Public Service Contract

```text
createLead(contactId, source)
qualifyLead(leadId)
createDeal(contactId, pipelineId)
moveDeal(dealId, stageId)
recordActivity(contactId, activity)
scoreLead(contactId)
```

# 8. Events Published

```text
lead.created
lead.qualified
deal.created
deal.stage_changed
deal.won
deal.lost
crm.activity.created
```

# 9. Events Consumed

```text
contact.created
message.received
order.paid
campaign.clicked
review.created
```

# 10. Permissions

```text
crm.read
crm.lead.manage
crm.deal.manage
crm.pipeline.manage
crm.activity.write
crm.export
```

# 11. AI Tool Surface

```text
get_lead()
get_deals()
summarize_customer_history()
suggest_next_action()
score_lead()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- FluentCRM
- HubSpot
- Salesforce
- Zoho
- Pipedrive
- Custom CRM

# 13. Primary Workflows

1. 新 Contact / inbound lead → Lead。
2. 行為與客服互動進入 Customer timeline → 更新 lead score。
3. Qualified lead → Deal → Pipeline stage。
4. Deal won → 發 event，Commerce / Finance / Analytics 可訂閱。

# 14. UX Surfaces

- Lead list
- Pipeline kanban
- Deal detail
- Activity timeline
- Follow-up queue
- Sales forecast

# 15. Data & Integration Rules

- Contact 為 Core canonical identity
- 外部 CRM 只能以 Connector mapping 連結
- CRM 不直接修改 Commerce Order
- Lead score 規則需 versioned

# 16. MVP

- Lead
- Deal
- Pipeline
- Activity
- Basic lead score
- FluentCRM mapping

# 17. Explicit Non-Goals for MVP

- CPQ
- Full sales compensation
- Territory planning
- Enterprise forecasting

# 18. Acceptance Criteria

- 同一 Contact 可同時出現在客服與 CRM，不重複建立人
- Deal stage change 發 event
- 外部 CRM Connector 拔除後 Native CRM 仍可運作

# 19. Expansion Roadmap

- V1 Native CRM
- V1.5 HubSpot / Salesforce connector
- V2 predictive scoring
- V3 CPQ / advanced sales

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

能以 Core Contact 為中心管理 Lead → Deal → Won 的完整銷售流程，並可由客服、行銷與 Commerce 事件驅動。
