# Owner Decisions — 2026-09-03

Status: **LOCKED FOR LATEST PACKAGE**

## Product / architecture decisions

1. Offline operation: **YES**. The field-facing RWD web application must support a bounded offline mode and synchronize after connectivity returns.
2. Future multi-company / multi-tenant SaaS: **NO**. This project remains a single-company internal system; do not build SaaS tenant/commercial infrastructure.
3. Automatic accounting-system synchronization: **YES**. Implement through a replaceable accounting adapter with reconciliation; provider remains undecided until architecture/provider selection.
4. Actual attendance / approved labor time separate from planned dispatch time: **YES (Foundry architecture recommendation adopted in this latest package)**. Dispatch is planned work; actual/approved labor time is the authoritative Phase 4 labor-cost source.
5. Online payment gateway / card collection: **NO**. The system manages progress billing, receivables and receipt records only; no payment-gateway/PCI processing module.

## UI / client boundary

6. Client architecture: **one responsive web application (RWD)** shared by desktop, tablet and mobile browsers.
7. Native iOS/Android application: **NO**.
8. Separate mobile codebase: **NO**.
9. Installable PWA requirement: **NO**. No web-app manifest or install-to-home-screen product requirement.
10. Offline web implementation may use browser primitives such as Service Worker, Cache Storage and IndexedDB when selected by architecture; using those primitives does not turn the product into an installable PWA.

## Offline Phase 1 scope

11. Phase 1 offline read scope includes at least cached current/next dispatch, project/site summary and contact/navigation information needed by field staff.
12. Phase 1 offline write scope is bounded to operations proven safe to queue, beginning with dispatch acknowledgement; server-authoritative planning/permission changes remain online-only.
13. Offline queued writes must be idempotent, auditable, user-bound, encrypted where sensitive, and conflict-checked on synchronization.
14. LINE and Google Calendar remain network integrations; offline client actions are synchronized to the company system first, then provider side effects are delivered/reconciled after connectivity returns.
