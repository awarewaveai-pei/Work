# Composable AI Commerce OS
## Customer Service Phase 1 Plan

# Mission

先完成第一塊可以永久保留的 Business OS LEGO：

```text
AI Omnichannel Customer Service
```

# Active Scope

```text
Platform Core
Customer Service Module
LINE Connector
WooCommerce Connector
FluentCRM Connector
AI Suggested Reply
Knowledge V1
Search V1
Audit / Permissions
```

# Golden Flow 001

```text
LINE:
「我的訂單呢？」

↓
LINE Webhook
↓
Webhook Inbox
↓
Normalize
↓
Identity
↓
Contact
↓
Conversation
↓
WooCommerce recent orders
↓
AI Suggested Reply
↓
Human Send
↓
LINE
```

# Task Order

```text
001 Product Constitution
002 Core Domain Model
003 PostgreSQL Schema
004 Module Contract
005 Connector Contract
006 Capability Registry
007 Event Contract
008 Permission Model
009 Organization
010 User / Role / Permission
011 Contact
012 Identity
013 ConnectorConnection
014 Event / Audit
015 LINE Connector
016 Webhook Inbox
017 Conversation
018 Message
019 Unified Inbox
020 LINE Reply
021 Gate 1
022 Commerce Contract
023 WooCommerce Connector
024 Customer 360
025 Recent Orders
026 Golden Flow 001
027 Gate 2
028 AI Provider
029 AI Tool Registry
030 Suggested Reply
031 Summary / Intent
032 FluentCRM Connector
033 Dogfood
034 Architecture Review
035 Security Review
```

# STOP RULE

完成 Phase 1 review 前，不做：
- WhatsApp
- Shopify
- Shopee
- Inventory
- Marketing
- Finance
- Voice
- Microservices

# Definition of Done

客服不再需要切換 LINE OA、WooCommerce、FluentCRM、ChatGPT 才能完成主要訂單客服。
