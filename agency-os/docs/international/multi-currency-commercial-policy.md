# Multi-Currency Commercial Policy

## Objective
- Standardize international pricing, invoicing, and margin control.

## Currency Rules
- Contract base currency is fixed per SOW.
- Internal margin tracking can use home currency with daily FX rate snapshot.
- Any FX risk sharing must be explicit in contract terms.

## Pricing and FX
- Quote validity: 7-14 days for volatile currencies.
- For long projects, define FX adjustment trigger threshold (e.g., +/-5%).
- CR pricing follows base currency unless explicitly revised.

## Invoicing
- Invoice fields must include:
  - contract currency
  - tax/VAT treatment
  - payment terms and late fee policy
- Keep invoice numbering unique across all tenants.

## Revenue Recognition Baseline
- Milestone-based recognition for build projects
- Monthly recognition for retainers
- Keep audit trace to SOW and delivery evidence

## Margin Guardrails
- Yellow alert: gross margin < 30%
- Red alert: gross margin < 20%
- Trigger recovery plan for any red account within 5 business days
- Detailed finance workflow aligns with `docs/operations/finance-operations.md`.

## Related Documents (Auto-Synced)
- `docs/international/global-delivery-model.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/finance-operations.md`
- `README.md`

_Last synced: 2026-03-20 04:57:15 UTC_

