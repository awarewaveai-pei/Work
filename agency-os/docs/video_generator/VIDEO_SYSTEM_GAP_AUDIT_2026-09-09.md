# Video LEGO system gap audit — 2026-09-09

## Delivered in code

- Quick Engine, native 16:9/9:16/4:5 render, R2 storage, Remotion dynamic slideshow and Postiz/WordPress routes remain available.
- Timeline v1 validation/compile/submit and caption cue rendering exist under `apps/next-admin/lib/content/video/` and `/api/video/timeline/*`.
- Release QA gate, receipt state machine and outcome event contract exist.
- Commit `035a32788` adds automatic render QA persistence, SHA-256 output identity, real-footage asset/QA pickers, and a dedicated `/api/video/footage/render` → video-service `/render-footage` path. It is deployed to production next-admin and video-service.

## Remaining runtime gaps (exact)

| Gap | Evidence | Required completion |
|---|---|---|
| Database activation | 0065/0066 applied to production `supabase-db` on 2026-09-09 after public-schema custom-format backup `/tmp/supabase-public-20260909T071635Z.dump` (SHA-256 `23acb9c15d...`) and `ON_ERROR_STOP=1`; all seven tables and `media_credit_reserve` verified | Keep migration ledger, run RLS/restore proof and retain down scripts |
| Feature activation | Production `lobster-next-admin` now has `MEDIA_PRODUCTION_PERSISTENCE_ENABLED=true`; outcome webhook remains false until an authenticated ingest token is provisioned | Keep outcome webhook disabled until token/canary; rollback by restoring `/root/lobster-phase1/docker-compose.yml.bak-20260909T072812Z` and restarting next-admin |
| Whisper execution | `meeting-service` exposes authenticated local-only `/api/video/transcribe` (job/status + JSON/SRT/VTT) and next-admin `/api/video/transcription/dispatch`; production has no GPU worker because ks-aw-01 has no NVIDIA device, so dispatch remains fail-closed 503 | Register the RTX workstation behind HTTPS + `VIDEO_WORKER_TOKEN`, then set `MEDIA_TRANSCRIBE_WORKER_URL/TOKEN` in next-admin; no production secret can be invented |
| QA evidence | video-service computes bounded ffprobe + black/freeze/loudness evidence and SHA-256; `/api/video/status` now writes immutable `media_qa_reports` automatically when the asset has a worker checksum | Caption/editorial/rights reports remain separate human/provider evidence before Release |
| Real-footage convergence | Footage upload registers `media_assets(asset_domain=real_footage)`, EDP stores source ranges, `/api/video/footage/render` resolves tenant-owned HTTPS assets and submits durable footage jobs; canary passed | Add caption burn-in track after Whisper worker registration; reject unsupported audio/caption tracks explicitly |
| Release linkage | ReleaseDeliveryPanel loads tenant assets and passed/warned QA reports from picker APIs; approved Release still gates Postiz/WordPress receipt adapters | Delivery status history can be added after a real external receipt; existing calls remain backward-compatible |
| Billing lifecycle | Credit reserve RPC exists; no payment provider, monthly grant, refund or usage reconciliation webhook | Add operator-controlled grant first, then payment adapter behind a separate approval |
| Provider governance | `provider-policy.ts` now fail-closes billing profile changes unless `MEDIA_PROVIDER_ALLOWLIST` is explicit; generation routes still use their existing provider selection | Enforce allowlist, jurisdiction, model version, spend cap and kill switch before every provider call |
| Outcome feedback | Webhook and aggregate read API exist; no scheduled platform metric adapters or script-ranking feedback loop | Add per-platform fetch adapters, scheduled maturity snapshots and recommendation jobs |
| Deployment | next-admin and video-service run commit `035a32788`; next-admin smoke 4/4, video-service health and real `/render-footage` canary passed. Production DB migrations 0065/0066/0067 are active; persistence flag is on, outcome webhook remains off | Keep rollback tags and run a real tenant-authenticated asset→QA→Release receipt before enabling outcome ingestion |

## Safety boundary

The existing Quick Engine and Remotion paths remain available. New footage/QA persistence is additive and tenant-gated; rollback tags are retained for next-admin (`lobster-phase1-next-admin:rollback-20260909-081606`) and video-service (`lobster-video-service:rollback-20260909-082100`).

## Live read-only check — 2026-09-09

- SSH `ubuntu@145.239.195.47:58122`: hostname `ns31414856`; `lobster-next-admin`, both production renderers, Postiz and WordPress containers are healthy.
- The three staging containers (`lobster-staging-r2-egress-proxy`, `lobster-staging-remotion-service`, `lobster-staging-video-service`) are healthy.

### Runtime correction — 2026-09-09 08:20 UTC

Current production is commit `035a327885443be29a596361465f5648a6c837b4`: next-admin `sg-deploy` snapshot `lobster-phase1-next-admin:rollback-20260909-081606` and rebuilt `lobster-video-service` (`lobster-video-service:rollback-20260909-082100`), both healthy. Real footage canary `28e2dbee3de24bfd971e6f4d6bde1d63` produced 1920×1080 output with checksum `b5e96572470f59b028210610e8d5bcc95efd18a83e9f59f27a17fb80f2bdf7c1`; technical/signal QA passed (`blackRatio=0`, `freezeEvents=0`, `integratedLufs=-26.1`).
- Before migration, a read-only query in `supabase-db` returned empty values for all seven 0065/0066 tables. After the controlled apply, `information_schema` lists all seven tables and `pg_proc` lists `media_credit_reserve`; row counts remain zero as expected for a new additive ledger.
- `lobster-next-admin` now runs image digest `sha256:919f10a80a3553aae80cbec8e67687d65ad597ffecef268a537d745221f36632`, healthy; `/root/lobster-phase1/.deployed-commit` is `31857c06b6aa415a8806e413c91f99473924c676`.
- Deployment used `sg-deploy.sh next-admin`: snapshot `lobster-phase1-next-admin:rollback-20260909-060402`; `/login`, `/api/ops/summary`, WordPress and node-api smoke checks all returned 200. The saved host-local Remotion edit was restored after deployment. A follow-up compose restart loaded persistence flags; `/login` returned the expected 307 auth redirect and the container is healthy. Config backup: `/root/lobster-phase1/docker-compose.yml.bak-20260909T072812Z`.
