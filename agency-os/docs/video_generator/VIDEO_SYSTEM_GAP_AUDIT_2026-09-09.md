# Video LEGO system gap audit — 2026-09-09

## Delivered in code

- Quick Engine, native 16:9/9:16/4:5 render, R2 storage, Remotion dynamic slideshow and Postiz/WordPress routes remain available.
- Timeline v1 validation/compile/submit and caption cue rendering exist under `apps/next-admin/lib/content/video/` and `/api/video/timeline/*`.
- Release QA gate, receipt state machine and outcome event contract exist.
- Commits `a2ff1ec06`, `646896954`, `a93c413a0` and `cde2f007c` add receipt adapter wiring, persisted QA report endpoint, footage editor, billing/credit APIs, provider profiles, outcome webhook/dashboard, migrations 0065/0066, provider allowlist and tenant release/asset boundaries.

## Remaining runtime gaps (exact)

| Gap | Evidence | Required completion |
|---|---|---|
| Database activation | `packages/db/migrations/0065_media_production_persistence.sql`, `0066_media_billing_and_provider_profiles.sql` are committed only; no production apply receipt | Backup, staging rehearsal, RLS/restore proof, then controlled apply |
| Feature activation | `MEDIA_PRODUCTION_PERSISTENCE_ENABLED` and `MEDIA_OUTCOME_WEBHOOK_ENABLED` default off | Set only in staging first; verify rollback |
| Whisper execution | `app/api/video/transcription/import/route.ts` accepts an existing transcript; no worker calls `meeting-service/lib/transcribe.py` for video | Add local-worker job boundary, upload/download contract, retry and caption review UI |
| QA evidence | `apps/video-service/server.py` returns technical metadata; report API now persists caller-supplied evidence | Add ffprobe/black/freeze/loudness/caption-sync worker and automatic report creation |
| Real-footage convergence | `FootageEditor.tsx` uploads and exports EDP draft; asset UUID is not registered into `media_assets` and no EDP render adapter exists | Add asset registration, proxy generation, source-range resolver and EDP→Timeline compiler |
| Release linkage | Postiz/WordPress accept optional `releaseId`; existing ContentStudio calls omit it | Create Release from approved candidate in UI and pass its ID into every delivery call |
| Billing lifecycle | Credit reserve RPC exists; no payment provider, monthly grant, refund or usage reconciliation webhook | Add operator-controlled grant first, then payment adapter behind a separate approval |
| Provider governance | `provider-policy.ts` now fail-closes billing profile changes unless `MEDIA_PROVIDER_ALLOWLIST` is explicit; generation routes still use their existing provider selection | Enforce allowlist, jurisdiction, model version, spend cap and kill switch before every provider call |
| Outcome feedback | Webhook and aggregate read API exist; no scheduled platform metric adapters or script-ranking feedback loop | Add per-platform fetch adapters, scheduled maturity snapshots and recommendation jobs |
| Deployment | `main` contains code; production containers were not restarted | Deploy via existing backup/health/rollback runbook after migration rehearsal |

## Safety boundary

The current production VideoStudio path is preserved while the flags are off. Do not apply 0065/0066 or restart the production stack until the isolated database rehearsal and authenticated staging canary have receipts in this folder.
