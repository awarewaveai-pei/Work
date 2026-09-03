# Water / Electrical / MEP Contractor — System Foundry Delivery v1.1 (Latest)

Basis: System Foundry v1.6 + supplied water/electrical project-management specification + locked owner decisions dated 2026-09-03.

## Locked latest decisions
- Single RWD web application: YES.
- Native/separate mobile application: NO.
- Installable PWA requirement: NO.
- Bounded offline operation: YES, starting in Phase 1.
- Multi-tenant SaaS: NO.
- Accounting-system automatic synchronization: YES, Phase 4 adapter/reconciliation boundary.
- Actual/approved labor time separate from planned Dispatch: YES.
- Online payment gateway: NO.

## Delivered
1. Construction/MEP Industry Pack v1.1.
2. Fully resolved YES/NO project questionnaire with source/owner provenance.
3. Requirement/evidence register.
4. Core and MEP resolver plans.
5. Phase 1 blueprint including RWD offline continuity.
6. Phase 1 repo skeleton with offline-sync contracts.
7. Phase 2–5 stable boundaries for field/procurement/labor-time/accounting/cost/AI.
8. Validation that rejects native/mobile/PWA-manifest scope drift, tenant/payment leakage, unresolved decisions and invalid offline/labor/accounting mappings.

## Validate
```bash
python scripts/validate_delivery.py
python project-instance/phase1-repo/water-electrical-ops/scripts/validate_rwd_boundary.py
```
Expected: `DELIVERY VALIDATION: PASS` and `RWD/OFFLINE BOUNDARY: PASS`.
