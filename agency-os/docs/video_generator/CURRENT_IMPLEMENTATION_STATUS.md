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
