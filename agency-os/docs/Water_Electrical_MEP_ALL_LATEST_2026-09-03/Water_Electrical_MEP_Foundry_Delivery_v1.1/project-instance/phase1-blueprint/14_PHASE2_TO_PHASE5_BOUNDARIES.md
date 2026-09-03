# Phase 2–5 Extension Boundaries

## Phase 2
Add field execution, document control and quality. Offline web may expand to daily-report/photo drafts only through an explicit safe-write/sync contract; do not make every browser mutation offline-capable by default.

## Phase 3
Add procurement. Material flows reference Project through explicit contracts; offline procurement approvals remain out of scope unless separately justified.

## Phase 4
Add commercial, subcontract, cost, **labor_time** and **accounting_integration**.

### Labor-time boundary
`Dispatch` = planned work assignment. `Attendance/WorkLog` = actual record. `ApprovedLaborTime` = approved cost input. Labor cost MUST NOT use planned dispatch duration as authoritative actual time.

### Accounting boundary
Automatic accounting synchronization is required. Provider selection is deferred. Use adapter + stable mapping + idempotency + reconciliation. Operational project/procurement/billing records remain source of truth for their own domains.

### Explicit exclusion
No online payment gateway. Progress billing, receivables and receipt recording do not introduce card/payment-provider/PCI scope.

## Phase 5
Add AI query/summary/analysis behind existing authorization. AI cannot bypass user scope; direct writes remain disabled unless separately approved.

## Product boundary
No multi-tenant SaaS productization is planned. Do not introduce tenant provisioning/billing/isolation infrastructure merely for hypothetical future resale.
