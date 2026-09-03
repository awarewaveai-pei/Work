# Water / Electrical / MEP Operations — Phase 1 Repo Skeleton v1.1

Status: **READY FOR ARCHITECTURE/STACK SELECTION; NOT IMPLEMENTED**

## Client boundary
One RWD web application shared by desktop/tablet/mobile browsers. No native app, separate mobile codebase, or installable PWA requirement.

## Offline boundary
Bounded offline web is Phase 1 scope. Service Worker/Cache Storage/IndexedDB are permitted implementation primitives after stack selection. Initial offline write allow-list begins with dispatch acknowledgement; planning/permission changes remain online-only.

## Domain future-proofing
Dispatch is planned work only. Actual/approved labor time is a separate Phase 4 boundary and will drive labor cost. Accounting synchronization is a Phase 4 replaceable adapter/reconciliation module. Multi-tenant SaaS and online payment gateway are explicitly excluded.

Start with `docs/adr/ADR-001-architecture-shape.md`, `.foundry/resolution/industry-foundry-plan.json`, and the module/integration/offline contracts.
