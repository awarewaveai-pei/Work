
## 2026-05-04

### Machine appendix (weekly-system-review)
- 2026-05-04 16:37:27 : gates=PASS (exit 0) ; integrated-status: generate-integrated-status-report.ps1 OK


## 2026-05-11

### Machine appendix (weekly-system-review)
- 2026-05-11 09:10:15 : gates=PASS (exit 0) ; integrated-status: generate-integrated-status-report.ps1 OK


## 2026-07-03

### next-admin Build & Onboard local direct build path
- Scope: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`.
- Added `local_direct` as a first-class `/api/build/runs` execution mode so Build Console can create a Supabase run, mark it running, call the in-app hosting bridge, and complete/fail the run without requiring Trigger.dev.
- Rewired `/api/onboarding/trigger-build` to use the same local hosting bridge path for customer intake builds, returning `run_id` plus `build_status` so `/build?runId=...` remains the progress/evidence view.
- Updated `/onboard` and `/build` defaults/copy so N8N and Trigger.dev are optional integrations/background dispatch choices, not required dependencies for staging WordPress builds.
- Preserved `enqueue` as an optional Trigger.dev dispatcher path for long-running/background execution; current local-direct risk remains synchronous HTTP timeout/process-restart exposure until this is moved into a same-host worker.
- Secret safety: local shell env readiness check only reported boolean presence; no token/key values were printed. Live provision was not executed locally because required env values were absent in this shell.
- Validation: `npm run typecheck` PASS; `npm test` PASS (47 files, 573 tests); `npm run build` PASS with existing Sentry/Supabase Edge warnings only.

## 2026-09-09

### Video LEGO release/QA and delivery hardening
- Source: `lobster-factory/infra/hetzner-phase1-core`; additive migration `packages/db/migrations/0068_media_delivery_dispatch_guard.sql`.
- Release/preflight now accept only server-issued, checksum-matched QA rows; browser QA write route returns 410; Release approval is owner/admin only.
- Postiz/WordPress claim a durable receipt before first external write. A `dispatching` receipt is never blindly replayed after an uncertain provider result.
- Billing/BYO writes are owner/admin only; Vault references remain server-owned.
- Validation: targeted Vitest release/QA/delivery suites and `npm run typecheck` passed before production migration/deploy.
