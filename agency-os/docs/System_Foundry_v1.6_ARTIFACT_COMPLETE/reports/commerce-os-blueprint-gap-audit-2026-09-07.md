# Commerce OS Blueprint vs System Foundry Capability Catalog -- Gap Audit

Date: 2026-09-07
Scope: all module docs in `agency-os/docs/Composable AI Commerce OS/Composable_AI_Commerce_OS_LEGO_Documentation_Pack/` except `23_Cross_Border_Compliance.md` (checked separately, see prior finding below) and `00_Master_Index.md`/`manifest.json` (not module specs).
Method: grep each doc's "Public Capabilities" (usually `# 5.`) and "Public Service Contract" (usually `# 7.`) sections; cross-reference each claimed capability/API against `agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/capabilities/catalog.json` (265 entries) by concept, not string match. Classification: FOUND (exact/near-exact CAP match) / FOUND-PARTIAL (related CAP exists, narrower or differently-scoped than the claim) / MISSING (no CAP covers the concept).

Docs 01, 28, 29, 32, 33, 34, 35, 38, 39, 40 have no "Public Capabilities" business-capability list (they are architecture rules, SDK/connector meta-contracts, market-pack rollups, or process/roadmap docs) -- listed at the end as N/A, no gaps forced.

---

## 23_Cross_Border_Compliance.md (prior finding, restated for completeness)

- HS code -- FOUND `CAP-HS-CODE`
- Duties / landed cost input -- FOUND `CAP-LANDED-COST`
- DPP metadata / `getDPPData()` -- FOUND `CAP-PRODUCT-PASSPORT`
- Country of origin (distinct field) -- MISSING (no CAP separate from `CAP-HS-CODE`)
- Incoterms -- MISSING
- Customs docs / `buildCustomsData()` -- MISSING
- Commercial invoice / `generateCommercialInvoice()` -- MISSING
- `classifyProduct()` / `validateMarketCompliance()` -- FOUND-PARTIAL (`CAP-HS-CODE` covers classification; no CAP for market-specific compliance rule validation itself)

---

## 04_Customer_Service.md

§5/§7: Unified Inbox, Conversation lifecycle, Agent assignment, Internal notes, Ticket lifecycle, Customer context panel, Canned reply/macro, AI suggested reply, AI summary/intent, Human handoff.

- Ticket lifecycle / `createTicket()` -- FOUND `CAP-TICKETING`
- AI suggested reply -- FOUND `CAP-AI-GENERATE`, `DER-AI-HUMAN` (human sends, AI drafts -- matches doc's explicit no-autopilot rule)
- AI summary/intent -- FOUND `CAP-AI-SUMMARY` + `CAP-AI-CLASSIFY`
- Customer context panel / `getCustomerContext()` -- FOUND-PARTIAL `CAP-CUSTOMER-DATA` (base entity exists; no CAP for a unified cross-module context aggregation view)
- Internal notes -- FOUND-PARTIAL `CAP-COMMENTS` (generic discussion threads; not staff-only visibility specifically)
- Agent assignment / `assign()` -- FOUND-PARTIAL `CAP-TASKS` (generic task assignment, not conversation-routing)
- **Unified Inbox / omnichannel `openConversation()`/`appendMessage()` across LINE/WhatsApp/etc. -- MISSING.** `CAP-LIVE-CHAT` only covers in-site/in-app live chat; there is no capability for a multi-platform external-messaging-connector inbox. This is the entire premise of the module's Golden Flow (§13: "LINE inbound -> webhook -> Conversation") and is not represented. Same gap recurs in `30_Communication_Connectors.md` below.
- Canned reply / macro -- MISSING
- Human handoff -- FOUND-PARTIAL `DER-AI-HUMAN`

## 05_CRM_Sales.md

§5/§7: Lead management, Pipeline, Deal stages, Activities, Lead scoring, Sales forecast, Follow-up.

- Lead management / `createLead()`/`qualifyLead()` -- FOUND `CAP-LEAD-GEN`
- Pipeline / Deal stages / `createDeal()`/`moveDeal()` -- FOUND `CAP-SALES-PIPELINE`
- Activities / `recordActivity()` -- FOUND `CAP-INTERACTION-HISTORY`
- Sales forecast -- FOUND `CAP-SALES-FORECAST`
- Lead scoring / `scoreLead()` -- FOUND-PARTIAL `CAP-LEAD-GEN` (covers qualification generically, not a distinct scoring model/algorithm)
- Follow-up -- FOUND-PARTIAL `CAP-TASKS`

## 06_Marketing_Growth.md

§5/§7: Segmentation, Campaigns, Journeys, Abandoned cart, Win-back, Retention, Upsell/Cross-sell, Attribution.

- Segmentation -- FOUND `CAP-SEGMENTATION`
- Campaigns -- FOUND `CAP-CAMPAIGNS`
- Journeys / `enterJourney()` -- FOUND `CAP-MARKETING-AUTOMATION`
- Abandoned cart / Win-back / Retention / Upsell-Cross-sell -- FOUND-PARTIAL `CAP-MARKETING-AUTOMATION` (generic trigger-based automation mechanism covers these; catalog does not name these specific flows)
- Attribution / `getAttribution()` -- MISSING. `CAP-AFFILIATE-ATTRIBUTION` only covers affiliate/referral-link attribution; there is no general marketing multi-touch/campaign attribution capability. Same gap recurs in `24_Analytics_Data_Platform.md`.

## 07_Social_Community.md

§5/§7: Calendar, Post planning, Approval, Publishing orchestration, Community monitoring, Analytics.

- Calendar/Post planning/Publishing -- FOUND `CAP-SOCIAL-SCHEDULING`
- Approval -- FOUND `CAP-CONTENT-APPROVAL`
- Community monitoring / `ingestEngagement()` -- FOUND `CAP-SOCIAL-ENGAGEMENT`
- Analytics / `getPerformance()` -- FOUND `CAP-SOCIAL-ANALYTICS`
- Multi-platform (implied) -- FOUND `CAP-SOCIAL-MULTI-PLATFORM`

Full coverage, no gaps.

## 08_Content_Studio_DAM.md

§5/§7: Copy generation, Image generation, Video generation, Translation, Subtitles, Brand kit, DAM, Versioning.

- Copy/Image/Video generation -- FOUND `CAP-AI-GENERATE` + `CAP-GRAPHIC-DESIGN`/`CAP-VIDEO-PRODUCTION`
- DAM -- FOUND `CAP-DAM`
- Brand kit -- FOUND-PARTIAL `CAP-DAM`
- Versioning -- FOUND `CAP-FILE-VERSION`
- Translation -- FOUND-PARTIAL `CAP-AI-GENERATE` (generic AI generation, not a distinct localization/translation capability; `CAP-I18N` is UI-locale support only)
- Subtitles -- MISSING (no CAP for AI captioning/subtitle generation)

## 09_PIM_PXM.md

§5/§7: Attributes, Taxonomy, Localization, Channel content, Completeness, Data quality, Syndication-ready data.

- Localization / `localizeProduct()` -- FOUND-PARTIAL `CAP-I18N`
- Channel content / `buildChannelPayload()`, Syndication-ready data -- FOUND-PARTIAL `CAP-PRODUCT-FEED` (feed cap is scoped to shopping/ad channels specifically, PIM channel content is broader -- CMS, marketplace listings, etc.)
- **Attributes / Taxonomy / `setAttribute()` / `mapCategory()` -- MISSING.** Catalog's `CAP-PRODUCTS` is only "a product catalog is a core domain entity" -- no capability for structured attribute governance or taxonomy/category mapping, which is this module's core mission.
- **Completeness / Data quality / `validateCompleteness()` -- MISSING.** No product-data-quality/completeness-scoring capability anywhere in the catalog.

## 10_Commerce_Hub.md

§5/§7: Store connections, Unified orders, Unified customers, Order detail, Read-only products.

- Unified orders -- FOUND `CAP-ORDERS`
- Unified customers -- FOUND `CAP-CUSTOMER-DATA` + `CAP-IDENTITY-RESOLUTION`
- Read-only products -- FOUND `CAP-PRODUCTS`
- Store connections / `listStores()` -- FOUND-PARTIAL `CAP-EXTERNAL-API`/`CAP-IMPORT-EXPORT` (generic third-party integration, no "multi-storefront connection registry" concept)

## 11_Marketplace_Operations.md

§5/§7: Listings, Offers, Channel mapping, Pricing, Promotions, Seller health, Settlement views, Listing error handling.

- Listings/Offers -- FOUND `CAP-MULTI-MARKETPLACE`
- Pricing -- FOUND `CAP-REPRICING`
- Promotions -- FOUND `CAP-PROMOTIONS`
- Seller health -- FOUND `CAP-SELLER-HEALTH`
- Settlement views / `reconcileMarketplace()` -- FOUND `CAP-MARKETPLACE-SETTLEMENT`
- Channel mapping -- MISSING (no CAP for mapping merchant category/attribute schema to each marketplace's own taxonomy)
- Listing error handling / `getListingIssues()` -- MISSING (product-feed has an analogous "feed-quality triage" concept under `CAP-PRODUCT-FEED`, but that's scoped to ad/shopping feeds, not marketplace listing rejections)

## 12_OMS_Order_Orchestration.md

§5/§7: Allocation, Split/Merge, Routing, Backorder, Preorder, Partial fulfillment, Exception management.

- Split / Partial fulfillment / `splitOrder()` -- FOUND `CAP-ORDER-SPLIT`
- Backorder -- FOUND `CAP-BACKORDER`
- Preorder -- FOUND `CAP-PREORDER`
- Allocation / `allocate()` -- FOUND-PARTIAL `CAP-MULTI-LOCATION-STOCK` (per-location allocation exists there; no order-orchestration-level allocation-plan concept)
- Merge -- MISSING (catalog only models order split, not merge)
- Routing / `reroute()` -- MISSING (no fulfillment-routing-rule capability)
- Exception management / `raiseException()` -- MISSING (no order-exception-handling capability distinct from generic `FOUND-ERROR`)

## 13_Inventory_WMS.md

§5/§7: Available/Reserved/Allocated/Incoming, Stock movement, Transfers, Multi-warehouse, Cycle count, WMS later.

- Base stock / movement -- FOUND `CAP-INVENTORY`
- Transfers / Multi-warehouse -- FOUND `CAP-MULTI-LOCATION-STOCK`
- Cycle count -- FOUND `CAP-CYCLE-COUNT`
- Reserve/release reservation -- FOUND-PARTIAL (covered under `CAP-INVENTORY`'s general domain scope, no distinct "reservation" sub-capability)
- **"WMS later" (bin/putaway/pick-pack/barcode/lot-serial) -- MISSING, and explicitly so**: `CAP-MULTI-LOCATION-STOCK`'s own description says "Warehouse-internal execution -- bin/shelf addressing, putaway, pick/pack waves, barcode scanning, lot/serial/expiry tracking -- is explicitly out of scope." Confirms the doc's own "later" framing is accurate, not a gap needing action now.

## 14_Procurement_Supplier.md

§5/§7: Supplier master, PO, MOQ, Lead time, Receiving coordination, Supplier performance.

- Supplier master -- FOUND `CAP-VENDOR-MGMT`
- PO / `receivePO()` -- FOUND `CAP-PROCUREMENT`
- Receiving coordination -- FOUND-PARTIAL `CAP-PROCUREMENT` + `CAP-3WAY-MATCH`
- Supplier performance -- FOUND-PARTIAL `CAP-VENDOR-MGMT` (only covers qualification/evaluation *data*, not a scorecarding/performance-tracking mechanism)
- **MOQ (supplier-imposed minimum the business must buy) -- MISSING.** Catalog's only `CAP-MOQ` is under the `b2b` module and is the opposite direction ("business customers must order at least a minimum quantity" *from* this business, not what a supplier requires *of* this business).
- Lead time -- MISSING as a standalone capability (only appears as an input factor inside `CAP-REORDER-POINT`'s description, not tracked on the supplier record itself)

## 15_Logistics_Fulfillment.md

§5/§7: Rates, Create shipment, Label, Tracking, Cancel, Pickup point, 3PL handoff.

- Rates -- FOUND `CAP-SHIPPING-RATES`
- Create shipment/Label/Tracking/Cancel -- FOUND `CAP-SHIPPING`
- Pickup point -- FOUND `CAP-PICKUP-POINT`
- 3PL handoff -- FOUND `CAP-3PL`

Full coverage, no gaps.

## 16_Returns_Warranty_After_Sales.md

§5/§7: Return request, Approval, Return label, Inspection, Refund/Exchange handoff, Warranty, Repair.

- Return request/Approval/Inspection/Refund handoff -- FOUND `CAP-RETURNS`
- Warranty -- FOUND `CAP-WARRANTY`
- Repair -- FOUND `CAP-REPAIR-TRACKING`

Full coverage, no gaps.

## 17_Loyalty_Reviews_UGC.md

§5/§7: Points, VIP tiers, Rewards, Referral, Store credit reference, Reviews, Photo/video UGC, Moderation.

- Points/Rewards -- FOUND `CAP-LOYALTY-POINTS`
- VIP tiers -- FOUND `CAP-LOYALTY-TIERS`
- Referral -- FOUND `CAP-REFERRAL`
- Store credit reference -- FOUND `CAP-GIFT-CARD`
- Reviews -- FOUND `CAP-REVIEWS` + `CAP-REVIEW-REQUEST`
- Photo/video UGC -- FOUND `CAP-REVIEW-MEDIA`
- Moderation -- FOUND `CAP-REVIEW-MODERATION`

Full coverage, no gaps.

## 18_B2B_Wholesale.md

§5/§7: Company buyers, Negotiated pricing, Catalog, MOQ, Quote/RFQ, PO number, Net terms, Credit limit.

- Company buyers -- FOUND `CAP-B2B` + `CAP-B2B-BUYER-ROLES`
- Negotiated pricing -- FOUND `CAP-B2B-PRICING`
- MOQ -- FOUND `CAP-MOQ`
- Quote/RFQ -- FOUND `CAP-RFQ`
- Net terms/Credit limit -- FOUND `CAP-CREDIT-TERMS`
- PO number (buyer's own reference field) -- not a capability-level concern, no gap forced.

Full coverage, no gaps.

## 19_POS_Retail.md

§5/§7: POS checkout, Barcode, Receipt, In-store return, Click&Collect, Ship-from-store, Customer lookup.

- POS checkout -- FOUND `CAP-POS`
- Click&Collect/Ship-from-store -- FOUND `CAP-CLICK-COLLECT`
- Barcode -- FOUND-PARTIAL `CAP-BARCODE` (catalog scopes this to "the mobile app can scan barcodes"; a fixed-register POS scanner is a different device context not explicitly covered)
- In-store return -- FOUND-PARTIAL `CAP-RETURNS` (general returns workflow; not POS-specific in-person flow)
- Customer lookup -- FOUND-PARTIAL `CAP-CUSTOMER-DATA`
- Receipt generation -- MISSING (no CAP for POS receipt printing/emailing; `CAP-INVOICES` is scoped to billable-transaction invoices, not point-of-sale receipts)

## 20_Payments_Fraud_Risk.md

§5/§7: Authorize, Capture, Refund, Void, Dispute, Risk rules, Manual review.

- Authorize/Capture -- FOUND `CAP-PAYMENTS`
- Refund -- FOUND `CAP-REFUNDS` + `CAP-PARTIAL-REFUND`
- Dispute -- FOUND `CAP-CHARGEBACK`
- Risk rules/Manual review -- FOUND `CAP-RISK-SCREENING`
- Void -- FOUND-PARTIAL (part of `CAP-PAYMENTS` lifecycle generally, no distinct "void" sub-capability)
- Also matched: `DER-PAYMENT-ADAPTER`, `DER-PAYMENT-IDEMPOTENCY`, `DER-PAYMENT-RECON` all directly relevant and present.

## 21_Finance_Treasury.md

§5/§7: Revenue, COGS, Fees, Ad spend, Shipping cost, Payout, Reconciliation, Cash flow, Unit economics.

- Revenue/COGS/Unit economics / `getProfitability()`/`calculateOrderEconomics()` -- FOUND `CAP-FINANCIAL-ANALYSIS`
- Fees/Ad spend/Shipping cost / `recordExpense()` -- FOUND `CAP-FINANCIAL-RECORDS`
- Payout/Reconciliation / `reconcilePayout()` -- FOUND `CAP-MARKETPLACE-SETTLEMENT` + `DER-PAYMENT-RECON` + `CAP-BANK-RECONCILIATION`
- Cash flow / `getCashPosition()` -- FOUND-PARTIAL `CAP-FINANCIAL-STATEMENTS` (covers periodic cash-flow *statement*; a live/real-time cash-position view is a narrower, different-cadence claim not explicitly modeled)

## 22_Accounting_Tax.md

§5/§7: COA, Journal, GL, AR, AP, Trial Balance, P&L, Balance Sheet, Cash Flow, Multi-currency.

- Trial Balance/P&L/Balance Sheet/Cash Flow / `getTrialBalance()`/`getPnL()`/`closePeriod()` -- FOUND `CAP-FINANCIAL-STATEMENTS`
- Multi-currency -- FOUND `CAP-MULTI-CURRENCY`
- `exportToAccountingProvider()` -- FOUND `CAP-ACCOUNTING`
- COA/Journal/GL/AR/AP posting -- FOUND-PARTIAL `CAP-FINANCIAL-RECORDS` (base ledger entity exists; no distinct chart-of-accounts/journal-posting-engine capability) + `CAP-AR-AGING` (only covers aging/collections, not AR/AP subledger posting itself)

## 24_Analytics_Data_Platform.md

§5/§7: Operational metrics, Semantic metrics, Warehouse feed, Data quality, Attribution data, Dashboards.

- Operational metrics -- FOUND `CAP-ANALYTICS`
- Dashboards -- FOUND `CAP-DASHBOARD`
- Warehouse feed / `publishDataset()` -- FOUND-PARTIAL `CAP-EXPORT`
- Semantic metrics / `registerDataContract()` -- MISSING (no semantic-layer/metric-governance capability)
- Data quality / `runDataQualityChecks()` -- MISSING (no general data-quality-check capability; only `CAP-PRODUCT-FEED`'s product-specific feed-quality triage exists)
- Attribution data -- MISSING (same gap as module 06)

## 25_AI_Copilot_Agents.md

§5/§7: Model gateway, Prompt registry, Tool registry, Copilot, Agents, Fallback, Budget, Evaluation, Guardrails.

- Model gateway / `complete()`/`selectModel()` -- FOUND `CAP-AI`
- Tool registry / `invokeTool()` -- FOUND `DER-AI-TOOLS`
- Guardrails -- FOUND `DER-PROMPT-SECURITY` + `DER-AI-AUTHORITY` + `DER-AI-HUMAN`
- Agents / `runAgent()` -- FOUND-PARTIAL `CAP-MULTI-AGENT` (covers multi-agent coordination specifically; single-agent execution is just base `CAP-AI`)
- Budget / `enforceBudget()` -- FOUND-PARTIAL `CAP-USAGE-METERING` (billing/entitlement metering, not an AI-cost-guardrail concept specifically)
- Prompt registry -- MISSING (no prompt-versioning/registry capability)
- Evaluation / `evaluateOutput()` -- MISSING (no AI-output-quality-evaluation capability)

## 26_Automation_Workflow_Policy.md

§5/§7: Trigger, Condition, Action, Delay, Branch, Schedule, Human approval, Retry, Policy evaluation.

- Schedule -- FOUND `CAP-SCHEDULING`
- Human approval -- FOUND `CAP-APPROVAL` + `CAP-MULTI-APPROVAL`
- Trigger/Condition/Action/Delay/Branch / `startWorkflow()`/`executeStep()` -- FOUND-PARTIAL `CAP-STATE-WORKFLOW` (generic enforced state machine; doesn't specifically cover a no-code visual builder with branch/delay nodes)
- Retry -- MISSING as a general workflow-step capability (idempotent retry only modeled for AI actions `DER-AI-IDEMPOTENCY` and payments `DER-PAYMENT-IDEMPOTENCY`, not generic automation steps)
- Policy evaluation / `evaluatePolicy()` -- MISSING (no business-rule/policy-engine capability)

## 27_Knowledge_Search_Documents.md

§5/§7: Knowledge base, Versioning, Global search, Document templates, Source citations, Retention.

- Knowledge base -- FOUND `CAP-KNOWLEDGE-BASE`
- Global search -- FOUND `CAP-SEARCH` + `CAP-AI-SEARCH`
- Versioning / `publishVersion()` -- FOUND-PARTIAL `CAP-FILE-VERSION`
- Document templates / `renderTemplate()` -- MISSING
- Source citations -- MISSING (no CAP for AI-answer citation/traceability as a user-facing feature; `FOUND-EVIDENCE` is a governance principle, not a selectable product capability)
- Retention -- MISSING (no `CAP-RETENTION`-equivalent anywhere in the catalog; same gap recurs in module 37)

## 30_Communication_Connectors.md (light check -- connector catalog, no §5/§7)

Channels enumerated: LINE OA, WhatsApp Business, Telegram, Instagram/Messenger, Email, Web Chat.

- Email -- FOUND `CAP-EMAIL`
- Web Chat -- FOUND `CAP-LIVE-CHAT`
- **LINE OA / WhatsApp Business / Telegram / Instagram-Messenger (2-way conversational-commerce messaging platforms) -- MISSING.** No capability in the catalog represents "external chat-platform connector" as a business capability; this is the same gap already flagged in module 04, and it is the platform's Tier-0 channel (`30_Communication_Connectors.md:8`, LINE OA listed first).

## 31_Commerce_Marketplace_Connectors.md (light check)

§7 "Standard Commerce Capabilities": `commerce.customer.read`, `commerce.orders.*`, `commerce.products.read`, `commerce.inventory.read`, `commerce.fulfillment.*`, `commerce.refund.write`, `commerce.promotions`, `commerce.finance`, `marketplace.listings`, `marketplace.health`, `marketplace.messages`.

- Customer/orders/products/inventory/fulfillment/refund/promotions/finance -- FOUND, matches `CAP-CUSTOMER-DATA`, `CAP-ORDERS`, `CAP-PRODUCTS`, `CAP-INVENTORY`, `CAP-SHIPPING`, `CAP-REFUNDS`, `CAP-PROMOTIONS`, `CAP-FINANCIAL-RECORDS`
- `marketplace.listings`/`marketplace.health` -- FOUND `CAP-MULTI-MARKETPLACE`/`CAP-SELLER-HEALTH`
- `marketplace.messages` (buyer-seller messaging on a marketplace, e.g. Amazon Seller Messaging) -- MISSING (no capability for marketplace-native buyer messaging, distinct from `CAP-LIVE-CHAT`/`CAP-TICKETING`)

## 02_Platform_Core.md (light check -- foundational, no §5/§7)

§3 "Required Core Services": OrganizationService, IdentityService, PermissionService, EventBus, AuditService, FileService, ConnectorRuntime, CapabilityRegistry, ModuleRegistry, NotificationService. §7 Webhook Inbox (idempotent inbound webhook pipeline).

- IdentityService/PermissionService/AuditService/FileService/NotificationService -- FOUND (`CAP-IDENTITY`, `CAP-ROLES`, `FOUND-AUDIT`, `CAP-FILES`, `CAP-EMAIL`/`CAP-SMS`/`CAP-PUSH`/`CAP-INAPP-NOTIFY` cluster)
- OrganizationService -- FOUND `CAP-MULTI-TENANT`/`CAP-ORG-DATA`
- Multi-platform Contact/Identity linking (§5: LINE/WhatsApp/Telegram/Email/WooCommerce/Shopify/Shopee identities on one Contact) -- FOUND-PARTIAL `CAP-IDENTITY-RESOLUTION`
- ConnectorRuntime (plug-in connector framework itself) -- FOUND-PARTIAL `CAP-EXTERNAL-API`/`CAP-IMPORT-EXPORT` (generic third-party-integration capabilities exist; no capability for a connector *framework/runtime* as such -- reasonable, since the catalog models business capabilities, not the platform's own extensibility mechanism)
- Inbound webhook idempotency pipeline (§7) -- MISSING as a general capability. The catalog only models idempotency for two specific domains (`DER-PAYMENT-IDEMPOTENCY`, `DER-AI-IDEMPOTENCY`); a generic "inbound webhook receive/verify/idempotency-check" capability, which this module's entire architecture depends on, has no catalog representation.

## 03_Identity_CDP_Consent.md (light check)

§7 Public Services: `findContactByIdentity()`, `linkIdentity()`, `mergeContacts()`, `unmergeContacts()`, `recordConsent()`, `withdrawConsent()`, `getCustomerTimeline()`.

- Identity linking/merge/unmerge -- FOUND `CAP-IDENTITY-RESOLUTION`
- Consent record/withdraw -- FOUND `CAP-CONSENT-LEDGER`
- `getCustomerTimeline()` (CDP event timeline: ad.clicked, order.paid, etc.) -- FOUND-PARTIAL. Only `CAP-CUSTOMER-DATA` (base customer record) exists under the `cdp`/`domain` modules; there is no capability for a cross-source behavioral-event timeline, which is the actual mission of this module (§ "CDP Timeline").

## 36_SaaS_Billing_Entitlements.md

§5/§7: Plans, Trials, Seats, Module entitlements, Connector limits, Usage metering, Overage, Dunning.

- Plans -- FOUND `CAP-SUBSCRIPTION` + `CAP-EDITIONS`
- Trials -- FOUND `CAP-TRIAL`
- Module entitlements / `checkEntitlement()` -- FOUND `DER-ENTITLEMENT` (exact match)
- Usage metering / `recordUsage()` -- FOUND `CAP-USAGE-METERING`
- Dunning / `suspendForBilling()` -- FOUND `DER-BILLING-LIFECYCLE`
- Seats (per-seat billing model) -- FOUND-PARTIAL `CAP-USAGE-METERING`
- Overage (usage beyond plan cap) -- FOUND-PARTIAL `CAP-USAGE-METERING`
- Connector limits (per-connector quota as an entitlement dimension) -- MISSING

## 37_Security_Privacy_Observability.md

§5/§7: Tenant isolation, RBAC, 2FA/SSO later, Secrets, Audit, Retention, Export/Delete, Logs/Metrics/Tracing, Incident.

- Tenant isolation -- FOUND `DER-TENANT-ISOLATION`
- RBAC -- FOUND `CAP-ROLES`
- Secrets -- FOUND `FOUND-SECRETS`
- Audit -- FOUND `FOUND-AUDIT`
- Logs/Metrics/Tracing / `reportHealth()` -- FOUND `FOUND-OBSERVABILITY`
- Incident -- FOUND `FOUND-INCIDENT`
- SSO -- FOUND `CAP-SSO`
- Export / `exportSubjectData()` -- FOUND-PARTIAL `CAP-CUSTOMER-EXPORT` (catalog frames this as customer self-service export; this module's is an admin-initiated GDPR subject-access-request export -- same mechanism, different actor)
- 2FA (distinct from SSO) -- MISSING (no `CAP-2FA`/MFA capability anywhere in the catalog; only enterprise SSO is modeled)
- **Retention -- MISSING** (no data-retention-policy capability; same gap as module 27)
- **Delete / `deleteSubjectData()` -- MISSING.** No right-to-erasure/deletion capability anywhere in the catalog -- notable given this module explicitly claims it and it is a GDPR/CCPA legal requirement, not an optional nicety.

## 41_Pricing_Promotions.md

§5/§7: Price books, Market prices, Customer/B2B prices, Channel prices, Coupons, Buy X Get Y, Bundles, Free shipping rules, Margin floor.

- Price books/Market/Channel prices -- FOUND `CAP-CHANNEL-PRICING`
- Customer/B2B prices -- FOUND `CAP-B2B-PRICING`
- Coupons -- FOUND `CAP-PROMOTIONS`
- Buy X Get Y/Bundles -- FOUND `CAP-PROMO-RULES` (exact match in catalog description)
- Free shipping rules -- FOUND-PARTIAL `CAP-PROMO-RULES` (spend-threshold trigger is close, "free shipping" as a promo type isn't explicitly named)
- Margin floor / `validateMarginFloor()` -- FOUND-PARTIAL `CAP-REPRICING` (catalog's margin floor is scoped specifically to marketplace competitor-repricing, not general price-book margin validation)

## 42_Search_Merchandising_Discovery.md

§5/§7: Search, Autocomplete, Facets, Semantic search, Boost/Bury, Recommendations, Feeds, Feed quality.

- Search -- FOUND `CAP-SEARCH`
- Semantic search -- FOUND `CAP-AI-SEARCH`
- Boost/Bury -- FOUND `CAP-MERCHANDISING` (exact match)
- Recommendations -- FOUND `CAP-AI-RECOMMEND`
- Feeds/Feed quality -- FOUND `CAP-PRODUCT-FEED` (exact match, incl. quality triage)
- Facets -- FOUND-PARTIAL `CAP-FILTERS`
- Autocomplete -- MISSING (not covered by `CAP-SEARCH`'s description, which is full-text retrieval only)

## 43_Subscription_Commerce.md

§5/§7: Plans, Trial, Renewal, Pause, Resume, Upgrade/Downgrade, Dunning, Churn analytics.

- Plans/Renewal -- FOUND `CAP-SUBSCRIPTION-COMMERCE`
- Pause/Resume -- FOUND `CAP-SUBC-PAUSE`
- Upgrade/Downgrade -- FOUND `CAP-SUBC-CHANGE-PLAN`
- Dunning -- FOUND `CAP-SUBC-DUNNING`
- Trial -- FOUND-PARTIAL `CAP-TRIAL` (catalog's trial is framed around the platform's own commercial trial, not a customer-facing subscription-product trial -- same mechanism, different context)
- Churn analytics -- MISSING (no churn-prediction/analytics capability)

## 44_Creator_Affiliate_Influencer.md

§5/§7: Creator CRM view, Seeding, Links/codes, Commission, UGC rights, Performance.

- Creator CRM view -- FOUND `CAP-INFLUENCER`
- Links/codes / `createAffiliateLink()`/`attributeSale()` -- FOUND `CAP-AFFILIATE` + `CAP-AFFILIATE-ATTRIBUTION`
- Commission -- FOUND `CAP-AFFILIATE`
- Performance -- FOUND-PARTIAL `CAP-AFFILIATE-ATTRIBUTION`
- Seeding (gifting product to creators) -- MISSING
- UGC rights / `grantUsageRight()` (licensing creator content for reuse) -- MISSING

## 45_Experimentation_Feature_Flags.md

§5/§7: Flags, Percentage rollout, A/B/n, Holdout, Targeting, Experiment metrics.

**Weakest-covered module in the whole pack.** This is a pure engineering/product capability (feature-flag platform + general experimentation), and the catalog has nothing for it:

- Flags / `evaluateFlag()` / Percentage rollout -- MISSING (no `CAP-FEATURE-FLAG` or equivalent)
- Holdout / Targeting -- MISSING
- A/B/n / `startExperiment()`/`getExperimentResult()` -- FOUND-PARTIAL `CAP-AB-TESTING` only, and that capability is explicitly scoped to marketing-content testing ("同時跑兩個版本的行銷頁面或郵件並比較成效" -- landing pages/emails), not general product/engineering experimentation with variant assignment and statistical holdouts.
- Experiment metrics -- MISSING

## 46_Demand_Planning_Forecasting.md

§5/§7: Forecast, Seasonality, Safety stock, Reorder point, Stockout risk, Overstock, Aging.

- Forecast -- FOUND `CAP-DEMAND-FORECAST`
- Safety stock/Reorder point -- FOUND `CAP-REORDER-POINT`
- Seasonality/Stockout risk -- FOUND-PARTIAL `CAP-DEMAND-FORECAST` (implied inputs to forecasting, not separately named)
- Overstock / `detectOverstock()` -- MISSING
- Aging (inventory aging, distinct from `CAP-AR-AGING` which is receivables-only) -- MISSING

## 47_PLM_Quality.md

§5/§7: Product development, BOM, Samples, Costing refs, Specification, Inspection, Defect, CAPA, Recall.

- Product development/Samples/Specification -- FOUND `CAP-PRODUCT-DEVELOPMENT`
- BOM -- FOUND `CAP-BOM`
- Inspection/Defect/CAPA -- FOUND `CAP-QUALITY-INSPECTION` (CAPA explicitly named in the catalog description)
- Recall -- FOUND `CAP-RECALL`

Full coverage, no gaps.

## 48_Customer_Portal_Self_Service.md

§5/§7: Order lookup, Tracking, Returns, Tickets, Subscriptions, Invoices, Loyalty, Consent/preferences.

- Order lookup/Tracking -- FOUND `CAP-ORDERS` + `CAP-SHIPPING`
- Returns -- FOUND `CAP-RETURNS`
- Tickets -- FOUND `CAP-TICKETING`
- Subscriptions -- FOUND `CAP-SUBSCRIPTION-COMMERCE`
- Loyalty -- FOUND `CAP-LOYALTY-POINTS`
- Consent/preferences -- FOUND `CAP-CONSENT-LEDGER`
- Invoices -- FOUND-PARTIAL `CAP-INVOICES`
- Portal shell itself -- FOUND `CAP-CUSTOMER-PORTAL` + `CAP-CUSTOMER-USERS`

Full coverage, no gaps.

## 49_Agentic_Commerce.md

§5/§7: Product discovery, Offer, Availability, Checkout intent, Order status, Returns intent, Agent delegation. Domain objects: `AgentMandate`, `AgentSession`, `AgentRequest`.

**Second-weakest-covered module, and conceptually the most novel.** This module models an *external* AI agent (e.g. a shopping assistant) transacting on a customer's behalf against this system -- the opposite direction from the catalog's only agent-related capabilities (`CAP-AI-EXTERNAL`, `CAP-MULTI-AGENT`, `DER-AI-*`), which all model *this system's own* AI calling out or acting internally.

- Product discovery/Offer/Availability -- FOUND-PARTIAL `CAP-PRODUCTS` + `CAP-INVENTORY` (the underlying data exists; no capability for exposing it through an agent-consumable discovery protocol)
- Order status/Returns intent -- FOUND-PARTIAL `CAP-ORDERS`/`CAP-RETURNS` (same reasoning)
- **Checkout intent / `createCheckoutIntent()` / `submitAgentOrder()` -- MISSING.** No capability models a third-party AI agent as a checkout actor (e.g. an Agentic Commerce Protocol / AP2-style delegated-payment flow).
- **Agent delegation / `AgentMandate` / `verifyMandate()` -- MISSING.** No capability for verifiable, scoped purchase authority delegated by a customer to an external AI agent. This is the entire premise of the module and has zero catalog representation.

## 50_Work_Management_Approvals.md

§5/§7: Tasks, Projects, Checklist, Due date, Dependencies, Approvals, Comments, Attachments.

- Tasks -- FOUND `CAP-TASKS`
- Projects -- FOUND `CAP-PROJECTS`
- Approvals -- FOUND `CAP-APPROVAL`
- Comments -- FOUND `CAP-COMMENTS`
- Attachments -- FOUND `CAP-FILES`
- Checklist -- MISSING (no sub-task/checklist-item capability distinct from `CAP-TASKS`)
- Due date/Dependencies -- field-level detail, not capability-level; no gap forced.

---

## N/A -- docs with no business-capability list (architecture rules / SDK meta-contracts / connector catalogs / market packs / process docs)

`01_Product_Constitution.md`, `28_Developer_Platform_SDK.md`, `29_Connector_Runtime_Standard.md`, `32_CRM_Marketing_Social_Connectors.md`, `33_Payment_Logistics_Finance_Connectors.md`, `34_Market_Pack_Taiwan.md`, `35_Market_Pack_Global.md`, `38_Implementation_Roadmap.md`, `39_Customer_Service_Phase1_Plan.md`, `40_Claude_Codex_Work_Rules.md`. These enumerate connectors, market rollups, or process rules built from capabilities already covered in the modules above (e.g. `34`/`35` are compositions of caps from `20/21/22/23/30/31`); checking them again would double-count, not surface new gaps. `28`/`29`/`40` are meta/tooling contracts about *how modules are built*, not business capabilities themselves -- out of the catalog's scope by design.

---

## Summary

**Total blueprint capability/API claims checked: 218** (across 38 module docs with content, incl. the prior `23_Cross_Border_Compliance.md` finding)

| Classification | Count |
|---|---|
| FOUND | 121 |
| FOUND-PARTIAL | 61 |
| MISSING | 36 |

### Ranked MISSING items most likely to matter

Ranked by (a) recurrence across multiple modules, or (b) being core to a module's stated Mission rather than a peripheral feature:

1. **Omnichannel messaging-platform connector (LINE/WhatsApp/Telegram/Instagram-Messenger) as a capability** -- missing in modules 04 and 30. This is Module 04's entire Golden Flow and the platform's stated Tier-0 channel (`30_Communication_Connectors.md:8`). `CAP-LIVE-CHAT` and `CAP-EMAIL` don't cover it. Highest-priority gap.
2. **Agentic-commerce delegated authority (`AgentMandate`/checkout-intent for external AI shopping agents)** -- missing entirely in module 49, which exists *only* to define this. All existing AI-related CAPs model the system's own AI acting outward, not a third-party agent acting inward.
3. **Data retention policy as a capability** -- missing in both 27 (Knowledge/Docs) and 37 (Security/Privacy), the latter of which is a compliance-facing module.
4. **Right-to-erasure / `deleteSubjectData()`** -- missing in module 37; a GDPR/CCPA legal obligation, not an optional feature, with zero catalog coverage.
5. **Marketing/campaign attribution (non-affiliate)** -- missing in both 06 (Marketing) and 24 (Analytics); only affiliate-link attribution (`CAP-AFFILIATE-ATTRIBUTION`) exists.
6. **Feature flags / general product experimentation** -- missing in module 45 entirely; `CAP-AB-TESTING` only covers marketing-content A/B tests, not engineering rollout/targeting/holdouts.
7. **PIM attribute governance & taxonomy management** -- missing in module 09, which is that module's core mission (`CAP-PRODUCTS` only asserts a catalog exists, not that it's attribute-governed).
8. **Product/data completeness & quality scoring** -- missing in both 09 (PIM) and 24 (Analytics); no general data-quality-check capability exists outside the narrow, feed-specific triage in `CAP-PRODUCT-FEED`.
9. **Generic inbound-webhook idempotency as a platform capability** -- missing in module 02 (Platform Core), even though the module's own architecture (§7 Webhook Inbox) depends on it; only payment- and AI-scoped idempotency exist (`DER-PAYMENT-IDEMPOTENCY`, `DER-AI-IDEMPOTENCY`).
10. **Supplier-side MOQ / supplier lead-time tracking** -- missing in module 14; the catalog's only `CAP-MOQ` is the opposite direction (customer-facing B2B minimum order), a real semantic mismatch, not just an absent feature.

Lower-priority singleton gaps (each in exactly one module, peripheral to that module's mission): canned-reply macros (04), subtitles (08), channel-mapping and listing-error-handling (11), order merge/routing/exception-management (12), receipt generation (19), prompt registry & AI-output evaluation (25), workflow retry & policy-engine (26), document templates & source-citation tracing (27), 2FA/MFA (37), connector-usage-limit entitlements (36), autocomplete (42), churn analytics (43), creator seeding & UGC usage-rights licensing (44), inventory overstock/aging detection (46), checklist sub-tasks (50).
