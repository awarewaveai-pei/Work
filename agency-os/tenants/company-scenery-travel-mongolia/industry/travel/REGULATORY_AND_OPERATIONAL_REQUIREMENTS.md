# Industry Overlay - Travel (Regulatory and Operational Requirements) — Scenery Travel Mongolia

> 套用 `tenants/templates/industry/travel/REGULATORY_AND_OPERATIONAL_REQUIREMENTS.md` 基礎；此為本租戶實例。

## Regulatory Baseline

- Required legal pages:
  - Privacy Policy（EN，GDPR 考量）
  - Terms and Conditions
  - Booking/Refund/Cancellation Policy（EN）
  - Contact and complaint channel
- Data handling:
  - What traveler data is collected: 姓名、email、行程偏好（最小必要）
  - Where data is stored: 主機商資料中心（APAC，待確認確切地點）
  - Retention period: 待補（建議 2 年後刪除 / 依法規）
  - Deletion request process: 透過 Contact page 提出，7 日內處理

## Commercial and Operations

- Seasons/peak periods: 蒙古夏季（6–9 月）為高峰；春秋為次
- Time-zone coverage plan: 客服回覆以蒙古時間 09:00–18:00 為主（UTC+8）
- Currency strategy: USD 單一（Phase 1）；MNT / 多幣別 Phase 2 評估
- Payment method matrix: 待補（Stripe / PayPal / 銀行轉帳）
- Cancellation and no-show handling: 待補（依套裝行程規則定義）

## Mandatory QA Scenarios

- [ ] Inquiry form submission works for international emails
- [ ] Booking/cancellation messaging is clear and consistent
- [ ] Key pages load acceptably on mobile
- [ ] Date/time display is unambiguous by locale（避免 MM/DD vs DD/MM 歧義）
- [ ] Contact method works from target countries（Asia, Europe, North America）

## Evidence Links

- Legal page URLs: 待補（上線後填入）
- QA report: `agency-os/reports/e2e/`
- Incident history: 無（新站）
