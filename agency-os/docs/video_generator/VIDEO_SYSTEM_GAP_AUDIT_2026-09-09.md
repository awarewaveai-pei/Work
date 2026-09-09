# Video LEGO system gap audit — 2026-09-09

## Delivered in code

- Quick Engine, native 16:9/9:16/4:5 render, R2 storage, Remotion dynamic slideshow and Postiz/WordPress routes remain available.
- Timeline v1 validation/compile/submit and caption cue rendering exist under `apps/next-admin/lib/content/video/` and `/api/video/timeline/*`.
- Release QA gate, receipt state machine and outcome event contract exist.
- Commits `a2ff1ec06`, `646896954`, `a93c413a0`, `cde2f007c`, `31857c06b`, `723bee99d` and `64f7ad8e2` add receipt adapter wiring, persisted QA report endpoint, footage editor, billing/credit APIs, provider profiles, outcome webhook/dashboard, migrations 0065/0066, provider allowlist, tenant release/asset boundaries, signal QA and the EDP→Timeline compiler/UI.

## Remaining runtime gaps (exact)

| Gap | Evidence | Required completion |
|---|---|---|
| Database activation | 0065/0066 applied to production `supabase-db` on 2026-09-09 after public-schema custom-format backup `/tmp/supabase-public-20260909T071635Z.dump` (SHA-256 `23acb9c15d...`) and `ON_ERROR_STOP=1`; all seven tables and `media_credit_reserve` verified | Keep migration ledger, run RLS/restore proof and retain down scripts |
| Feature activation | `MEDIA_PRODUCTION_PERSISTENCE_ENABLED` and `MEDIA_OUTCOME_WEBHOOK_ENABLED` default off | Set only in staging first; verify rollback |
| Whisper execution | `app/api/video/transcription/import/route.ts` still accepts an existing transcript; no production worker calls `meeting-service/lib/transcribe.py` for video | Add local-worker job boundary, upload/download contract, retry and caption review UI |
| QA evidence | `apps/video-service/server.py` now performs bounded `blackdetect`, `freezedetect` and `ebur128` analysis and returns `signal_qa`; persisted report creation is still caller-triggered | Wire worker output to automatic `media_qa_reports` rows and caption cues |
| Real-footage convergence | `FootageEditor.tsx` now compiles EDP to validated Timeline v1 through `/api/video/footage/compile`; source asset registration/proxy resolver and render adapter remain pending | Register footage assets, resolve source ranges and add a dedicated footage renderer |
| Release linkage | Postiz/WordPress accept optional `releaseId`; receipt tables are live, but existing ContentStudio calls omit it and no release/delivery panel is exposed in VideoStudio | Create Release from approved candidate in UI and pass its ID into every delivery call |
| Billing lifecycle | Credit reserve RPC exists; no payment provider, monthly grant, refund or usage reconciliation webhook | Add operator-controlled grant first, then payment adapter behind a separate approval |
| Provider governance | `provider-policy.ts` now fail-closes billing profile changes unless `MEDIA_PROVIDER_ALLOWLIST` is explicit; generation routes still use their existing provider selection | Enforce allowlist, jurisdiction, model version, spend cap and kill switch before every provider call |
| Outcome feedback | Webhook and aggregate read API exist; no scheduled platform metric adapters or script-ranking feedback loop | Add per-platform fetch adapters, scheduled maturity snapshots and recommendation jobs |
| Deployment | `next-admin` is now deployed at `31857c06b`; production renderer/database remain unchanged | Keep migration/flag rollout separate; run renderer and DB canaries only after rehearsal |

## Safety boundary

The current production VideoStudio path is preserved while the flags are off. Do not apply 0065/0066 or restart the production stack until the isolated database rehearsal and authenticated staging canary have receipts in this folder.

## Live read-only check — 2026-09-09

- SSH `ubuntu@145.239.195.47:58122`: hostname `ns31414856`; `lobster-next-admin`, both production renderers, Postiz and WordPress containers are healthy.
- The three staging containers (`lobster-staging-r2-egress-proxy`, `lobster-staging-remotion-service`, `lobster-staging-video-service`) are healthy.
- Before migration, a read-only query in `supabase-db` returned empty values for all seven 0065/0066 tables. After the controlled apply, `information_schema` lists all seven tables and `pg_proc` lists `media_credit_reserve`; row counts remain zero as expected for a new additive ledger.
- `lobster-next-admin` now runs image digest `sha256:919f10a80a3553aae80cbec8e67687d65ad597ffecef268a537d745221f36632`, healthy; `/root/lobster-phase1/.deployed-commit` is `31857c06b6aa415a8806e413c91f99473924c676`.
- Deployment used `sg-deploy.sh next-admin`: snapshot `lobster-phase1-next-admin:rollback-20260909-060402`; `/login`, `/api/ops/summary`, WordPress and node-api smoke checks all returned 200. The saved host-local Remotion edit was restored after deployment.
