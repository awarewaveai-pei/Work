# Composable AI Commerce OS
## SaaS Billing & Entitlements LEGO

> 文件角色：這套 Business OS 自身的方案、訂閱、用量、Seats、Modules 與 Connector entitlement。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把產品商業模式本身也做成一個清楚的 entitlement layer。

# 2. Why This LEGO Exists

如果方案權限散落 UI if/else，未來 Module Marketplace 與 usage pricing 會很難維護。

# 3. Boundary

## Owns

- Plan
- Subscription
- Entitlement
- UsageMeter
- BillingAccount
- Trial

## Does Not Own

- Customer commerce order
- Accounting ledger

# 4. Core Dependencies

- Organization
- Users
- Modules Registry
- Connector Registry
- Payments

# 5. Public Capabilities

- Plans
- Trials
- Seats
- Module entitlements
- Connector limits
- Usage metering
- Overage
- Dunning

# 6. Primary Domain Objects

- Plan
- Subscription
- Entitlement
- UsageMeter
- InvoiceRef

# 7. Public Service Contract

```text
checkEntitlement()
recordUsage()
changePlan()
startTrial()
suspendForBilling()
```

# 8. Events Published

```text
subscription.started
subscription.changed
entitlement.changed
usage.limit_reached
```

# 9. Events Consumed

```text
payment.failed
organization.created
module.installed
```

# 10. Permissions

```text
billing.read
billing.manage
plan.manage
```

# 11. AI Tool Surface

```text
explain_plan_usage()
suggest_plan()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Stripe Billing / other SaaS billing provider

# 13. Primary Workflows

1. Organization chooses plan。
2. Entitlements enable modules/connectors。
3. Usage metering。
4. Limit/overage/dunning。

# 14. UX Surfaces

- Plan page
- Usage
- Billing
- Module entitlement

# 15. Data & Integration Rules

- Feature access 永遠 query entitlement service
- 不要 UI-only gating
- Billing provider 可替換

# 16. MVP

- 3 plans
- Seat count
- Module/connector limit
- Basic usage

# 17. Explicit Non-Goals for MVP

- Complex enterprise contracts first
- Multi-provider invoicing first

# 18. Acceptance Criteria

- Backend API 也會 enforce entitlement
- Plan change 即時反映 capabilities
- Usage 有 audit

# 19. Expansion Roadmap

- V1 flat plans
- V2 usage
- V3 marketplace revenue share

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

任何付費功能都由統一 entitlement service 控制，不散落 hard-coded checks。
