# Composable AI Commerce OS
## Agentic Commerce LEGO

> 文件角色：AI Shopping Agent、Machine-readable catalog、Agent checkout 與 delegated action gateway。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓未來外部 AI agent 可以安全地搜尋商品、取得 offer、建立 checkout/order，而不繞過 Commerce/Payment/Policy。

# 2. Why This LEGO Exists

未來 buyer 可能是代表人的 AI agent；需要把 human principal、agent、permission、intent、payment authorization 留下紀錄。

# 3. Boundary

## Owns

- AgentPrincipalLink
- AgentMandate
- AgentSession
- AgentCommerceRequest
- ProtocolAdapter

## Does Not Own

- Product/PIM
- Order
- Payment
- External AI model

# 4. Core Dependencies

- Identity
- PIM/Search
- Commerce
- Payments
- Policy
- Audit

# 5. Public Capabilities

- Product discovery
- Offer
- Availability
- Checkout intent
- Order status
- Returns intent
- Agent delegation

# 6. Primary Domain Objects

- AgentMandate
- AgentSession
- AgentRequest

# 7. Public Service Contract

```text
discoverProducts()
getOffer()
createCheckoutIntent()
submitAgentOrder()
verifyMandate()
```

# 8. Events Published

```text
agent.session.created
agent.order.requested
agent.action.denied
```

# 9. Events Consumed

```text
price.changed
inventory.changed
order.updated
```

# 10. Permissions

```text
agentcommerce.read
agentcommerce.checkout
agentcommerce.manage
```

# 11. AI Tool Surface

```text
machine-facing tools/protocol adapters
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- UCP
- ACP
- MCP
- A2A
- Merchant feeds
- future protocol adapters

# 13. Primary Workflows

Human principal → delegates agent → product discovery → offer → policy → payment authorization → order → audit。

# 14. UX Surfaces

- Agent access settings
- Mandates
- Agent activity log
- Protocol health

# 15. Data & Integration Rules

- Agent != human Contact
- Every agent action ties to principal/mandate
- No bypass of payment/policy

# 16. MVP

- Read-only merchant feed/protocol adapter
- Agent identity/audit

# 17. Explicit Non-Goals for MVP

- Autonomous spending without mandate

# 18. Acceptance Criteria

- Agent request 可追到 human principal
- 撤銷 mandate 後立即失效
- 同 Commerce service 被 human/agent 共用

# 19. Expansion Roadmap

- V1 discovery
- V2 checkout
- V3 autonomous bounded workflows

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

AI buyer 成為一種受控 client，而不是繞過既有 Business OS 的特殊通道。
