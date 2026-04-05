# End-to-End Linkage Checklist

## Objective
- Ensure strategy, operations, delivery, automation, and compliance stay fully linked.

## A. Governance Linkage
- [ ] **New doc onboarding（新增／大改版治理文件時必跑）**：`docs/operations/new-doc-linkage-checklist.md`（矩陣 + `change-impact-map.json` + 入口 + health）
- [ ] `README.md` includes all new operational entry points
- [ ] `docs/README.md` includes all new domain folders
- [ ] `docs/change-impact-map.json` includes new source/target links
- [ ] `docs/CHANGE_IMPACT_MATRIX.md` updated with new linkage rows

## B. Operations Linkage
- [ ] `scripts/system-guard.ps1` runs and writes PASS/FAIL status
- [ ] `scripts/system-health-check.ps1` score >= 100%（與 AO-CLOSE 預設一致）
- [ ] `scripts/system-health-check.ps1` Critical Gate = PASS
- [ ] `scripts/doc-sync-automation.ps1` latest closeout report exists
- [ ] Guard schedule registration is up-to-date

## C. Delivery Linkage
- [ ] `project-kit` templates reference QA and release governance
- [ ] tenant onboarding SOP references health/guard controls
- [ ] platform profile strategy is reflected in architecture docs

## D. Compliance Linkage
- [ ] Compliance checklist maps to global baseline
- [ ] audit evidence path exists and is documented
- [ ] leads/scraping controls are contract-linked

## E. Commercial Linkage
- [ ] Service packages aligned with CR pricing rules
- [ ] Multi-currency policy aligns with finance operations
- [ ] Monthly reporting templates align with KPI/margin spec

## F. Evidence Linkage
- [ ] latest `reports/closeout/` record exists
- [ ] latest `reports/health/` record exists
- [ ] latest `reports/guard/` record exists
- [ ] `LAST_SYSTEM_STATUS.md` current and readable

## Related Documents (Auto-Synced)
- `docs/architecture/multi-platform-delivery-architecture.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/operations/system-operation-sop.md`
- `README.md`
- `scripts/doc-sync-automation.ps1`
- `scripts/system-guard.ps1`
- `scripts/system-health-check.ps1`

_Last synced: 2026-04-01 02:31:21 UTC_

