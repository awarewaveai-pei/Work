# Media LEGO implementation status — 2026-09-09

## Ready in production

- Quick Engine / Remotion render, real-footage EDP, caption burn-in, technical render QA, tenant asset records, WordPress/Postiz adapters.
- Release, QA, delivery, billing, provider-profile and outcome database tables (0065–0067).

## Deployed — 2026-09-09

- Server-issued QA trust boundary and owner/admin Release approval are live in next-admin `5417260f7`.
- Delivery atomic claim migration `0068_media_delivery_dispatch_guard.sql` and Postiz/WordPress claim enforcement are live; table backup SHA-256: `7ddfa51b1d28f55ca8fcc8fa8a15d4d90713d7678578534e2b06a257f4acb06a`.
- Compose passes Postiz and Stripe settings through; values remain disabled until configured.

## Blocked only by external account setup

| Capability | Exact required input |
|---|---|
| GPU Whisper | Cloudflare Zero Trust tunnel hostname and connector token for a new video-only worker on the RTX laptop; no meeting-service exposure. |
| Paid plans | Stripe product/price IDs, secret key and signed webhook secret. |
| Outcome feedback | Postiz/platform analytics authorization plus a scheduler identity. |

## Safety rules

- No external publish without a Release and server-issued QA evidence.
- No retry after an uncertain external delivery; reconcile the receipt first.
- No browser-supplied QA, no browser-supplied Vault reference, and no committed secret.


## Deployed fail-closed — 2026-09-09

- 0069 isolated video transcription job ledger is live. Dispatch accepts only tenant-owned, checksummed `R2_VIDEO_PUBLIC_BASE` assets; callback authentication is one secret per job.
- `apps/video-whisper-worker` is a separate RTX-only FastAPI process, staged for the RTX laptop. It validates HTTPS/DNS, source checksum, and retries callback delivery. It does not touch meeting-service.
- Callback imports JSON/SRT/VTT and persists source-caption integrity QA. A rendered candidate still needs its own caption QA evidence before Release.
- next-admin deployment passed typecheck, 786 tests, health and `/api/ops/summary` smoke. Worker URL/token remain empty, so dispatch is deliberately 503 until the dedicated tunnel is configured.\n- Operator deployment contract: `VIDEO_WHISPER_WORKER_DEPLOYMENT.md`.

## Enabled and verified — 2026-09-10

- Dedicated Cloudflare Tunnel: `video-whisper.aware-wave.com`; only worker ingress and `/health` verification exposed.
- RTX 5060 Video Whisper worker is independent from meeting-service and is started on demand from the Desktop launcher.
- Production canary completed: `media_transcription_jobs=completed`, JSON/SRT/VTT artifacts=3, source caption QA=`passed`.

## Deployed — 2026-09-10 Story Bible workbench

- Production migration `0070_media_story_bible_revisions.sql` applied on `supabase-db`; source SHA-256 `72c07441fbfa61979db74658071e7c357f6903f6ef6310f0b7e3b0a561ad97b3`.
- Pre-change public-schema backup: `/root/lobster-phase1/backups/video-schema/pre-0070-20260910-045138.sql.gz`, SHA-256 `7990f1498b3c25f7b861dc6ace90e5dab4d439b0f9a413b16a929a0f9b35821e`.
- Schema proof: RLS enabled; immutable revision trigger count `1`; atomic approval function count `1`.
- `next-admin` deployed at `cf6f04a37`; rollback image `lobster-phase1-next-admin:rollback-20260910-045531`; `/login`, `/api/ops/summary`, WordPress and node-api smokes passed.
- Dedicated Whisper worker tunnel health is `200`. Its Desktop launcher remains on-demand; no meeting-service change.
