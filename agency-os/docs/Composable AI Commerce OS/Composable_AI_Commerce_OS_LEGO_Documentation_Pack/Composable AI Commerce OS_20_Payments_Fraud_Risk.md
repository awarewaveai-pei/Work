# Composable AI Commerce OS
## Payments / Fraud / Risk LEGO

> 文件角色：支付生命週期、Refund、Chargeback、Fraud policy 與 Payment abstraction。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

統一 payment authorization/capture/refund/chargeback，並把 PSP-specific mechanics 留給 Connector。

# 2. Why This LEGO Exists

Order paid 不等於錢真的安全入帳；支付需區分 auth、capture、settlement、refund、dispute。

# 3. Boundary

## Owns

- PaymentIntentRef
- Payment
- RefundRequest
- DisputeCase
- RiskDecision

## Does Not Own

- Accounting journal
- Order
- PSP raw API

# 4. Core Dependencies

- Commerce
- Policy
- Audit
- Events
- Finance

# 5. Public Capabilities

- Authorize
- Capture
- Refund
- Void
- Dispute
- Risk rules
- Manual review

# 6. Primary Domain Objects

- Payment
- Refund
- Dispute
- RiskDecision

# 7. Public Service Contract

```text
authorize()
capture()
refund()
void()
getPayment()
evaluateRisk()
```

# 8. Events Published

```text
payment.authorized
payment.captured
payment.failed
refund.completed
chargeback.opened
```

# 9. Events Consumed

```text
order.created
return.approved
fraud.signal.received
```

# 10. Permissions

```text
payments.read
payments.capture
payments.refund
risk.review
risk.rules.manage
```

# 11. AI Tool Surface

```text
summarize_payment_issue()
explain_risk_decision()
suggest_manual_review()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Taiwan: ECPay / NewebPay / TapPay / LINE Pay
- Global: Stripe / PayPal / Adyen

# 13. Primary Workflows

1. Order → payment authorization/capture。
2. Provider webhooks → normalize state。
3. Return approved → refund workflow。
4. Dispute → Customer Service / Finance。

# 14. UX Surfaces

- Payment detail
- Refund queue
- Chargeback cases
- Risk review

# 15. Data & Integration Rules

- Refund 高風險，需要 policy
- 不要存完整卡號
- PSP raw risk score 需映射但保留來源

# 16. MVP

- Payment read
- Refund with approval
- Stripe/ECPay connector
- Basic dispute

# 17. Explicit Non-Goals for MVP

- Own acquiring
- Custom card vault

# 18. Acceptance Criteria

- Refund 有 approval+audit
- Payment provider 可替換
- Chargeback 可關聯 order/contact

# 19. Expansion Roadmap

- V1 payments/refund
- V2 fraud rules
- V3 multi-PSP routing

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

Payment lifecycle 與 provider 分離，且所有高風險寫入有政策與稽核。
