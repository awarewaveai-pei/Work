# Operations Automation Guide - company-p1-pilot

- 預檢：`powershell -ExecutionPolicy Bypass -File .\scripts\preflight-onboarding-a10-2-readiness.ps1`
- 建立證據骨架：`powershell -ExecutionPolicy Bypass -File .\scripts\init-onboarding-a10-2-evidence-skeleton.ps1 -TenantSlug company-p1-pilot -ProjectSlug 2026-010-p1-pilot`
- 週期檢查：`powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`

## Related Documents (Auto-Synced)
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-04-02 06:26:32 UTC_

