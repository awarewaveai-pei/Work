# Composable AI Commerce OS
## MASTER PLAN

> **Composable AI Business OS for Global Commerce**
>
> 這份文件是整套系統的最高施工總計畫。
>
> 其他所有 LEGO `.md` 文件都是本計畫底下的詳細施工圖。
>
> 核心原則：
>
> **Vision 想十年，Architecture 撐十年，Code 只做下一個可驗證步驟。**

---

# 0. Executive Summary

本產品不是單一：

- 客服系統
- CRM
- ERP
- Marketplace Manager
- Marketing Automation
- Social Media Tool
- Finance Tool
- AI Assistant

而是：

# **Composable AI Business OS for Global Commerce**

企業可以依需求安裝：

```text
Core
+
Modules
+
Connectors
+
Market Packs
```

例如：

```text
Taiwan Brand

Core
├ Organization
├ Identity
├ Permission
├ Event
├ Automation
├ Audit
└ AI

Modules
├ Customer Service
├ CRM
├ Marketing
├ Commerce
├ Social
├ Finance
└ Analytics

Connectors
├ LINE
├ WooCommerce
├ Shopee TW
├ ECPay
├ FluentCRM
└ Postiz

Market Pack
└ Taiwan
```

---

# 1. Product North Star

最終使用者不應該每天打開：

```text
LINE
Shopee
Amazon
Shopify
WooCommerce
FluentCRM
Postiz
Meta
Stripe
物流系統
會計系統
Analytics
```

而是只進：

```text
Business OS
```

然後：

```text
「今天公司有什麼需要我處理？」
```

系統回答：

```text
1. Amazon US Top SKU 預計 4 天後缺貨
2. Shopee TW 有 3 筆高風險延遲訂單
3. LINE 有 2 位 VIP 等待真人回覆
4. Meta ROAS 昨日起下降
5. Etsy listing 缺少材料資訊
6. 日本退款率異常
7. Supplier A 的 PO 明天逾期
```

---

# 2. Product Definition

整套產品只有四種主要 LEGO：

## 2.1 Core

永遠存在的底板。

```text
Organization
User
Team
Role
Permission

Contact
Identity

Event
Audit
Files
Notifications

Connector Runtime
Capability Registry

Automation
Policy
Tasks
Approvals

Search
Knowledge

AI Tool Registry
AI Control Plane
```

## 2.2 Module

提供 business capability。

```text
Customer Service
CRM
Marketing
Social
Content Studio
PIM
Commerce
Marketplace Ops
Pricing
Search / Merchandising
Subscription
B2B
POS
OMS
Inventory
Demand Planning
Procurement
Logistics
Returns
Loyalty
Creator / Affiliate
Payments / Risk
Finance
Accounting
Compliance
Analytics
AI Agents
```

## 2.3 Connector

外部平台 Adapter。

```text
LINE
WhatsApp
Telegram
Instagram
Messenger

WooCommerce
Shopify
Shopee
Amazon
Etsy
eBay

Stripe
ECPay
PayPal

Postiz
FluentCRM
Xero
DHL
...
```

## 2.4 Market Pack

市場組合：

```text
Taiwan
USA
Japan
SEA
EU
Korea
Latin America
```

每個 Market Pack 包含：

```text
Connectors
Locale
Currency
Tax
Payments
Logistics
Compliance
Recommended Modules
```

---

# 3. Architecture Constitution

以下規則不可破壞：

```text
MODULE != CONNECTOR

Contact != Identity

Product != Platform Listing

Order != Platform Raw Order

Core does not depend on Module

Module does not depend on specific Connector

Module cannot directly access another Module's private tables

Cross-module communication uses:
- public service
- event
- read model

AI never directly accesses raw database

AI never directly calls platform API

AI only uses permissioned tools

All tenant data is organization scoped

External platforms are replaceable

Sensitive writes require policy / permission / audit
```

---

# 4. Deployment Strategy

初期：

# Modular Monolith

```text
One Application
One PostgreSQL
One Object Storage
One Deployment
```

先不要：

```text
Microservices
Kafka
RabbitMQ
Kubernetes
Distributed Event Mesh
Complex Service Discovery
```

只有出現真實瓶頸後才拆：

```text
AI Voice
Media Processing
High-volume Connector Workers
Analytics Pipeline
Search Engine
```

---

# 5. Repository Structure

推薦：

```text
/apps
  /web

/core
  /organization
  /identity
  /permissions
  /events
  /audit
  /files
  /notifications
  /automation
  /policy
  /tasks
  /knowledge
  /search
  /ai
  /connectors

/modules
  /customer-service
  /crm
  /marketing
  /social
  /content-studio
  /pim
  /commerce
  /marketplace-ops
  /pricing
  /search-merchandising
  /subscription
  /b2b
  /pos
  /oms
  /inventory
  /demand-planning
  /procurement
  /logistics
  /returns
  /loyalty
  /creator-affiliate
  /payments-risk
  /finance
  /accounting
  /compliance
  /analytics

/connectors
  /messaging
  /commerce
  /crm
  /social
  /payments
  /logistics
  /accounting
  /ads
  /ai

/docs
```

---

# 6. Data Ownership

每個 Module 自己擁有自己的資料。

例如：

## Customer Service

```text
conversations
messages
tickets
internal_notes
```

## CRM

```text
leads
deals
pipelines
activities
```

## Marketing

```text
segments
campaigns
journeys
```

## Inventory

```text
warehouses
inventory_balances
stock_movements
reservations
```

## Finance

```text
settlements
payouts
expenses
cost_allocations
```

禁止：

```text
Customer Service
→ SELECT CRM private table
```

正確：

```text
Customer Service
→ CRM public service
```

或：

```text
CRM
→ event
→ Customer Service
```

---

# 7. Canonical Identity

核心人物模型：

```text
Contact
├ LINE Identity
├ WhatsApp Identity
├ Email Identity
├ Instagram Identity
├ WooCommerce Identity
├ Shopify Identity
├ Shopee Identity
└ CRM Identity
```

核心規則：

> Contact 是人，Identity 是平台身份。

不能：

```text
LINE customer
WooCommerce customer
Shopify customer
CRM customer
```

各自變成不同人物。

---

# 8. Canonical Product

核心商品：

```text
Product
└ SKU
   ├ WooCommerce Product Mapping
   ├ Shopify Variant Mapping
   ├ Shopee Model Mapping
   ├ Amazon SKU Mapping
   └ Etsy Listing Mapping
```

核心規則：

> Product != Listing

Listing 由 PIM / Marketplace Ops 管。

---

# 9. Canonical Order

所有平台訂單正規化成：

```text
Order
OrderItem
Store
CommerceCustomerRef
```

平台 raw data：

```text
Woo order
Shopify order
Shopee order
Amazon order
```

都只是 Connector source。

---

# 10. Event Architecture

統一 Event Envelope：

```json
{
  "event_id": "evt_xxx",
  "event_type": "order.paid",
  "organization_id": "org_xxx",
  "aggregate_type": "order",
  "aggregate_id": "order_xxx",
  "source": "woocommerce",
  "occurred_at": "ISO-8601",
  "schema_version": 1,
  "data": {}
}
```

主要事件：

```text
contact.created
contact.updated
contact.merged

identity.linked

message.received
message.sent

conversation.created
conversation.closed

order.imported
order.updated
order.paid
order.refunded

inventory.changed
inventory.low

payment.captured
payment.failed

shipment.created
shipment.delivered

campaign.sent
campaign.clicked

review.created

workflow.started
workflow.failed
```

初期：

```text
Application Event Bus
+
PostgreSQL Outbox
```

即可。

---

# 11. Connector Architecture

所有外部系統必須走：

```text
External Platform
↓
Authentication
↓
ConnectorConnection
↓
Webhook / API / Polling / SFTP / CSV / EDI
↓
Raw Payload Inbox
↓
Validation
↓
Idempotency
↓
Normalization
↓
Identity / Entity Mapping
↓
Domain Service
↓
Event
↓
Module
```

所有 Connector 必須定義：

```text
Auth
Capabilities
Region
Webhook
Polling
Initial Sync
Incremental Sync
Mapping
Rate Limits
Retry
Idempotency
Reconciliation
Health
Errors
Secrets
Tests
Uninstall
```

---

# 12. Capability Architecture

不要：

```text
if platform == "etsy"
```

而是：

```text
connector.supports("commerce.orders")
```

Messaging capabilities：

```text
messaging.text
messaging.image
messaging.audio
messaging.file
messaging.reply
messaging.push
```

Commerce：

```text
commerce.customer.read
commerce.orders.list
commerce.order.read
commerce.products.read
commerce.inventory.read
commerce.fulfillment.write
commerce.refund.write
```

Marketplace：

```text
marketplace.listings
marketplace.health
marketplace.messages
marketplace.finance
```

---

# 13. AI Architecture

AI 不直接操作資料庫。

AI 只能使用：

```text
search_contact()
get_contact()
get_customer_orders()
get_order()
get_inventory()
get_tracking()
search_knowledge()
create_ticket()
create_task()
send_message()
```

Tool metadata：

```text
permission
risk_level
audit_required
confirmation_required
approval_required
input_schema
output_schema
```

Risk levels：

```text
READ

LOW_RISK_WRITE

HIGH_RISK_WRITE
```

例：

```text
get_order()
→ READ

add_note()
→ LOW_RISK_WRITE

change_address()
→ CONFIRM

refund()
→ APPROVAL

change_bank_account()
→ FORBIDDEN
```

---

# 14. Entire LEGO Map

## Foundation

```text
Product Constitution
Platform Core
Identity / CDP / Consent
Security / Privacy / Observability
Connector Runtime
Developer Platform / SDK
Work Management / Approvals
Automation / Workflow / Policy
Knowledge / Search / Documents
SaaS Billing / Entitlements
```

## Customer

```text
Customer Service
CRM / Sales
Marketing / Growth
Loyalty / Reviews / UGC
Creator / Affiliate / Influencer
Customer Portal / Self-Service
```

## Content / Discovery

```text
Social / Community
Content Studio / DAM
PIM / PXM
Pricing / Promotions
Search / Merchandising / Discovery
Experimentation / Feature Flags
```

## Commerce

```text
Commerce Hub
Marketplace Operations
Subscription Commerce
B2B / Wholesale
POS / Retail
OMS
```

## Operations

```text
Inventory / WMS
Demand Planning
Procurement / Supplier
Logistics / Fulfillment
Returns / Warranty
PLM / Quality
```

## Money

```text
Payments / Fraud / Risk
Finance / Treasury
Accounting / Tax
```

## Global

```text
Cross-Border / Trade / Compliance
Market Packs
Localization
```

## Intelligence

```text
Analytics / Data Platform
AI Copilot / Agents
Agentic Commerce
```

---

# 15. Master Build Order

完整順序：

```text
01 Product Constitution
↓
02 Platform Core
↓
03 Identity / CDP / Consent
↓
Security Minimum
↓
29 Connector Runtime
↓
04 Customer Service
↓
LINE
↓
10 Commerce Hub
↓
WooCommerce
↓
25 AI Copilot
↓
27 Knowledge
↓
FluentCRM
↓
DOGFOOD
↓
WhatsApp
↓
Shopify
↓
SaaS Productization
↓
Work Management
↓
Automation / Policy
↓
Taiwan Market Pack
↓
Shopee TW / SHOPLINE / ECPay
↓
Global Marketplaces
↓
Marketplace Operations
↓
PIM / PXM
↓
Content / DAM
↓
Pricing / Promotions
↓
Search / Merchandising
↓
CRM Expansion
↓
Marketing
↓
Loyalty / Reviews
↓
Creator / Affiliate
↓
Social / Postiz
↓
Experimentation
↓
Subscription / B2B / POS
↓
OMS
↓
Inventory
↓
Demand Planning
↓
Procurement
↓
Logistics
↓
Returns / Warranty
↓
PLM / Quality
↓
Payments / Risk
↓
Finance
↓
Accounting
↓
Cross-Border Compliance
↓
Analytics / Data Platform
↓
Executive AI
↓
AI Agents
↓
Customer Portal
↓
Agentic Commerce
```

---

# 16. Phase 0 — Architecture Freeze

完成：

```text
Product Constitution
Core Domain Model
Module Contract
Connector Contract
Capability Registry
Event Contract
Permission Model
AI Tool Contract
```

Definition of Done：

```text
所有 AI coding agents 都知道：
- 哪些是 Core
- 哪些是 Module
- 哪些是 Connector
- 誰擁有什麼資料
- 哪些 dependency 禁止
```

---

# 17. Phase 1 — Minimum Core

做：

```text
Organization
User
Role
Permission

Contact
Identity

ConnectorConnection

Event
WebhookInbox
AuditLog
```

Acceptance：

```text
Create Organization
↓
Create User
↓
Create Contact
↓
Attach LINE Identity
↓
Audit
```

---

# 18. Phase 2 — Customer Service First

第一個正式產品：

# AI Omnichannel Customer Service

做：

```text
Conversation
Message
Ticket
Assignment
Internal Note
Unified Inbox
Customer Panel
```

第一個 Messaging Connector：

```text
LINE
```

---

# 19. Gate 1 — LINE

必須成功：

```text
LINE
↓
Webhook
↓
Normalize
↓
Identity
↓
Contact
↓
Conversation
↓
Inbox
↓
Reply
↓
LINE
```

Gate 1 未通：

```text
禁止 WhatsApp
禁止 Telegram
禁止 Instagram
```

---

# 20. Phase 3 — Commerce Context

建立：

```text
Commerce Hub
```

第一個 Connector：

```text
WooCommerce
```

只做：

```text
findCustomer()
getOrders()
getOrder()
```

---

# 21. Gate 2 — Contact + Commerce

必須成功：

```text
LINE Identity
+
WooCommerce Identity
↓
Same Contact
```

客服打開右側 Customer Panel：

```text
Customer
LINE
Recent Orders
Order Detail
```

---

# 22. Phase 4 — AI Copilot

做：

```text
AI Provider
AI Tool Registry
Suggested Reply
Conversation Summary
Intent Classification
```

AI：

```text
READ ONLY
```

第一批 Tools：

```text
get_contact()
get_conversation()
get_customer_orders()
get_order()
search_knowledge()
```

---

# 23. Phase 5 — Knowledge V1

做：

```text
FAQ
Shipping Policy
Return Policy
Product FAQ
Basic Search
```

AI 回答必須 Grounded。

---

# 24. Phase 6 — CRM Context

第一個 CRM Connector：

```text
FluentCRM
```

只做：

```text
Find Contact
Read Tags
Add Tag
Remove Tag
```

Customer Panel：

```text
Contact
LINE
WooCommerce
FluentCRM Tags
```

---

# 25. First Product Definition of Done

完整 Golden Flow：

```text
LINE Customer
↓
Unified Inbox
↓
Contact
↓
WooCommerce Orders
↓
FluentCRM Context
↓
AI Suggested Reply
↓
Human Send
↓
LINE
```

這時已經是一個可以自己使用的產品。

---

# 26. Phase 7 — Dogfood

停止增加功能。

實際使用。

觀察：

```text
Identity errors
Inbox friction
Order lookup
AI quality
Search quality
Missing context
Permissions
Connector reliability
```

至少先修真正使用問題。

---

# 27. Phase 8 — Second Messaging Connector

做：

```text
WhatsApp
```

目的：

> 驗證 Messaging abstraction。

---

# 28. Gate 3 — Messaging Architecture

加入 WhatsApp 後：

```text
LINE ─────┐
          ├→ Messaging Contract
WhatsApp ─┘
          ↓
     Unified Inbox
```

如果需要重寫：

```text
Conversation
Message
Inbox
```

停止擴展。

---

# 29. Phase 9 — Second Commerce Connector

做：

```text
Shopify
```

目的：

> 驗證 Commerce abstraction。

---

# 30. Gate 4 — Commerce Architecture

```text
WooCommerce ─┐
             ├→ Commerce Hub
Shopify ─────┘
```

如果 Shopify 要求重寫：

```text
Contact
Order
Customer 360
```

停止擴展。

---

# 31. Phase 10 — SaaS Productization

現在才正式準備賣。

做：

```text
Multi-tenant polish

Organization onboarding

User invitations

Teams

Roles

Connector setup wizard

Connector health

Error logs

Retry

Audit

Billing

Plans

Entitlements

Backup

Privacy
```

Beta：

```text
3–10 businesses
```

---

# 32. Phase 11 — Work Management

做：

```text
Task
Project-lite
Checklist
Owner
Due Date
Approval
```

很多 Module 都會需要。

---

# 33. Phase 12 — Automation / Policy

現在才建立：

```text
WHEN

IF

THEN
```

支援：

```text
Trigger
Condition
Action
Delay
Branch
Approval
Retry
Schedule
```

例如：

```text
WHEN order.paid

IF amount > 10000

THEN
Add VIP tag
Create task
Send LINE
Notify Sales
```

---

# 34. Phase 13 — Taiwan Market Pack

台灣優先 Connector：

```text
1. Shopee Taiwan
2. SHOPLINE
3. ECPay
4. NewebPay
5. Taiwan e-Invoice
6. Taiwan Logistics
```

之後：

```text
Coupang Taiwan
CYBERBIZ
91APP
momo
PChome
露天
```

---

# 35. Phase 14 — Global Commerce Expansion

依序：

```text
Amazon
Etsy
eBay
Walmart
TikTok Shop
Lazada
Rakuten
Mercado Libre
Temu
```

每次只接一個。

---

# 36. Phase 15 — Marketplace Operations

當 Marketplace 多起來，做：

```text
Listing Management
Category Mapping
Attribute Mapping
Listing Errors
Pricing
Promotions
Seller Health
Marketplace Fees
Settlement
```

---

# 37. Phase 16 — PIM / PXM

做：

```text
Product Families
Attributes
Taxonomy
Localization
Channel-specific Content
Completeness
Data Quality
Listing Mapping
```

核心：

```text
Product != Platform Listing
```

---

# 38. Phase 17 — Content Studio / DAM

做：

```text
AI Copy
Images
Video
Translation
Brand Kit
Templates
Asset Library
Versioning
Usage Rights
```

Downstream：

```text
PIM
Marketing
Social
Marketplace
```

都引用 Asset ID。

---

# 39. Phase 18 — Pricing / Promotions

做：

```text
Price Books
Market Prices
Channel Prices
B2B Prices
Coupons
Promotions
Bundles
Margin Floor
```

---

# 40. Phase 19 — Search / Merchandising / Discovery

做：

```text
Product Search
Semantic Search
Facets
Autocomplete
Boost / Bury
Recommendations
Merchant Feeds
Feed Health
AI Discovery
```

---

# 41. Phase 20 — CRM Expansion

CRM 從 context 升級成：

```text
Lead
Deal
Pipeline
Activities
Lead Score
Cold/Warm/Hot
Follow-up
Forecast
```

---

# 42. Phase 21 — Marketing

做：

```text
Segments
Campaigns
Journeys
Retention
Win-back
Upsell
Cross-sell
Abandoned Cart
Attribution
```

---

# 43. Phase 22 — Loyalty / Reviews

做：

```text
Points
VIP
Rewards
Referral
Reviews
Ratings
UGC
Review Requests
Moderation
```

---

# 44. Phase 23 — Creator / Affiliate

做：

```text
Creators
Influencers
Affiliate links
Promo codes
Seeding
Commission
UGC Rights
Performance
```

---

# 45. Phase 24 — Social

優先：

```text
Postiz Connector
```

Social Module 管：

```text
Calendar
Content
Approval
Analytics
Community
```

Postiz / Native connectors 管：

```text
Publishing
```

---

# 46. Phase 25 — Experimentation

做：

```text
Feature Flags
A/B Tests
Holdouts
Rollout %
Experiment Metrics
```

可以測：

```text
AI Reply
Search Ranking
Pricing
Checkout
Campaign
```

---

# 47. Phase 26 — Commerce Extensions

依需求選：

```text
Subscription Commerce

B2B / Wholesale

POS / Retail
```

不是每家公司都需要同時做。

---

# 48. Phase 27 — OMS

做：

```text
Allocation
Split
Merge
Routing
Backorder
Preorder
Partial Fulfillment
Exception Management
```

---

# 49. Phase 28 — Inventory

現在才做 Central Inventory。

核心：

```text
Stock Movement Ledger
Available
Reserved
Allocated
Incoming
Warehouse
Transfer
```

重要：

> 禁止直接 UPDATE inventory balance。

所有變動來自 Stock Movement。

---

# 50. Phase 29 — Demand Planning

做：

```text
Forecast
Seasonality
Safety Stock
Reorder Point
Stockout Risk
Overstock
Inventory Aging
```

---

# 51. Phase 30 — Procurement

做：

```text
Supplier
Purchase Request
Purchase Order
MOQ
Lead Time
ETA
Receiving
Supplier Performance
```

---

# 52. Phase 31 — Logistics

做：

```text
Shipment
Rates
Labels
Tracking
Pickup Points
3PL
```

台灣：

```text
7-ELEVEN
FamilyMart
Hi-Life
黑貓
新竹物流
順豐
```

國際：

```text
DHL
UPS
FedEx
USPS
```

---

# 53. Phase 32 — Returns / Warranty

做：

```text
Return Request
Approval
RMA
Return Shipment
Inspection
Refund
Exchange
Warranty
Repair
```

---

# 54. Phase 33 — PLM / Quality

自有品牌需要時：

```text
Product Idea
Sample
BOM
Specification
Version
Factory
Inspection
Defect
CAPA
Recall
```

---

# 55. Phase 34 — Payments / Fraud / Risk

做：

```text
Authorization
Capture
Payment
Refund
Chargeback

Fraud
Promo Abuse
Return Abuse
Velocity Rules
Manual Review
```

---

# 56. Phase 35 — Finance

做：

```text
Revenue
COGS
Platform Fees
Payment Fees
Ads
Shipping
Refund Cost
Expenses
Payout
Settlement
Cash Flow
Contribution Margin
```

核心價值：

```text
GMV
↓
真正 Contribution Margin
```

---

# 57. Phase 36 — Accounting

優先：

```text
Accounting Connectors
```

例如：

```text
Xero
QuickBooks
Taiwan Accounting
ERP
```

之後才考慮 Native：

```text
Chart of Accounts
Journal
General Ledger
AR
AP
Trial Balance
P&L
Balance Sheet
Cash Flow
```

---

# 58. Phase 37 — Cross-Border / Compliance

做：

```text
HS Code
Country of Origin
Incoterms
Duties
Landed Cost
VAT
GST
OSS
IOSS
Commercial Invoice
Certifications
DPP
Restricted Goods
```

---

# 59. Phase 38 — Analytics / Data Platform

建立：

```text
Metric Definitions
Semantic Metrics
Data Contracts
Data Quality
Event Analytics
Warehouse / Lakehouse
BI
Anomaly Detection
```

核心規則：

> Revenue、Margin、LTV、CAC 等 KPI 只能有一個正式定義。

---

# 60. Phase 39 — Executive AI

AI 可以回答：

```text
「為什麼日本本週營業額下降？」
```

AI Traversal：

```text
Marketing
↓
Traffic
↓
Search
↓
Conversion
↓
Orders
↓
Inventory
↓
Support
↓
Returns
↓
Finance
```

最後輸出原因與建議。

---

# 61. Phase 40 — AI Agents

AI 從：

```text
Suggest
```

進化：

```text
Detect
↓
Reason
↓
Plan
↓
Policy
↓
Approval
↓
Execute
↓
Audit
↓
Measure
```

例如：

```text
Stockout Risk
↓
AI
↓
Draft PO
↓
Manager Approval
↓
Send Supplier
```

---

# 62. Phase 41 — Customer Portal

做：

```text
Profile
Orders
Tracking
Returns
Tickets
Subscriptions
Invoices
Loyalty
Consent
Preferences
```

降低客服負擔。

---

# 63. Phase 42 — Agentic Commerce

最後建立：

```text
AI Shopping Agent Gateway
```

支援：

```text
Product Discovery
Offers
Availability
Checkout Intent
Order
Returns
Customer Account Linking
```

Protocol adapters：

```text
UCP
ACP
MCP
A2A
Merchant Feeds
```

核心規則：

```text
Agent != Human
```

每個 agent action 必須保存：

```text
Human Principal
Agent
Mandate
Permission
Intent
Action
Timestamp
Authorization
```

---

# 64. Market Expansion Order

推薦：

```text
Taiwan
↓
USA
↓
Japan
↓
SEA
↓
EU
↓
Korea
↓
Latin America
```

依實際客戶需求可調整。

---

# 65. Taiwan Pack

Communication：

```text
LINE
Messenger
Instagram
Telegram
WhatsApp
Email
```

Commerce：

```text
Shopee TW
WooCommerce
Shopify
SHOPLINE
Coupang TW
CYBERBIZ
91APP
momo
PChome
露天
```

Payments：

```text
ECPay
NewebPay
TapPay
LINE Pay
街口
```

Logistics：

```text
7-ELEVEN
FamilyMart
Hi-Life
黑貓
新竹物流
順豐
```

Finance：

```text
Taiwan e-Invoice
Accounting
Bank Reconciliation
```

---

# 66. USA Pack

```text
Shopify
Amazon
Walmart
eBay
Etsy
TikTok Shop

Stripe
PayPal

Meta
Google

UPS
FedEx
USPS
```

---

# 67. Japan Pack

```text
Amazon JP
Rakuten
Yahoo Shopping
Qoo10
Shopify

LINE
Instagram
X

Local Payment
Local Logistics
Japan Tax
```

---

# 68. SEA Pack

```text
Shopee
Lazada
TikTok Shop
Shopify

WhatsApp
LINE
Messenger
Instagram
Telegram

Local Payments
Local Logistics
```

---

# 69. EU Pack

```text
Amazon EU
eBay
Etsy
Zalando
Shopify

Stripe
PayPal

VAT
OSS
IOSS
DPP
Product Compliance

DHL
UPS
```

---

# 70. Commercial Product Evolution

## Product 1

```text
AI Customer Service
```

```text
Core
+
Customer Service
+
LINE
+
WooCommerce
+
AI
```

## Product 2

```text
Omnichannel Support
```

增加：

```text
WhatsApp
Instagram
Messenger
Telegram
Email
Shopify
```

## Product 3

```text
Taiwan Commerce OS
```

增加：

```text
Shopee TW
SHOPLINE
ECPay
Taiwan Invoice
Taiwan Logistics
```

## Product 4

```text
Global Commerce OS
```

增加：

```text
Amazon
Etsy
eBay
Walmart
PIM
Marketplace Ops
```

## Product 5

```text
Growth OS
```

增加：

```text
CRM
Marketing
Content
Social
Loyalty
Affiliate
```

## Product 6

```text
Operations OS
```

增加：

```text
OMS
Inventory
Procurement
Logistics
Returns
```

## Product 7

```text
Business OS
```

增加：

```text
Finance
Accounting
Analytics
Executive AI
Agents
```

---

# 71. SaaS Business Model

```text
Core SaaS
+
Modules
+
Connectors
+
Usage
+
Enterprise Add-ons
```

可能：

```text
Starter

Pro

Business

Enterprise
```

Entitlement dimensions：

```text
Users
Agents
Stores
Channels
Connectors
Modules
AI Tokens
AI Voice Minutes
Messages
Orders Synced
Storage
API Calls
```

---

# 72. Build vs Connect

## Must Build

```text
Platform Core
Identity
Permissions
Events
Automation
Module System
Connector Runtime
Unified Inbox
Unified Search
AI Tool Layer
Unified UI
```

## Build or Connect

```text
CRM
Customer Service
Marketing
Commerce
Analytics
```

## Prefer Connect

```text
Social Publishing
Payments
Accounting
Shipping
Tax
Email Delivery
Marketplace APIs
AI Providers
Ad Networks
```

---

# 73. Explicit Do-Not-Build-Early List

不要太早：

```text
Full Accounting ERP

Full HR

Payroll

Recruiting

Own Payment Gateway

Own Shipping Network

Own Social Publishing Engine

Own LLM

Microservices

Central Inventory Sync

Voice Call Center

Complex Warehouse Automation
```

---

# 74. Architecture Gates

## Gate 0

```text
Organization
User
Contact
Identity
Permission
Audit
```

穩定。

## Gate 1

```text
LINE → Inbox → Reply
```

穩定。

## Gate 2

```text
LINE Contact → WooCommerce Orders
```

Identity 正確。

## Gate 3

```text
加入 WhatsApp
```

Inbox 不重寫。

## Gate 4

```text
加入 Shopify
```

Commerce Core 不重寫。

## Gate 5

```text
加入 Shopee / Amazon
```

Canonical Product/Order 不重寫。

## Gate 6

```text
Inventory
```

所有 stock changes 可由 ledger 重建。

## Gate 7

```text
Finance
```

Order economics 可追溯。

## Gate 8

```text
AI Agent
```

所有 write actions 有 permission / policy / audit。

---

# 75. Coding Agent Rules

Claude / Codex 每次工作：

```text
Only modify the assigned LEGO.

Use public Core contracts.

Do not access other modules' private tables.

Do not add provider-specific logic to Core.

Do not implement future modules.

Do not introduce speculative infrastructure.

Every external webhook must be idempotent.

Every connector must expose health.

Every sensitive write must be audited.

Every AI action must use registered Tools.

Every task must include tests.

Stop when the assigned task is complete.
```

---

# 76. Definition of LEGO Success

每塊 LEGO 都必須通過：

## Remove Test

拔掉 Module：

> Core 還能工作。

## Replace Test

換 Connector：

> Module 不重寫。

## Boundary Test

> 不直接讀其他 Module 私有 Table。

## Tenant Test

> 不跨 Organization。

## Event Test

> Cross-module reaction 不硬耦合。

## Audit Test

> 高風險操作可追蹤。

## AI Test

> AI 不繞過 Tool/Policy。

---

# 77. First 90% Focus

現在真正應該做：

```text
Product Constitution

Platform Core

Identity

Security Minimum

Connector Runtime

Customer Service

LINE

Commerce Hub

WooCommerce

AI Copilot

Knowledge

FluentCRM

Dogfood
```

其他全部：

> 文件先存在，Code 暫停。

---

# 78. First Commercial Milestone

產品能做到：

```text
客戶 LINE：
「我的訂單在哪？」

↓

Unified Inbox

↓

辨識 Customer

↓

顯示 WooCommerce Order

↓

顯示 FluentCRM Context

↓

AI Suggested Reply

↓

客服按 Send

↓

LINE 收到
```

並且：

```text
Reliable
Auditable
Fast
Tenant-safe
Replaceable
```

這就是第一個可銷售版本的核心。

---

# 79. Ultimate Closed Loop

```text
Advertising
↓
Lead
↓
CRM
↓
Marketing
↓
Content
↓
Social
↓
Customer
↓
Conversation
↓
Commerce
↓
Order
↓
Payment
↓
Inventory
↓
Fulfillment
↓
Delivery
↓
Return / Review
↓
Loyalty
↓
Repeat Purchase
↓
Finance
↓
Analytics
↓
Executive AI
```

---

# 80. Autonomous Business Loop

最終：

```text
Business Event
↓
AI Agent
↓
Reason
↓
Core Tools
↓
Policy
↓
Human Approval if required
↓
Execute
↓
Audit
↓
Measure
```

---

# 81. Final Product Philosophy

目標不是：

> 「什麼功能都有。」

而是：

> **任何商業能力都可以像 LEGO 一樣插進來，並共享同一套 Identity、Data、Events、Permissions、Automation、AI 與 UI。**

---

# 82. Ultimate Definition

# **Composable AI Commerce OS**

一套可以把：

```text
Customer Service
CRM
Marketing
Social
Content
PIM
Commerce
Marketplace
Pricing
B2B
POS
Subscription
OMS
Inventory
Procurement
Logistics
Returns
Loyalty
Payments
Finance
Accounting
Compliance
Analytics
AI
```

像 LEGO 一樣自由組裝的：

# **AI Operating System for Global Commerce**

---

# 83. Final Build Rule

> **Never expand horizontally before proving the current vertical slice.**

中文：

> **上一條完整流程沒有跑穩，就不要開始下一堆功能。**

---

# 84. Immediate Next Step

現在只執行：

```text
Phase 0
→ Architecture Freeze

Phase 1
→ Minimum Core

Phase 2
→ Customer Service

Phase 3
→ LINE

Phase 4
→ WooCommerce

Phase 5
→ AI Copilot

Phase 6
→ FluentCRM

Phase 7
→ Dogfood
```

然後：

# STOP + REVIEW

通過後再開始：

```text
WhatsApp
Shopify
Multi-tenant Productization
Taiwan Pack
```

---

**End of MASTER PLAN**
