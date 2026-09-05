# Composable AI Commerce OS
## Product Constitution

> 這是所有 Claude / Codex / 人類工程師都必須遵守的最高層規則。

# 1. Non-Negotiable Rules

```text
MODULE != CONNECTOR

Contact != Identity
Product != Platform Listing
Order != Platform Raw Order

Core does not depend on Module
Module does not depend on a specific Connector
Connector implementation never leaks into Core

Modules do not directly access another Module's private tables
Cross-module reads use public services/read models
Cross-module reactions prefer domain events

AI never accesses raw database directly
AI never calls external platform APIs directly
AI only uses permissioned Tools

Every external webhook is idempotent
Every connector exposes health
Every sensitive write is audited

All tenant-owned data is organization scoped
External platforms are replaceable
```

# 2. LEGO Definitions

## Core
不可拔的底板：Organization、Identity、Permission、Event、Audit、Files、Connector Runtime、AI Tool Registry。

## Module
可安裝/停用的 business capability：Customer Service、CRM、Marketing、Commerce、Finance 等。

## Connector
外部系統 Adapter：LINE、WooCommerce、Shopify、Shopee、Stripe、Postiz 等。

## Market Pack
特定國家/市場的 modules + connectors + locale + tax + logistics + compliance 組合。

# 3. Build Rule

> Vision 可以想十年，Code 只寫下一個可驗證步驟。

# 4. Architecture Gates

1. LINE → Inbox → Reply 不穩，不加第二個 messaging channel。
2. LINE Contact → Woo Order identity 不正確，不加 Shopify。
3. 加 WhatsApp 需要重寫 Inbox，先修 Connector abstraction。
4. 加 Shopify 需要重寫 Order/Customer Core，先修 Commerce abstraction。
5. Inventory ledger 未完成一致性測試，不做多平台庫存同步。
6. Finance source mapping 未穩定，不做 Native Accounting。
7. AI Read-only Tool 未穩定，不開 Write Agent。

# 5. Dependency Rule

新增 dependency 前必須回答：
- 現有 stack 是否真的不能解決？
- 是否造成 provider lock-in？
- 是否增加 deployment / security / operational complexity？
- 是否有更小的替代方案？

# 6. Infrastructure Rule

第一階段預設：

```text
One Application
One PostgreSQL
One Object Storage
One Deployment
```

Redis / Kafka / RabbitMQ / Kubernetes / Microservices 只有在有量測到的瓶頸後才引入。

# 7. Data Ownership Rule

每個 Module 必須在 README 宣告：
- Owns Data
- Reads via public contract
- Events Published
- Events Consumed
- Permissions
- Dependencies
- Forbidden Dependencies

# 8. Definition of Architecture Success

- 拔掉 WooCommerce，Shopify 仍工作。
- 拔掉 LINE，WhatsApp 仍工作。
- 拔掉 CRM module，客服仍工作。
- OpenAI 換 Anthropic，business logic 不改。
- 一家公司永遠看不到另一家公司資料。
