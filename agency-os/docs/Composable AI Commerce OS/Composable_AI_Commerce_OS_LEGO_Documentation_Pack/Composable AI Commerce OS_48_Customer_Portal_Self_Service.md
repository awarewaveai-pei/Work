# Composable AI Commerce OS
## Customer Portal & Self-Service LEGO

> 文件角色：客戶自行查訂單、退貨、Ticket、訂閱、Loyalty 與 Consent 的前台模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

降低客服負擔，讓客戶安全地自己完成低風險操作。

# 2. Why This LEGO Exists

Unified Inbox 解決 Agent 體驗；Portal 解決 Customer 體驗。

# 3. Boundary

## Owns

- PortalSession
- PortalPreference
- SelfServiceRequest

## Does Not Own

- Order
- Ticket
- Return
- Subscription
- Loyalty data

# 4. Core Dependencies

- Identity/Auth
- Commerce
- Customer Service
- Returns
- Subscription
- Loyalty
- Consent

# 5. Public Capabilities

- Order lookup
- Tracking
- Returns
- Tickets
- Subscriptions
- Invoices
- Loyalty
- Consent/preferences

# 6. Primary Domain Objects

- PortalSession
- SelfServiceRequest

# 7. Public Service Contract

```text
authenticateCustomer()
getPortalHome()
requestReturn()
updatePreferences()
```

# 8. Events Published

```text
portal.login
portal.self_service.completed
```

# 9. Events Consumed

```text
order.updated
ticket.updated
shipment.updated
```

# 10. Permissions

```text
customer.self.read
customer.self.write
```

# 11. AI Tool Surface

```text
customer_self_service_assistant()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Identity/login providers optional
- Messaging magic-link delivery

# 13. Primary Workflows

Customer authenticates → sees scoped data → self-service request → policy → module action。

# 14. UX Surfaces

- Mobile-first portal
- Orders
- Tracking
- Returns
- Support
- Loyalty
- Preferences

# 15. Data & Integration Rules

- 只能讀自己的 canonical Contact scope
- 高風險變更二次驗證
- 不暴露 internal notes

# 16. MVP

- Order/Tracking
- Ticket status
- Return request
- Preferences

# 17. Explicit Non-Goals for MVP

- Full storefront

# 18. Acceptance Criteria

- 客戶不可看到別人資料
- Portal action 同樣 audited
- Customer Service 看得到 self-service timeline

# 19. Expansion Roadmap

- V1 portal
- V2 subscription/loyalty
- V3 AI concierge

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

低風險查詢與申請可由客戶自己完成，且沿用同一 domain services。
