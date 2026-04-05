# Client Risk Scoring Model

## Objective
- Score each client account to detect delivery and commercial risk early.

## Scoring Dimensions (0-5 each)
- Scope stability
- Payment discipline
- Decision-making speed
- Dependency complexity
- Security/compliance sensitivity
- Team collaboration quality

## Risk Bands
- 0-10: Low
- 11-18: Medium
- 19-24: High
- 25-30: Critical

## Required Actions by Band
- Low: normal cadence
- Medium: weekly risk review with PM
- High: escalation to PM + Tech Lead + AM
- Critical: executive intervention and recovery plan within 3 business days

## Update Cadence
- Re-score monthly
- Re-score immediately after major incident or payment breach

## Required Records
- Store latest score in tenant profile and monthly report
- Record action owner and due date for Medium+ accounts

## Related Documents (Auto-Synced)
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/product/templates/monthly-report-template-en.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-03-20 04:57:15 UTC_

