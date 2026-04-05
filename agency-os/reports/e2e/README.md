# E2E / staging drill reports

Markdown drill outputs from `lobster-factory/scripts/emit-staging-drill-report.mjs` land here (C3-2).

Generate from repo root `D:\Work`:

```powershell
cd D:\Work\lobster-factory
node scripts/emit-staging-drill-report.mjs
```

Optional full gate + notes:

```powershell
node scripts/emit-staging-drill-report.mjs --runBootstrap=1 --notes="First dry run on company machine"
```

Template: `lobster-factory/docs/e2e/STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md`

Onboarding/A10-2 acceleration helpers:

```powershell
cd D:\Work\agency-os
powershell -ExecutionPolicy Bypass -File .\scripts\preflight-onboarding-a10-2-readiness.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\init-onboarding-a10-2-evidence-skeleton.ps1 -TenantSlug company-p1-pilot -ProjectSlug 2026-010-p1-pilot
```
