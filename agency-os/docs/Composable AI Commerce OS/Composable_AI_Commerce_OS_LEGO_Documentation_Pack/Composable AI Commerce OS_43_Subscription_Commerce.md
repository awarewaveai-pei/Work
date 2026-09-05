# Composable AI Commerce OS
## Subscription Commerce LEGO

> 文件角色：週期訂購、續訂、Dunning、Pause/Upgrade/Churn 的訂閱電商模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

支援 recurring product/service lifecycle，並與 Payment、Commerce、Entitlement、CRM 共享狀態。

# 2. Why This LEGO Exists

Subscription 不是一般 Order 加一個 recurring flag；它有 plan、cycle、proration、failed-payment recovery。

# 3. Boundary

## Owns

- Subscription
- Plan
- SubscriptionItem
- BillingCycle
- Pause
- CancellationReason

## Does Not Own

- Payment processor
- Order raw data
- SaaS product billing

# 4. Core Dependencies

- Contact
- Commerce
- Payments
- Marketing
- Events

# 5. Public Capabilities

- Plans
- Trial
- Renewal
- Pause
- Resume
- Upgrade/Downgrade
- Dunning
- Churn analytics

# 6. Primary Domain Objects

- Subscription
- SubscriptionPlan
- Cycle
- SubscriptionChange

# 7. Public Service Contract

```text
createSubscription()
renew()
pause()
resume()
changePlan()
cancel()
```

# 8. Events Published

```text
subscription.started
subscription.renewed
subscription.payment_failed
subscription.paused
subscription.cancelled
```

# 9. Events Consumed

```text
payment.captured
payment.failed
customer.updated
```

# 10. Permissions

```text
subscription.read
subscription.manage
subscription.override
```

# 11. AI Tool Surface

```text
summarize_subscription()
suggest_retention_offer()
predict_churn_risk()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Shopify subscriptions
- Stripe Billing
- Other commerce subscription providers

# 13. Primary Workflows

1. Subscribe → plan/cycle。
2. Renewal → payment。
3. Failure → dunning/marketing。
4. Cancel → reason / retention / entitlement update。

# 14. UX Surfaces

- Subscription profile
- Renewal calendar
- Dunning queue
- Churn dashboard

# 15. Data & Integration Rules

- Customer subscription 與本 SaaS billing 分離
- Provider 可替換
- Billing dates timezone-safe

# 16. MVP

- Plan
- Renewal
- Pause/Cancel
- Failed payment recovery

# 17. Explicit Non-Goals for MVP

- Complex usage billing first

# 18. Acceptance Criteria

- Renewal 產生正確 commerce/payment events
- Cancel 可立即/period-end
- failed payment 可 recovery

# 19. Expansion Roadmap

- V1 recurring
- V2 churn/retention
- V3 usage/hybrid

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

訂閱從 start 到 renewal/cancel 有獨立 lifecycle，不依賴單一 PSP。
