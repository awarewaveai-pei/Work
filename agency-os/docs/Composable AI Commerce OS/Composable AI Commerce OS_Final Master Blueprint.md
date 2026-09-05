# Composable AI Commerce OS
## Final Master Blueprint

> **Composable AI Business OS for Global Commerce**
>
> 為國際電商、品牌商、零售商與跨境賣家打造的模組化 AI 商業作業系統。
>
> 所有功能像 LEGO 一樣自由安裝、移除、替換與組合。
>
> **One Core. Unlimited Modules. Unlimited Connectors.**

---

# 0. Product North Star

這個產品不是另一套：

- CRM
- ERP
- Helpdesk
- Marketing Automation
- Social Media Tool
- Marketplace Manager
- Accounting Tool

而是一個讓以上能力互相協作的：

# **Composable Business OS**

企業只需要選擇自己需要的：

```text
MODULE
「我要什麼能力？」

+

CONNECTOR
「我要連接什麼平台？」

+

MARKET PACK
「我要在哪些國家做生意？」
```

例如：

```text
Company A

Modules
├ Customer Service
├ CRM
├ Marketing
├ Commerce
├ Social
├ Finance
└ AI

Market Packs
├ Taiwan
├ USA
└ Japan

Connectors
├ LINE
├ WhatsApp
├ Instagram
├ Shopee TW
├ Amazon
├ Etsy
├ Shopify
├ ECPay
├ Stripe
└ Postiz
```

---

# 1. Fundamental Architecture

整個產品只有四種主要概念：

## 1.1 Core

永遠存在的企業底層能力。

## 1.2 Module

提供 Business Capability。

例如：

```text
CRM
Customer Service
Marketing
Commerce
Inventory
Finance
```

## 1.3 Connector

連接外部平台。

例如：

```text
LINE
Shopify
Shopee
Stripe
Postiz
FluentCRM
```

## 1.4 Market Pack

特定國家或市場推薦的：

```text
Modules
+
Connectors
+
Compliance Rules
+
Currency
+
Tax
+
Logistics
+
Payment
```

---

# 2. Architecture Principle

## Modular Monolith First

一開始不要 Microservices。

第一版：

```text
Application
+
PostgreSQL
+
Object Storage
```

即可。

內部保持：

```text
Strict Module Boundary
Event-Driven
Provider Interfaces
Connector Contracts
```

但部署仍是一套 application。

未來只有真正需要獨立 Scaling 的部分再拆，例如：

```text
AI Voice
Media Processing
Analytics
Search
High-volume Connector Workers
```

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│                 EXPERIENCE                   │
│                                              │
│ Dashboard                                    │
│ Unified Inbox                                │
│ Customer 360                                 │
│ Commerce Console                             │
│ Mobile / PWA                                 │
│ Customer Portal                              │
│ AI Assistant                                 │
│ Executive AI                                 │
├──────────────────────────────────────────────┤
│                  MODULES                     │
│                                              │
│ Customer Service   CRM        Marketing      │
│ Loyalty            Reviews    Social         │
│ Content            PIM        Commerce       │
│ Marketplace Ops    OMS        Inventory      │
│ Procurement        Logistics  Finance        │
│ Accounting         B2B        POS            │
│ Compliance         Analytics  AI             │
├──────────────────────────────────────────────┤
│                PLATFORM CORE                 │
│                                              │
│ Organizations / Legal Entities               │
│ Identity / Customer 360                      │
│ Master Data                                  │
│ Consent / Privacy                            │
│ Event Bus                                    │
│ Automation                                   │
│ Tasks / Approvals                            │
│ Search / Knowledge                           │
│ Files / Documents                            │
│ Permissions / Audit                          │
│ Data Platform                                │
│ AI Control Plane                             │
│ Developer Platform                           │
├──────────────────────────────────────────────┤
│                 CONNECTORS                   │
│                                              │
│ Communication                                │
│ Commerce / Marketplace                       │
│ CRM                                          │
│ Social                                       │
│ Payments                                     │
│ Logistics                                    │
│ Accounting                                   │
│ Advertising                                  │
│ AI                                           │
│ Data                                         │
└──────────────────────────────────────────────┘
```

---

# 4. Organization Model

第一版就必須 Multi-Tenant。

但不能只有：

```text
Organization
```

完整企業階層應該是：

```text
Organization
│
├ Legal Entities
│
├ Brands
│
├ Business Units
│
├ Markets
│
├ Stores
│
├ Warehouses
│
├ Teams
│
└ Users
```

例如：

```text
ABC Group

├ ABC Taiwan Ltd.
│   ├ Taiwan Brand
│   ├ Shopee TW
│   └ WooCommerce TW
│
├ ABC USA Inc.
│   ├ Shopify US
│   ├ Amazon US
│   └ Walmart
│
└ ABC Japan GK
    ├ Amazon JP
    └ Rakuten
```

這對：

- Tax
- Accounting
- Currency
- Inventory
- Permissions
- Legal compliance

都非常重要。

---

# 5. Identity / Customer 360

核心 Identity 永遠不是：

```text
LINE user
Shopify user
WooCommerce user
```

而是：

```text
Contact
```

例如：

```text
Contact #9281

王小明

Identities
├ Email
│  wang@example.com
│
├ Phone
│  +886912345678
│
├ LINE
│  Uxxxxxxxx
│
├ WhatsApp
│  +886912345678
│
├ Telegram
│  938281
│
├ Instagram
│  @xiaoming
│
├ Facebook
│  991828...
│
├ WooCommerce
│  Customer #881
│
├ Shopify
│  gid://customer/...
│
├ Shopee
│  Buyer ...
│
└ Amazon
   Marketplace identity
```

全部代表：

> **同一個人。**

---

# 6. Identity Resolution

系統需要支援：

```text
Deterministic Matching

Email
Phone
Customer ID
Account Linking
```

以及未來：

```text
Probabilistic Matching
```

但自動合併必須保守。

應支援：

```text
Merge
Unmerge
Identity confidence
Conflict review
Identity audit log
```

---

# 7. Consent & Preference Center

Customer 360 不能只有資料。

還要知道：

```text
LINE Marketing Consent
WhatsApp Consent
Email Consent
SMS Consent
Push Consent

Tracking Consent
Profiling Consent
AI Processing Preference
```

以及：

```text
Preferred Language
Preferred Currency
Preferred Channel
Preferred Contact Time
```

建立：

# Consent Ledger

```text
contact
channel
purpose
status
source
timestamp
jurisdiction
policy_version
```

---

# 8. Privacy / Customer Data Rights

Core 必須支援：

```text
Export Customer Data
Delete Customer Data
Correct Customer Data
Consent History
Retention Policy
Anonymization
Suppression List
```

讓各 Market Pack 可以掛不同法規。

例如：

```text
Taiwan Privacy
GDPR
CCPA / CPRA
其他國家資料法規
```

---

# 9. Master Data Management

全系統必須有 Canonical Objects。

```text
Organization
Legal Entity
Brand

Contact
Company

Product
SKU
Variant
Bundle

Store
Marketplace Account

Warehouse
Supplier

Order
Payment
Shipment
Return

Campaign
Channel

Currency
Country
Market
```

外部平台 ID 永遠只是 Mapping。

---

# 10. Product Identity

例如：

```text
Canonical SKU

COFFEE-ABC-500
│
├ WooCommerce Product 182
├ Shopify Variant 91828
├ Shopee Model 88182
├ Amazon SKU ABC500
├ Etsy Listing 78281
└ Walmart Item ...
```

這個 Canonical SKU 才是：

```text
Inventory
Finance
Analytics
Forecast
PIM
```

真正認識的商品。

---

# 11. PIM / Product Information Management

這是 v1 最大缺口之一。

Core 的 Product 只負責 Identity。

真正商品內容由：

# PIM Module

管理。

包括：

```text
Product Families
Attributes
Taxonomy
Categories
Variants

Technical Specs

Descriptions
Titles
Bullet Points

Images
Video

SEO Content

Ingredients
Materials
Dimensions
Weight

Country of Origin

Localized Content

Channel-specific Content

Regulatory Data

Product Completeness

Data Quality
```

國際電商尤其需要：

```text
Taiwan Listing
Amazon US Listing
Etsy Listing
Shopee Listing
Japan Listing
```

各自擁有不同：

```text
Title
Description
Images
Attributes
Language
Units
Regulatory fields
```

PIM 是這些資料的中央 Product Hub。

---

# 12. PXM — Product Experience Management

PIM 管資料。

PXM 管：

> 商品在不同市場如何被呈現。

例如：

```text
Product
│
├ Taiwan Experience
├ USA Experience
├ Japan Experience
└ EU Experience
```

支援：

```text
Localization
Brand Voice
Market-specific Claims
Channel-specific Assets
Translation
Cultural Adaptation
```

---

# 13. Digital Asset Management — DAM

Content Studio 產生的東西不能散落。

建立：

```text
Asset Library

Images
Video
Audio
Documents
3D
Packaging
Brand Assets
UGC
Ad Creatives
```

每個 Asset：

```text
Owner
Brand
License
Usage Rights
Language
Market
Product
Campaign
Expiration
Version
AI-generated status
```

---

# 14. Event Bus

所有 Module 透過 Event 溝通。

例如：

```text
customer.created
customer.merged

message.received

product.updated

order.created
order.paid
order.shipped
order.delivered
order.refunded

inventory.changed
inventory.low

payment.failed

campaign.sent
campaign.clicked

review.created

return.requested

subscription.renewed
```

---

# 15. Reliable Event Processing

不能假設 Webhook 永遠：

```text
一定送到
依順序送到
只送一次
```

Connector Runtime 必須原生處理：

```text
Idempotency

Webhook Inbox

Outbox Pattern

Retry

Dead Letter

Timestamp Ordering

Duplicate Detection

Periodic Reconciliation

Manual Re-sync
```

例如 Shopify 官方就明確說 Webhook **不保證順序、也不能完全依賴一定收到**，因此建議另外做 reconciliation jobs。

這應該直接成為 Connector SDK 的基本能力。

---

# 16. Automation Engine

所有 Module 使用同一套 Automation。

基本模型：

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
Schedule

Branch
Loop

Approval

Retry
Timeout

Human Task
```

例如：

```text
WHEN
order.paid

IF
amount > NT$20,000

THEN

Add CRM Tag: VIP

Notify Sales

Create Fulfillment Task

Send LINE

Update Forecast
```

---

# 17. Policy Engine

Automation 決定：

> 可以做什麼。

Policy Engine 決定：

> 誰可以做。

例如：

```text
Refund < NT$3,000
→ Customer Service

Refund NT$3,000–20,000
→ Manager Approval

Refund > NT$20,000
→ Finance Approval
```

也可以限制 AI：

```text
AI

Read Order     YES

Write Note     YES

Refund         Approval Required

Change Bank    NEVER
```

---

# 18. Tasks / Projects / Approvals

企業還是有很多 Human Workflow。

Core 提供：

```text
Task
Project
Checklist
Owner
Team
Due Date
Priority

Comment
Attachment

Approval

Dependency

Recurring Task
```

例如：

```text
AI Ad Generated
↓
Marketing Review
↓
Brand Review
↓
Legal Approval
↓
Publish
```

---

# 19. Documents / Template Engine

建立共用文件引擎：

```text
Invoice
Packing Slip
Purchase Order
Quotation
Credit Note
Commercial Invoice
Proforma Invoice
Return Form
Shipping Document
Statement
Contract
```

支援：

```text
Template
Variable
Localization
PDF
Email
Digital Signature Connector
```

---

# 20. Knowledge Platform

企業知識統一存在：

```text
SOP
FAQ
Product Manual
Policy
Contract
Training
Meeting Notes
Brand Guide
Compliance Documents
```

建立：

```text
Versioning
Permissions
Source
Owner
Expiration
Review Cycle
```

AI 根據角色取得不同 Knowledge。

---

# 21. Global Search

搜尋：

```text
王小明
```

一次看到：

```text
Customer
Orders
Messages
Tickets
Payments
Returns
Invoices
Reviews
CRM Activities
Notes
```

並支援：

```text
Natural Language Search
```

例如：

> 過去 90 天退款超過兩次而且 LTV 超過 NT$20,000 的台灣客戶。

---

# 22. Customer Service Module

提供：

```text
Unified Inbox

Conversations

Messages

Tickets

Agents

Teams

Assignment

Priority

SLA

Internal Notes

Macros

Attachments

Canned Replies

AI Suggested Reply

AI Summary

AI Classification

Sentiment

Customer Context

Knowledge Search
```

---

# 23. Customer Service Channels

## Tier 0 — Taiwan

```text
LINE Official Account
```

## Tier 1 — Global

```text
WhatsApp Business
Telegram
Facebook Messenger
Instagram
Email
Web Chat
```

## Tier 2

```text
Slack
Discord
SMS
X / Twitter
Threads
```

## Platform Restricted

```text
Snapchat
其他沒有完整公開 Messaging API 的平台
```

---

# 24. Marketplace Customer Service

Marketplace 也是客服 Channel。

Connector capability 可以提供：

```text
marketplace.questions
marketplace.chat
marketplace.messages
marketplace.claims
marketplace.reviews
```

視平台 API 能力開放。

---

# 25. AI Customer Service

三種模式：

```text
MANUAL

COPILOT

AUTOPILOT
```

第一階段：

```text
Copilot
+
低風險 Autopilot
```

AI 可直接處理：

```text
Order Status
Tracking
Stock
Product Information
FAQ
Store Hours
```

人工：

```text
Refund
Complaint
Chargeback
Large Order
Legal Issue
Account Security
```

---

# 26. Voice Message AI

```text
Voice Message
↓
STT
↓
AI
↓
Text or TTS
↓
Reply
```

支援：

```text
LINE Audio
WhatsApp Voice
Telegram Voice
```

---

# 27. Live Voice / AI Call Center

後期 Module。

```text
Phone
WhatsApp Calling
VoIP / SIP

↓
Realtime Voice AI

↓
Business Tools

↓
Human Handoff
```

產生：

```text
Transcript
Summary
Intent
Sentiment
Tasks
CRM Timeline
Ticket
```

---

# 28. CRM Module

```text
Contacts
Companies

Leads
Deals

Pipeline
Stages

Activities

Tasks
Notes

Lead Source

Cold
Warm
Hot

Lead Score

Sales Forecast

Follow-up

Conversion
```

---

# 29. External CRM Connectors

```text
FluentCRM

HubSpot

Salesforce

Zoho CRM

Pipedrive

Klaviyo

Custom CRM
```

---

# 30. FluentCRM Connector

對 WordPress 商家：

```text
Contacts
Tags
Lists
Custom Fields
Automation
Campaign Data
WooCommerce Integration
```

可支援：

```text
LINE interaction
↓
Add FluentCRM Tag

Woo purchase
↓
FluentCRM Automation
↓
Send LINE
```

---

# 31. CDP Layer

CRM 與 Identity 之間再加入：

# Customer Data Platform

主要負責：

```text
Customer Events

Identity Resolution

Behavior Timeline

Segments

Customer Attributes

Consent

Activation
```

例如：

```text
IG Ad Click

Website Browse

LINE Conversation

Shopee Purchase

Email Click

Return

Review

Support Ticket
```

全部形成：

> Customer 360 Timeline

---

# 32. Marketing Module

提供：

```text
Segments

Campaigns

Audience

Journeys

Lead Nurturing

Retention

Win-back

Upsell

Cross-sell

Abandoned Cart

Coupons

Marketing Automation

Attribution
```

---

# 33. Loyalty / Rewards Module

應獨立於 Marketing。

功能：

```text
Points

VIP Tiers

Rewards

Referral

Gift

Birthday

Membership

Store Credit

Wallet

Gift Cards

Points Expiration

Fraud Protection
```

Customer 可能跨：

```text
Online
Marketplace
POS
```

共用 Loyalty Profile。

---

# 34. Reviews / Ratings / UGC Module

這是前一版缺少的大功能。

```text
Product Reviews

Store Reviews

Ratings

Photo Reviews

Video Reviews

Q&A

UGC

Review Moderation

Review Request

Review Reply

Review Syndication

Sentiment Analysis
```

以及：

```text
Reputation Monitoring
```

將：

```text
Amazon
Google
Meta
Marketplace Reviews
```

盡可能集中管理。

---

# 35. Creator / Influencer / Affiliate Module

獨立管理：

```text
Creators

Influencers

Affiliate Partners

Campaigns

Seeding

Samples

Promo Codes

Links

Commission

UGC Rights

Contracts

Performance

Revenue Attribution
```

---

# 36. Social Module

負責：

```text
Social Calendar

Campaign

Content

Approval

Analytics

Community

Social Listening

Asset Selection
```

Publishing Engine 優先透過：

```text
Postiz Connector
```

避免自己重做數十個發文 API。

---

# 37. Content Studio

提供：

```text
AI Copywriting

Product Description

SEO Copy

Ads Copy

Social Copy

Images

Product Photography

Video

Short Video

Voice

Translation

Localization

Subtitles

Brand Kit

Templates
```

---

# 38. Brand System

AI Content 必須知道：

```text
Brand Voice

Tone

Colors

Typography

Forbidden Terms

Approved Claims

Product Naming

Market-specific Rules
```

Content Studio 所有生成均套用 Brand Profile。

---

# 39. Search / Discovery Module

國際 Commerce OS 不應忽略站內搜尋。

提供：

```text
Product Search

Autocomplete

Facets

Filters

Synonyms

Semantic Search

Category Browse

No-result Analytics
```

---

# 40. Merchandising Module

不只搜尋。

還包含：

```text
Ranking Rules

Pinned Products

Boost / Bury

Margin-aware Ranking

Inventory-aware Ranking

Campaign Merchandising

Recommendations

Personalization

Cross-sell

Bundles
```

---

# 41. Commerce Discovery / Feed Module

專門把商品送到：

```text
Google Merchant Center

Meta Catalog

Pinterest

TikTok

Search Engines

Shopping Engines

Affiliate Feeds

AI Commerce Surfaces
```

並管理：

```text
Feed Quality
Rejected Products
Missing Attributes
Price Mismatch
Availability Mismatch
```

---

# 42. SEO / GEO / AI Discovery

建立：

```text
Structured Data

Schema.org

Sitemap

Canonical

Product Feed

Merchant Feed

SEO Health

AI Search Visibility
```

未來 Commerce Discovery 不只有 Google。

也包括 AI Shopping Agents。

---

# 43. Experimentation Platform

新增：

```text
Feature Flags

A/B Tests

A/B/n

Holdouts

Rollout %

Experiment Audience

Metrics

Statistical Results
```

可以測：

```text
Checkout

Pricing

Product Ranking

Ads Creative

AI Reply

Recommendation
```

---

# 44. Commerce Hub

Commerce Module 不做商城。

提供：

```text
Stores

Products

Orders

Customers

Returns

Fulfillment

Promotions
```

不同平台資料統一 Normalize。

---

# 45. Commerce Direct Connectors

```text
Shopify

WooCommerce

SHOPLINE

CYBERBIZ

91APP

Magento / Adobe Commerce

BigCommerce

Custom Headless Commerce
```

---

# 46. Global Marketplace Connectors

## Tier 1

```text
Amazon

eBay

Etsy

Walmart Marketplace

TikTok Shop

Shopee
```

## Tier 2

```text
Lazada

Rakuten

Mercado Libre

Coupang

Qoo10

Yahoo Shopping

Temu

SHEIN Marketplace
```

Temu 現在已有正式 Partner Platform 與第三方 ISV seller authorization 機制，因此應列入 connector roadmap，而不是視為封閉平台。

---

# 47. Regional Marketplace Roadmap

## Taiwan

```text
Shopee TW

Coupang TW

momo

PChome

露天
```

Coupang 已提供 Taiwan Open API integration guide，目前明確涵蓋 Order Management、Delivery Services 與 Customer Support。

## Japan

```text
Amazon JP

Rakuten

Yahoo Shopping

Qoo10
```

## Korea

```text
Coupang

Naver Smart Store

其他 Korean marketplaces
```

## Southeast Asia

```text
Shopee

Lazada

TikTok Shop
```

## USA

```text
Amazon

Walmart

eBay

Etsy

TikTok Shop
```

## Latin America

```text
Mercado Libre
```

## India

```text
Amazon India

Flipkart

其他授權平台
```

## Europe

```text
Amazon EU

eBay

Etsy

Zalando

Allegro

Kaufland

其他區域 marketplaces
```

---

# 48. B2B Marketplace

另外預留：

```text
Alibaba.com

Faire

Ankorstore

Wholesale Marketplaces

Distributor Portals
```

---

# 49. Marketplace Operations Module

Marketplace 不只是 Orders。

新增：

```text
Listing Management

Channel Mapping

Category Mapping

Attribute Mapping

Listing Quality

Listing Errors

Offer Management

Pricing

Repricing

Competitor Pricing

Promotions

Inventory

Orders

Fulfillment

Marketplace Fees

Marketplace Advertising

Settlement

Account Health

Seller Performance

Policy Violations
```

---

# 50. Seller Health

應監控：

```text
Late Shipment

Cancellation Rate

Return Rate

Defect Rate

Review Score

Listing Violation

Account Warning

Buy Box

Stockout

Service SLA
```

並自動 Alert。

---

# 51. Pricing Engine

獨立能力：

```text
Price Books

Market Prices

Currency Prices

Customer Prices

B2B Prices

Channel Prices

Minimum Margin

Promotion Price

MAP / Pricing Rules

Volume Pricing

Bundle Pricing

Dynamic Pricing
```

---

# 52. Promotion Engine

```text
Coupon

Discount

Buy X Get Y

Bundle

Threshold

Free Shipping

Gift

Member Pricing

Marketplace Promotion

Campaign Calendar
```

---

# 53. B2B / Wholesale Module

這是上一版的重要缺口。

包含：

```text
Companies

Company Locations

Buyer Accounts

Buyer Roles

Catalogs

Negotiated Pricing

Volume Pricing

MOQ

Quote / RFQ

Draft Order

Purchase Order Number

Credit Limit

Payment Terms

Deposit

Net 30 / 60 / 90

Tax Exemption

Approval Workflow

Sales Rep
```

Shopify 現行 B2B 本身也已把 company、company location、catalog、volume pricing、tax ID 與 payment terms 當成核心模型，說明這不是一般 CRM Contact 可以取代的能力。

---

# 54. Subscription Commerce Module

支援：

```text
Recurring Orders

Subscription Products

Plans

Trials

Renewal

Pause

Upgrade

Downgrade

Proration

Dunning

Failed Payment Recovery

Cancellation

Churn

Subscription Analytics
```

成熟 Subscription Billing 還需要 automated revenue recovery、customer self-service 與 recurring lifecycle 管理。

---

# 55. Customer Entitlements

如果未來賣：

```text
Digital Products

Membership

Subscription Services

Software
```

需要：

```text
Entitlements

Access Rights

Feature Access

Expiration

Provisioning

De-provisioning
```

---

# 56. OMS — Order Management System

Orders 與 Inventory 中間需要正式 OMS。

```text
Order Orchestration

Order Split

Order Merge

Allocation

Order Routing

ATP

ATS

Delivery Promise

Partial Fulfillment

Backorder

Preorder

Dropship

Store Fulfillment

Marketplace Fulfillment

Order Exception
```

---

# 57. Inventory Module

```text
SKU

Warehouse

Available

Reserved

Allocated

Incoming

Damaged

Quarantine

Stock Movement

Transfer

Cycle Count

Adjustment
```

---

# 58. WMS — Warehouse Management

後期：

```text
Bins

Locations

Receiving

Putaway

Picking

Packing

Shipping

Wave Picking

Batch Picking

Barcode

Lot

Serial Number

Expiration

Cycle Count
```

---

# 59. Demand Planning

新增：

```text
Demand Forecast

Seasonality

Safety Stock

Reorder Point

Lead Time

Stockout Risk

Overstock Risk

Dead Stock

Inventory Aging

Purchase Recommendation
```

---

# 60. Procurement Module

```text
Suppliers

Supplier Products

MOQ

Lead Time

Purchase Request

Purchase Order

Receiving

Backorder

Cost Version

Supplier Performance
```

---

# 61. Supplier / Vendor Portal

供供應商：

```text
Confirm PO

Upload Invoice

Update ETA

Upload Compliance Documents

Submit Samples

Quality Issue

Shipment ASN
```

---

# 62. PLM / Product Development

對自有品牌很重要。

後期加入：

```text
Product Idea

Sample

BOM

Materials

Packaging

Specification

Factory

Costing

Version

Approval

Launch
```

---

# 63. Quality Management

```text
Inspection

QA Checklist

Defect

Batch

Supplier Quality

Corrective Action

Recall
```

---

# 64. Logistics Module

標準工具：

```text
createShipment()

getRates()

getLabel()

cancelShipment()

getTracking()

getPickupPoint()
```

---

# 65. Taiwan Logistics

```text
7-ELEVEN

FamilyMart

Hi-Life

黑貓

新竹物流

順豐

Aggregators
```

---

# 66. International Logistics

```text
DHL

UPS

FedEx

USPS

Local Carriers

3PL Providers
```

---

# 67. 3PL / Fulfillment Connectors

與 Carrier 分開：

```text
Amazon FBA / MCF

ShipBob

Regional 3PL

Custom WMS

Fulfillment Centers
```

---

# 68. Returns / RMA Module

```text
Return Request

Approval

RMA

Return Label

Inspection

Refund

Exchange

Store Credit

Reason

Disposition
```

---

# 69. Warranty / Repairs / After-Sales

新增：

```text
Warranty

Serial Number

Warranty Period

Claim

Repair

Replacement

Spare Parts

Service Center

Repair Status
```

---

# 70. POS / Retail Module

如果品牌有：

```text
門市

Pop-up

展場

Warehouse Sale
```

需要：

```text
POS

Registers

Staff

Shift

Cash Drawer

Barcode

Receipt

In-store Return

Store Inventory

Customer Profile

Loyalty

Gift Card

Click & Collect

Ship from Store
```

Shopify POS 現行能力也已涵蓋 multi-location inventory、customer、orders、returns、gift cards 與 offline retail workflows。

---

# 71. Customer Self-Service Portal

客戶自己處理：

```text
Profile

Orders

Tracking

Returns

Tickets

Subscriptions

Invoices

Loyalty

Gift Cards

Consent

Addresses
```

---

# 72. CMS / Storefront Connectors

Business OS 不需要自己做所有 Storefront。

提供 Connector：

```text
WordPress

Shopify

Contentful

Sanity

Headless CMS

Custom Storefront
```

---

# 73. Payments Module

Taiwan：

```text
ECPay

NewebPay

TapPay

LINE Pay

街口
```

Global：

```text
Stripe

PayPal

Adyen

Local PSPs
```

---

# 74. Payment Data Model

區分：

```text
Authorization

Capture

Payment

Refund

Chargeback

Fee

Payout

Settlement
```

不要只存：

```text
order.payment_status
```

---

# 75. Fraud / Risk Module

新增：

```text
Payment Fraud

Account Takeover

Promo Abuse

Coupon Abuse

Referral Abuse

Return Fraud

Chargeback Risk

Velocity Rules

Blacklist

Allowlist

Manual Review
```

支付 Fraud Detection 應優先交給支付服務商處理原始卡片風險；例如 Stripe Radar 本身就提供 real-time fraud risk evaluation。

---

# 76. Finance Module

提供：

```text
Revenue

COGS

Gross Profit

Contribution Margin

Payment Fees

Marketplace Fees

Advertising Cost

Shipping Cost

Return Cost

Expenses

Payout

AR

AP

Cash Flow
```

---

# 77. Unit Economics

必須能算到：

```text
Order

SKU

Customer

Store

Marketplace

Country

Campaign
```

例如：

```text
Shopee Sale             1,000

COGS                     -400
Marketplace Fee           -80
Ads                       -50
Shipping                  -60
Payment Fee               -20
Return Reserve             -15

--------------------------------
Contribution Margin       375
```

---

# 78. Settlement Reconciliation

Marketplace 賣家非常需要：

```text
Expected Revenue

Marketplace Fee

Tax Withholding

Refund

Penalty

Ad Fee

Actual Payout

Bank Deposit
```

自動 reconciliation。

---

# 79. Accounting Module

後期自己做或 Connector。

```text
Chart of Accounts

Journal Entry

General Ledger

AR

AP

Trial Balance

P&L

Balance Sheet

Cash Flow Statement

Fixed Assets

Multi-Currency

Consolidation
```

---

# 80. Multi-Entity Finance

跨國企業需要：

```text
Legal Entity Accounting

Intercompany

Transfer

FX

Consolidation

Entity P&L
```

---

# 81. Accounting Connectors

```text
Xero

QuickBooks

NetSuite

SAP

ERP systems

Taiwan accounting software
```

---

# 82. Tax / Invoice Module

Taiwan：

```text
Taiwan e-Invoice

VAT / Business Tax

Credit Note

Allowance
```

Global：

```text
VAT

GST

Sales Tax

OSS

IOSS

Tax Exemption

Tax Jurisdiction
```

---

# 83. Cross-Border Trade Module

國際電商一定需要。

```text
HS Code

Country of Origin

Customs Value

Incoterms

DDP

DAP

Duties

Import Tax

Landed Cost

De Minimis

Commercial Invoice

Proforma Invoice

Customs Documents
```

HS Code 會直接影響關稅率與跨境 customs duties，因此應該是 Product Master Data 的正式欄位，而不是 shipping note。

---

# 84. Export / Trade Compliance

後期：

```text
Denied Party Screening

Sanctions Screening

Restricted Goods

Export Control

Import Restriction

Country Restriction
```

---

# 85. Product Compliance Module

新增：

```text
Safety Certifications

Test Reports

Responsible Person

Regulatory Claims

Labels

Warnings

Materials

Ingredients

Packaging Compliance

Country Requirements

Recall

Corrective Actions
```

---

# 86. Digital Product Passport — DPP

EU Market Pack 正式預留：

```text
Digital Product Passport

Unique Product Identifier

Commodity Code

Materials

Origin

Sustainability Data

Compliance Documents

Lifecycle Data

Registry Registration
```

EU DPP Registry 已於 **2026-07-20** 正式上線；其 Registry 保存 unique identifiers、registration data 與 high-level metadata，部分產品未來在進入 EU 市場前必須依適用規則完成註冊。

因此 DPP 應現在就納入 Product Compliance architecture。

---

# 87. Marketing Attribution

不要只記：

```text
Click
```

而要串：

```text
Ad

↓

Visit

↓

Lead

↓

Customer

↓

Order

↓

Refund

↓

Contribution Margin
```

才能真正知道：

```text
CAC

ROAS

MER

LTV

Contribution Profit
```

---

# 88. Advertising Connectors

```text
Meta Ads

Google Ads

TikTok Ads

LINE Ads

Amazon Ads

Shopee Ads

Lazada Ads

Pinterest Ads

X Ads
```

---

# 89. Analytics Module

共用 Metrics：

```text
Revenue

Gross Margin

Contribution Margin

AOV

LTV

CAC

ROAS

Conversion Rate

Repeat Purchase

Refund Rate

Return Rate

Inventory Turnover

Stockout Rate

First Response Time

Resolution Time

Customer Service Cost
```

---

# 90. Data Platform

Operational DB 與 Analytics 長期必須分離概念。

初期：

```text
PostgreSQL
```

即可。

未來：

```text
Operational DB

↓

Event Pipeline

↓

Warehouse / Lakehouse

↓

BI / AI
```

---

# 91. Data Governance

新增：

```text
Event Schema Registry

Tracking Plan

Data Contracts

Data Lineage

Data Owner

Data Quality

Schema Validation

Quarantine

PII Classification
```

避免：

> CRM 說 Revenue 是 A，
> Finance 說 Revenue 是 B，
> Analytics 說 Revenue 又是 C。

---

# 92. AI Control Plane

AI 不應該只是「呼叫 OpenAI API」。

建立正式：

# AI Control Plane

```text
Model Registry

Provider Registry

Prompt Registry

Prompt Versioning

Tool Registry

Knowledge Sources

Policies

Cost Budget

Latency Budget

Fallback Models

Caching

Observability
```

---

# 93. AI Providers

不要綁死：

```text
OpenAI

Anthropic

Google

OpenRouter

Local Models

Custom API
```

STT：

```text
OpenAI
Google
Deepgram
Other
```

TTS：

```text
OpenAI
ElevenLabs
Google
Azure
Other
```

---

# 94. AI Governance

商業產品必須加入：

```text
Evaluation

Golden Dataset

Regression Tests

Grounding Tests

Hallucination Checks

Red Team

Tool Permission Tests

Human Review

Audit Log

Cost Monitoring

Quality Monitoring
```

NIST 現行 GenAI Risk Management Profile 特別強調測試、fact checking、adversarial testing 與持續監控；2026 年新的 TEVV-Athlon draft 更明確延伸到 LLM、multimodal 與 agentic systems。

---

# 95. AI Action Safety

AI Tool 分：

```text
READ

LOW-RISK WRITE

HIGH-RISK WRITE
```

例如：

```text
Read Order
→ Automatic

Add Note
→ Automatic

Change Shipping Address
→ Confirmation

Refund
→ Approval

Change Bank Account
→ Forbidden
```

---

# 96. AI Agents

Agent 只認 Core Tools：

```text
search_customer()

get_orders()

get_order()

get_inventory()

search_products()

create_ticket()

send_message()

create_task()

add_tag()

create_campaign()
```

AI 不知道：

```text
Shopify API

Shopee API

WooCommerce API
```

那是 Connector 的工作。

---

# 97. Executive AI

例如：

> 為什麼日本本週營業額下降？

AI：

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
Customer Service
↓
Returns
↓
Finance
```

最後回答：

```text
Revenue -14.8%

Primary causes

1. Meta ROAS
   3.2 → 2.1

2. Top SKU
   Out of stock 3 days

3. Conversion
   3.8% → 3.2%

Estimated revenue loss
¥820,000
```

---

# 98. Agentic Commerce Gateway

這是 v2.0 新增的重要核心。

未來客戶不一定：

> 開 Google → 點網站 → 自己 Shopping。

而可能：

> 直接告訴 AI Agent：
> 幫我買某個商品。

因此新增：

# Agentic Commerce Gateway

支援：

```text
Product Discovery

Machine-readable Catalog

Offer Discovery

Availability

Price

Checkout

Order

Payment Intent

Order Status

Returns

Customer Account Linking
```

---

# 99. Agentic Commerce Protocols

架構預留：

```text
UCP

ACP

MCP

A2A

AP2 / Agent Payment compatibility

Merchant Product Feeds
```

Google 的 UCP 已在 2026 年正式推出，定位就是讓 consumer surfaces、businesses 與 payment providers 使用共同的 commerce primitives，並支援 API、A2A 與 MCP。

OpenAI 2026 年也已建立 Merchant Product Feed 規格與 ACP 驅動的商品探索體驗。

所以 AI Commerce Connector 應與：

```text
Amazon Connector

Shopee Connector

Shopify Connector
```

具有同等一級的產品地位。

---

# 100. Machine Customer Identity

未來需要區分：

```text
Human Customer

Agent acting for Customer
```

Agent Action 應保存：

```text
Human Principal

Agent

Permission

Intent

Mandate

Timestamp

Action

Payment Authorization
```

避免 AI Agent 成為無法追蹤的黑盒買家。

---

# 101. Developer Platform

如果要真正做到 LEGO：

> 不能永遠只有你自己寫 Connector。

必須提供：

```text
Connector SDK

Module SDK

CLI

API

Webhooks

Sandbox

Test Harness

Mock Data

Developer Docs
```

---

# 102. Connector Runtime

所有 Connector 共用：

```text
OAuth

Secrets

Token Refresh

Webhooks

Polling

Rate Limit

Retries

Circuit Breaker

Idempotency

Reconciliation

Health Check

Logging
```

---

# 103. Supported Connector Transports

不能假設全部都有 REST API。

支援：

```text
REST

GraphQL

Webhook

SFTP

CSV

EDI

Email Ingestion
```

讓 momo、PChome、傳統 ERP、供應商等也可以接。

---

# 104. Connector Manifest

例如：

```yaml
connector: shopee

category: commerce

regions:
  - TW
  - SG
  - MY
  - TH

capabilities:
  - commerce.orders
  - commerce.products
  - commerce.inventory
  - commerce.fulfillment

auth:
  type: oauth

transports:
  - REST
  - webhook
```

---

# 105. Module Manifest

例如：

```yaml
module: customer-service

provides:
  - conversations
  - tickets
  - inbox

consumes:
  - contacts
  - files

events:
  - message.received
  - ticket.created

permissions:
  - inbox.read
  - inbox.reply
  - ticket.manage

optional_dependencies:
  - crm
  - commerce
  - ai
```

---

# 106. Capability-Based Architecture

永遠不要：

```text
if platform == Etsy
```

而是：

```text
connector.supports(
    commerce.orders
)
```

例如 Etsy：

```text
✓ listings

✓ inventory

✓ orders

✓ shop

○ messaging
```

Amazon：

```text
✓ products

✓ orders

✓ fulfillment

✓ finance

✓ inventory

✓ reports
```

---

# 107. App Marketplace

使用者看到：

```text
App Marketplace
```

## Modules

```text
Customer Service

CRM

Marketing

Loyalty

Commerce

Marketplace Ops

Inventory

Finance

Social

Content Studio
```

## Connectors

```text
LINE

WhatsApp

Telegram

Amazon

Etsy

Shopee

Shopify

Stripe

Postiz
```

---

# 108. Third-Party Ecosystem

未來允許：

```text
Developer

↓

Build Connector

↓

Sandbox Test

↓

Certification

↓

Marketplace
```

收入可以：

```text
Free

Paid

Subscription

Revenue Share
```

---

# 109. Integration Health Command Center

```text
LINE
● Connected

WhatsApp
● Connected

Shopee
● Connected

Amazon
⚠ Rate Limited

Instagram
⚠ Token expires

Shopify
🔴 Webhook failure
```

提供：

```text
Webhook Logs

Sync Logs

Retry

Reconciliation

Dead Letter

Token Status

API Quota

Latency

Last Successful Sync
```

---

# 110. System Observability

內部：

```text
Logs

Metrics

Traces

Errors

Jobs

Queue

API Latency

Connector Latency

AI Latency

AI Cost

Database Health
```

---

# 111. Incident Management

系統異常：

```text
Connector Down

Payment Failure

Marketplace Sync Failure

Inventory Sync Delay

AI Provider Failure
```

建立：

```text
Incident

Severity

Owner

Timeline

Runbook

Resolution
```

---

# 112. Security

至少：

```text
Tenant Isolation

RBAC

Resource Permissions

2FA

SSO

API Keys

Service Accounts

OAuth Scopes

Secrets Management

Encryption

Audit

Backup

Data Export

Data Delete

Data Retention
```

---

# 113. Enterprise Security

未來：

```text
SAML

SCIM

IP Allowlist

Data Residency

Customer-managed Keys

Legal Hold

Audit Export

Private Networking

Custom Retention
```

---

# 114. SaaS Billing Module

因為這套系統本身也要販售。

需要自己的：

```text
Plans

Subscriptions

Trials

Seats

Modules

Connector Limits

Store Limits

Usage

Credits

Overage

Invoices

Dunning
```

---

# 115. Product Entitlements

例如：

```text
Starter

3 Users

1 Store

LINE

Basic Inbox
```

```text
Pro

10 Users

5 Stores

CRM

Marketing

Commerce
```

```text
Enterprise

Unlimited Stores

Advanced Permissions

SSO

AI Agents

Custom Connectors
```

Entitlement 系統不能寫死在 UI。

---

# 116. Usage Metering

可以計：

```text
Messages

AI Tokens

AI Voice Minutes

Storage

Orders Synced

Contacts

Connectors

API Calls

Agents
```

---

# 117. Market Packs

## Taiwan 🇹🇼

### Communication

```text
LINE

Messenger

Instagram

Telegram

WhatsApp

Email
```

### Commerce

```text
Shopee Taiwan

Coupang Taiwan

WooCommerce

Shopify

SHOPLINE

CYBERBIZ

91APP

momo

PChome

露天
```

### Payments

```text
ECPay

NewebPay

TapPay

LINE Pay

街口
```

### Logistics

```text
7-ELEVEN

FamilyMart

Hi-Life

黑貓

新竹物流

順豐
```

### Compliance

```text
Taiwan e-Invoice

Taiwan Privacy

Local Tax
```

---

# 118. USA Pack 🇺🇸

```text
Amazon

Walmart

eBay

Etsy

Shopify

TikTok Shop

Temu

Stripe

PayPal

Meta

Google

UPS

FedEx

USPS
```

---

# 119. Japan Pack 🇯🇵

```text
Amazon JP

Rakuten

Yahoo Shopping

Shopify

LINE

Instagram

X

Local Payments

Local Logistics

Japan Tax
```

---

# 120. Southeast Asia Pack

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

# 121. EU Pack 🇪🇺

```text
Amazon EU

eBay

Etsy

Zalando

Shopify

Meta

WhatsApp

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

# 122. Korea Pack 🇰🇷

```text
Coupang

Naver

Amazon / Cross-border

Kakao-related connectors where available

Local Payments

Local Logistics
```

---

# 123. Latin America Pack

```text
Mercado Libre

Amazon

Shopify

WhatsApp

Instagram

Local Payments

Local Logistics
```

---

# 124. Market Configuration

Market Pack 不只是 Connector list。

正式物件：

```text
Market

Country

Language

Locale

Timezone

Currency

Price Book

Tax

Product Assortment

Payment Methods

Shipping Methods

Legal Text

Return Policy

Compliance Rules
```

---

# 125. Localization System

支援：

```text
Translation Memory

Glossary

Brand Terms

Locale

Units

Date

Currency

Number Format

Market-specific Copy
```

AI Translation 必須尊重：

```text
Approved Product Terms
Brand Vocabulary
Legal Terms
```

---

# 126. Build vs Connect Principle

## 一定自己做

```text
Platform Core

Identity

Master Data

Event Bus

Automation

Permissions

Unified Inbox

Module System

Connector System

AI Orchestration

Search

Unified UI
```

## 很值得自己做

```text
Customer Service

CRM

Commerce Hub

Marketplace Ops

Analytics

AI Copilot
```

## 優先 Connect

```text
Social Publishing

Payments

Accounting

Shipping

Tax

Email Delivery

Marketplace Platforms

AI Providers

Ad Networks
```

---

# 127. Things NOT to Build Initially

第一階段不要：

```text
Full Accounting ERP

Full HR

Payroll

Recruiting

Own Social Publishing Engine

Own Payment Gateway

Own Shipping Network

Own LLM

Microservices

Full WMS

Central Inventory Sync

AI Phone Center
```

---

# 128. Core Data Model

核心至少包含：

```text
Organization

LegalEntity

Brand

Market

User

Team

Contact

Identity

Company

Product

SKU

Store

Warehouse

Conversation

Message

Ticket

Order

OrderItem

Payment

Shipment

Return

Task

Event

Connector

Module
```

---

# 129. Architecture Invariants

永遠遵守：

```text
MODULE != CONNECTOR

Contact != Platform User

Product != Platform Listing

Order != Platform-specific Order

Core does not depend on Module

Module does not depend on Connector

Connector declares Capabilities

Modules communicate through Events

AI only accesses permissioned Tools

External Platforms are replaceable
```

---

# 130. Development Roadmap

## Foundation — V0.0

先做：

```text
Organization

Contact

Identity

Event Bus

Connector Interface

Module Interface

Permissions

PostgreSQL
```

---

# 131. V0.1 — Internal Alpha

只做：

```text
LINE

WooCommerce

FluentCRM

Unified Inbox

Customer 360

Orders

AI Suggested Reply
```

目標：

```text
LINE

「我的訂單呢？」

↓

Identity

↓

Contact

↓

WooCommerce Order

↓

AI Suggestion

↓

Human Send
```

---

# 132. V0.2 — Daily Internal Use

新增：

```text
Tickets

Assignment

Search

FluentCRM Tags

Knowledge

AI Copilot

Audit
```

自己每天真的使用。

---

# 133. V0.5 — Beta

新增：

```text
Multi-Tenant

WhatsApp

Instagram

Messenger

Users / Roles

Setup Wizard

Connector Health
```

---

# 134. V0.7

新增：

```text
Shopify

Telegram

Email

Multi-Store Orders

AI Autopilot
```

---

# 135. V1.0 — Commercial Release

正式提供：

```text
Customer Service

CRM

Commerce Hub

AI Copilot

LINE

WhatsApp

Instagram

Messenger

Telegram

Email

WooCommerce

Shopify

Multi-Tenant

Billing

Permissions

Audit

Onboarding

Connector Health
```

---

# 136. V1.x — Taiwan Commerce Pack

加入：

```text
Shopee TW

Coupang TW

SHOPLINE

ECPay

NewebPay

Taiwan e-Invoice

Taiwan Logistics
```

---

# 137. V2.0 — Global Marketplaces

加入：

```text
Amazon

eBay

Etsy

Walmart

TikTok Shop

Lazada

Temu

Rakuten

Mercado Libre
```

以及：

```text
Marketplace Operations

PIM

Product Syndication

Listing Management
```

---

# 138. V2.x — Growth OS

加入：

```text
Marketing

Loyalty

Reviews

Affiliate

Creator

Postiz

Content Studio

Search

Merchandising

Experimentation
```

---

# 139. V3.0 — Operations

加入：

```text
OMS

Inventory

Demand Planning

Procurement

Supplier

Logistics

Returns

Warranty
```

---

# 140. V3.x — Finance & Global Trade

加入：

```text
Finance

Reconciliation

Accounting Connectors

Tax

Trade

Customs

DPP

Compliance
```

---

# 141. V4.0 — Intelligence

加入：

```text
Executive AI

Forecasting

Anomaly Detection

Recommendations

Agent Automation

Advanced Attribution
```

---

# 142. V4.x — Agentic Commerce

加入：

```text
UCP

ACP

Merchant Feeds

AI Shopping Agent Gateway

Agent Checkout

Machine Customer Identity
```

---

# 143. V5 — AI Voice & Autonomous Operations

加入：

```text
Voice AI

AI Phone

WhatsApp Call

Autonomous Agents

Human Escalation

Cross-module Agents
```

---

# 144. Product Experience

使用者不應該看到：

```text
100 Modules
200 Connectors
```

而應該先看到：

```text
What do you want to do?

☑ Sell Products
☑ Manage Customers
☑ Customer Service
☑ Marketing
☑ Social Media
☑ Manage Inventory
☑ Finance
```

---

# 145. Smart Onboarding

第一步：

```text
Where do you sell?

Taiwan
USA
Japan
Europe
SEA
```

第二步：

```text
Sales Channels

Shopee
Amazon
Etsy
Shopify
WooCommerce
```

第三步：

```text
Customer Channels

LINE
WhatsApp
Instagram
Telegram
```

系統自動組 LEGO。

---

# 146. Product Marketplace UX

例如：

```text
Your Business OS

Installed Modules

✓ Customer Service
✓ CRM
✓ Commerce
✓ AI

Add Module

[ Marketing ]
[ Social ]
[ Finance ]
[ Inventory ]
```

以及：

```text
Connected Platforms

✓ LINE
✓ Shopee
✓ WooCommerce

[ + Connect Platform ]
```

---

# 147. Product Positioning

產品不是：

> Omnichannel Inbox

也不是：

> ERP

也不是：

> Multi-channel Seller Tool

而是：

# **Composable AI Business OS for Global Commerce**

---

# 148. Core Value Proposition

```text
One Customer

One Identity

One Inbox

One Product Model

One Order View

One Data Model

One Event Layer

One Automation Layer

One AI Layer

Unlimited Modules

Unlimited Connectors
```

---

# 149. Closed Business Loop

最終完整流程：

```text
Advertising
↓
Lead
↓
CRM
↓
Marketing
↓
Content Studio
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
Review
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

所有資料留在同一個 Business Context。

---

# 150. Agentic Business Loop

未來再進一步：

```text
Business Event

↓

AI Agent

↓

Reason

↓

Use Core Tools

↓

Policy Check

↓

Human Approval if Required

↓

Execute

↓

Audit

↓

Measure Result
```

例如：

```text
SKU Stockout Risk
↓
AI Agent
↓
Forecast Demand
↓
Check Supplier
↓
Draft Purchase Order
↓
Manager Approval
↓
Send Supplier
```

---

# 151. Final Product Philosophy

目標不是：

> **「我的系統什麼都有。」**

而是：

> **「任何企業能力都能插進我的系統，而且插進來後可以共享 Identity、Data、Events、Automation、Permissions 和 AI。」**

---

# 152. LEGO Test

任何 Module 都必須通過：

### Remove Test

拔掉它：

> Core 還能正常運作嗎？

### Replace Test

換另一個：

> 系統還能正常運作嗎？

例如：

```text
WooCommerce
↓
Remove
↓
Shopify
```

不用重寫 Commerce Core。

---

# 153. Connector Test

Connector 必須：

```text
Self-contained

Capability-based

Versioned

Observable

Retryable

Replaceable
```

---

# 154. AI Test

AI Provider：

```text
OpenAI
↓
Remove
↓
Anthropic
```

Business Logic 不應重寫。

---

# 155. Commerce Test

```text
Shopee
↓
Amazon
↓
Etsy
```

核心只看：

```text
Order

Product

Customer

Inventory
```

而不是 platform-specific schema。

---

# 156. Final Architecture

```text
                         COMPOSABLE
                      AI BUSINESS OS

                              │

       ┌──────────────────────┼──────────────────────┐
       │                      │                      │

     CORE                  MODULES              CONNECTORS

       │                      │                      │

Organization            Customer Service       LINE
Legal Entity            CRM                    WhatsApp
Identity                CDP                    Telegram
Master Data             Marketing              Instagram
Consent                 Loyalty                Messenger
Permissions             Reviews                Amazon
Events                  Social                 Shopee
Automation              Content                Etsy
Policy                  PIM                    Shopify
Tasks                   Commerce               WooCommerce
Approvals               Marketplace Ops        Temu
Knowledge               Pricing                Stripe
Search                  B2B                    ECPay
Documents               Subscription           Postiz
Audit                   OMS                    Logistics
Data                    Inventory              Accounting
Developer Platform      Procurement            AI Providers
AI Control Plane        Logistics
                        Finance
                        Compliance
                        Analytics

       │                      │                      │
       └──────────────────────┼──────────────────────┘

                              ↓

                    AGENTIC COMMERCE

                 UCP / ACP / MCP / A2A

                              ↓

                     INTELLIGENCE

         Copilot / Agents / Voice / BI / Forecast

                              ↓

                        EXECUTIVE AI
```

---

# 157. Final Definition

> **Composable AI Commerce OS**
>
> 一套可以把客服、CRM、CDP、行銷、社群、圖文影音、PIM、電商平台、Marketplace、B2B、POS、訂單、庫存、供應鏈、物流、支付、財務、會計、跨境法規、AI 與未來 AI Commerce Agent，像 LEGO 一樣自由組裝的全球商業作業系統。

---

# 158. Development North Star

現在開始開發後，每次新增功能都只問三件事：

### 1.

這應該是：

```text
Core
Module
Connector
```

哪一種？

### 2.

它拔掉之後：

> 其他 Module 是否仍然正常？

### 3.

它換成另一個 Provider：

> Core 是否完全不需要重寫？

三個答案都正確，才符合這個產品架構。

---

# 159. Ultimate Vision

最終使用者不需要每天：

```text
開 LINE
開 Shopee
開 Amazon
開 Shopify
開 FluentCRM
開 Postiz
開 Meta
開 Stripe
開物流
開會計
開 Analytics
```

而是：

```text
                Business OS
                     │
                     ↓
                  Ask AI

「今天公司有什麼需要我處理？」
```

AI 回答：

```text
今天有 7 件需要注意：

1. Amazon US Top SKU 預計 4 天後缺貨。
2. 台灣 Shopee 有 3 筆高風險延遲訂單。
3. LINE 有 2 位 VIP 客戶等待真人回覆。
4. Meta ROAS 昨日起下降 22%。
5. Etsy 商品 ABC listing 被拒，需要補 material 資訊。
6. 日本本週退款率高於平均 1.8 倍。
7. Supplier A 的 PO #1838 明天逾期。

建議優先處理：
Amazon 庫存與 Shopee 延遲訂單。
```

這才是這個產品最後真正要成為的東西：

# **AI Operating System for Global Commerce**

---

**End of Master Blueprint**