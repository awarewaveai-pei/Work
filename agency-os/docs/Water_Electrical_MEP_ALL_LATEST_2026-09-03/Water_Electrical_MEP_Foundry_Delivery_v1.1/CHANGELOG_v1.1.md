# Changelog v1.1 — Locked Latest Decisions

- Enabled bounded Phase 1 offline RWD operation while preserving single-web-app/no-installable-PWA boundary.
- Added offline cache/action-queue/sync/conflict capabilities and repo contracts.
- Locked single-company/no multi-tenant SaaS.
- Added Phase 4 accounting adapter + reconciliation boundary.
- Separated planned Dispatch from actual attendance and approved labor time; Phase 4 labor cost uses approved labor time.
- Explicitly excluded online payment gateway/PCI processing while retaining project billing/receivables.
- Removed all unresolved owner decisions from the latest project instance.
- Genericized reusable Industry Pack evidence so project-specific `file:line` evidence remains in project instances.
