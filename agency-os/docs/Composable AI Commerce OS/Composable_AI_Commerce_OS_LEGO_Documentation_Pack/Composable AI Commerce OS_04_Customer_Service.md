# Composable AI Commerce OS
## Customer Service LEGO

> 文件角色：客服、Unified Inbox、Ticket 與 AI Copilot 的正式模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把所有可支援的客戶通訊 Channel 收進同一個操作面，讓客服在不切換外部系統的情況下完成辨識客戶、理解問題、查詢商務上下文、回覆與追蹤。

# 2. Why This LEGO Exists

這是整個 Business OS 最適合優先落地的第一個 LEGO。它會同時驗證 Identity、Connector、Event、Permission、AI Tool、Customer 360 與 Commerce context。

# 3. Boundary

## Owns

- Conversation
- Message
- Ticket
- InternalNote
- Assignment
- Inbox state
- Conversation status / priority

## Does Not Own

- Contact / Identity（Core）
- Orders（Commerce）
- CRM lead / deal（CRM）
- LINE / WhatsApp API details（Connector）
- Marketing campaigns（Marketing）

# 4. Core Dependencies

- Organization
- User / Team / Permission
- Contact / Identity
- Event Bus
- Audit
- Connector Runtime
- AI Tool Registry
- Files

# 5. Public Capabilities

- Unified Inbox
- Conversation lifecycle
- Agent assignment
- Internal notes
- Ticket lifecycle
- Customer context panel
- Canned reply / macro
- AI suggested reply
- AI summary / intent
- Human handoff

# 6. Primary Domain Objects

- Conversation
- Message
- Ticket
- InternalNote
- AssignmentRule（後期）

# 7. Public Service Contract

```text
openConversation(contact, channel)
appendMessage(conversationId, normalizedMessage)
reply(conversationId, content)
assign(conversationId, userOrTeam)
closeConversation(conversationId)
createTicket(conversationId, issue)
getCustomerContext(contactId)
```

# 8. Events Published

```text
conversation.created
conversation.assigned
conversation.closed
message.received
message.sent
ticket.created
ticket.resolved
```

# 9. Events Consumed

```text
contact.merged
identity.linked
order.updated
shipment.updated
connector.failed
```

# 10. Permissions

```text
inbox.read
conversation.read
conversation.reply
conversation.assign
conversation.close
ticket.read
ticket.manage
contact.read
commerce.read
ai.use
```

# 11. AI Tool Surface

```text
get_conversation()
get_contact()
get_customer_orders()
get_order()
get_tracking()
search_knowledge()
draft_reply()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Messaging Connector Contract
- 第一個：LINE
- 之後：WhatsApp、Instagram、Messenger、Telegram、Email、Web Chat
- Commerce context 透過 Commerce service，不直接依賴 WooCommerce

# 13. Primary Workflows

1. LINE inbound → webhook inbox → normalize → Identity → Contact → Conversation → Inbox。
2. Agent 打開 Conversation → Customer 360 自動載入最近訂單與 CRM 標籤。
3. AI 讀取對話與 permissioned tools → 產生 suggested reply。
4. Agent 編輯 / Send → Messaging service → Connector → 外部平台。
5. 需要追蹤的問題建立 Ticket，不把所有 Conversation 都強制 Ticket 化。

# 14. UX Surfaces

- 三欄式 Inbox：Conversation List / Conversation / Customer Panel
- Unread、Assigned to me、Unassigned、Open、Pending、Closed filters
- Reply composer
- Internal note
- Ticket drawer
- AI suggestion panel
- Connector/source badge

# 15. Data & Integration Rules

- Message 必須 Normalize 後才進 Domain
- Raw webhook payload 保留在 Connector runtime，不污染 Message schema
- Conversation 不等於外部 thread
- Agent reply 永遠走 Messaging service
- 敏感動作不能由 AI 自動執行

# 16. MVP

- LINE text/image/audio/file metadata
- Unified Inbox
- Contact/Identity linking
- Assignment / internal note / ticket
- WooCommerce recent orders panel
- FluentCRM tags panel
- AI suggested reply / summary / intent

# 17. Explicit Non-Goals for MVP

- Voice call center
- Advanced SLA engine
- Workforce management
- AI full autopilot
- 10+ channels
- Complex routing

# 18. Acceptance Criteria

- LINE → Inbox → Reply 端到端穩定
- 同一 Contact 可有多 Identity
- 客服無需打開 LINE OA / WooCommerce / FluentCRM 完成主要流程
- 重複 webhook 不產生重複 Message
- Agent 權限正確隔離
- 所有 reply 有 audit record

# 19. Expansion Roadmap

- V0.1 LINE + WooCommerce + FluentCRM + AI Copilot
- V0.5 WhatsApp
- V0.7 Instagram / Messenger / Telegram / Email
- V1 Auto-routing / SLA / CSAT
- V2 safe Autopilot
- V3 Voice

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

客服只開這套系統，就能處理第一條 Golden Flow：LINE 客戶詢問訂單 → 顯示客戶與訂單 → AI 建議 → 真人送出 → 留下完整稽核紀錄。
