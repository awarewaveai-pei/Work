# Video LEGO system gap audit — 2026-09-09

## Delivered in code

- Quick Engine, native 16:9/9:16/4:5 render, R2 storage, Remotion dynamic slideshow and Postiz/WordPress routes remain available.
- Timeline v1 validation/compile/submit and caption cue rendering exist under `apps/next-admin/lib/content/video/` and `/api/video/timeline/*`.
- Release QA gate, receipt state machine and outcome event contract exist.
- `438efd9cc` adds real-footage audio replacement and caption burn-in, plus tenant-scoped deterministic editorial/rights QA persistence.
- `2c64794b3` adds bounded outcome ranking and a Stripe-shaped payment adapter boundary; no card data is handled by next-admin.
- Commit `035a32788` adds automatic render QA persistence, SHA-256 output identity, real-footage asset/QA pickers, and a dedicated `/api/video/footage/render` → video-service `/render-footage` path. It is deployed to production next-admin and video-service.

## Remaining runtime gaps (exact)

| Gap | Evidence | Required completion |
|---|---|---|
| Database activation | 0065/0066 applied to production `supabase-db` on 2026-09-09 after public-schema custom-format backup `/tmp/supabase-public-20260909T071635Z.dump` (SHA-256 `23acb9c15d...`) and `ON_ERROR_STOP=1`; all seven tables and `media_credit_reserve` verified | Keep migration ledger, run RLS/restore proof and retain down scripts |
| Feature activation | Production `lobster-next-admin` now has `MEDIA_PRODUCTION_PERSISTENCE_ENABLED=true`; outcome webhook remains false until an authenticated ingest token is provisioned | Keep outcome webhook disabled until token/canary; rollback by restoring `/root/lobster-phase1/docker-compose.yml.bak-20260909T072812Z` and restarting next-admin |
| Whisper execution | `meeting-service` exposes authenticated local-only `/api/video/transcribe` (job/status + JSON/SRT/VTT) and next-admin `/api/video/transcription/dispatch`; production has no GPU worker because ks-aw-01 has no NVIDIA device, so dispatch remains fail-closed 503 | Register the RTX workstation behind a durable HTTPS tunnel + `VIDEO_WORKER_TOKEN`, then set `MEDIA_TRANSCRIBE_WORKER_URL/TOKEN` in next-admin; no production secret can be invented |
| QA evidence | video-service computes bounded ffprobe + black/freeze/loudness evidence and SHA-256; `/api/video/status` writes immutable technical QA; `/api/video/qa/editorial-rights` writes deterministic editorial and rights reports | A candidate must carry title/script and explicit rights evidence (`cleared`, licenseRef, sourceRef); missing evidence fails closed |
| Real-footage convergence | Footage upload registers `media_assets(asset_domain=real_footage)`, EDP stores source ranges, `/api/video/footage/render` resolves tenant-owned HTTPS assets and submits durable jobs; audio replacement and caption burn-in are implemented in `438efd9cc` and passed the 2026-09-09 production canary (`df9e47be00a0467caa68798dd973a3ac`) | Keep the canary receipt and run tenant-authenticated asset→QA→Release once; rollback video-service to `lobster-video-service:rollback-20260909-0936` |
| Release linkage | ReleaseDeliveryPanel loads tenant assets and passed/warned QA reports from picker APIs; approved Release still gates Postiz/WordPress receipt adapters | Delivery status history can be added after a real external receipt; existing calls remain backward-compatible |
| Billing lifecycle | Credit reserve RPC and `/api/video/billing/checkout` Stripe adapter exist; provider/webhook are fail-closed when env is absent | Choose a payment provider, create prices/webhook secret, set `MEDIA_PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MEDIA_CHECKOUT_ALLOWED_ORIGIN`, then run test-mode webhook canary; this is the only remaining external step |
| Provider governance | `provider-policy.ts` now fail-closes billing profile changes unless `MEDIA_PROVIDER_ALLOWLIST` is explicit; generation routes still use their existing provider selection | Enforce allowlist, jurisdiction, model version, spend cap and kill switch before every provider call |
| Outcome feedback | Authenticated outcome webhook and dashboard now include deterministic `rankedReleases` feedback scores (`2c64794b3`) | Supply per-platform metric fetch adapters (Postiz/platform credentials) and schedule 24h/7d/30d POSTs to `/api/webhooks/video-outcome`; the ranking core is ready |
| Deployment | next-admin runs deployed commit `2c64794b3` with smoke 4/4; video-service image built from `2c64794b3` is healthy; production `/render-footage` audio+caption canary `df9e47be00a0467caa68798dd973a3ac` passed and produced a 1920×1080 R2 output with technical/signal QA passed. Production DB migrations 0065/0066/0067 are active; persistence flag is on, outcome webhook remains off | Keep rollback snapshots (`lobster-phase1-next-admin:rollback-20260909-093214`, `lobster-video-service:rollback-20260909-0936`) and run a real tenant-authenticated asset→QA→Release receipt before enabling outcome ingestion |

## Safety boundary

The existing Quick Engine and Remotion paths remain available. New footage/QA persistence is additive and tenant-gated; rollback tags are retained for next-admin (`lobster-phase1-next-admin:rollback-20260909-093214`) and video-service (`lobster-video-service:rollback-20260909-0936`).

## Live read-only check — 2026-09-09

- SSH `ubuntu@145.239.195.47:58122`: hostname `ns31414856`; `lobster-next-admin`, both production renderers, Postiz and WordPress containers are healthy.
- The three staging containers (`lobster-staging-r2-egress-proxy`, `lobster-staging-remotion-service`, `lobster-staging-video-service`) are healthy.

### 2026-09-09 implementation continuation

- Code worktree commits: `438efd9cc` and `2c64794b3`; next-admin typecheck and full Vitest suites pass. Both commits are on `origin/main`; next-admin and video-service are deployed from `2c64794b3`.
- `/api/video/footage/render` now accepts one full-duration audio track and one bounded caption track; video-service materializes, replaces audio, burns captions, then runs the existing technical/signal QA. Production canary `df9e47be00a0467caa68798dd973a3ac` produced `https://pub-bd79a1c3b4554025bd92a6192b032427.r2.dev/video/canary_audio_caption_20260909/16x9.mp4`; ffprobe shows H.264 + AAC and the extracted frame contains the burned caption.
- `/api/video/qa/editorial-rights` verifies tenant-owned assets and persists immutable editorial/rights evidence. Missing script, forbidden terms, missing license/source references, non-cleared or expired rights fail closed.
- `/api/video/outcomes` returns `rankedReleases`; `/api/video/billing/checkout` and `/api/webhooks/video-billing` are provider-shaped and remain disabled until Stripe configuration is present.

### Production renderer canary — 2026-09-09 09:40 UTC

- `POST http://127.0.0.1:8732/render-footage` with one HTTPS clip, one full-duration audio track and one caption cue returned HTTP 202 (`jobId=df9e47be00a0467caa68798dd973a3ac`).
- Job completed `status=done`; output `16x9` is 1920×1080, H.264 + AAC, 839238 bytes, checksum `850b94d31eaaf406aa1e33f6a68e19699a7735f728123b9ab2c87353c54b4076`; technical QA and signal QA both passed (`blackRatio=0`, `freezeEvents=0`, `integratedLufs=-26.1`).
- A frame extracted from the public output at 0.40s visibly contains `canary audio caption`; this proves the caption filter is applied in the deployed renderer.

### Runtime correction — 2026-09-09 08:20 UTC

Current production is commit `035a327885443be29a596361465f5648a6c837b4`: next-admin `sg-deploy` snapshot `lobster-phase1-next-admin:rollback-20260909-081606` and rebuilt `lobster-video-service` (`lobster-video-service:rollback-20260909-082100`), both healthy. Real footage canary `28e2dbee3de24bfd971e6f4d6bde1d63` produced 1920×1080 output with checksum `b5e96572470f59b028210610e8d5bcc95efd18a83e9f59f27a17fb80f2bdf7c1`; technical/signal QA passed (`blackRatio=0`, `freezeEvents=0`, `integratedLufs=-26.1`).
Historical baseline bullets (before the 08:20 UTC correction) are retained below for audit:

### Laptop Whisper boundary correction — 2026-09-09

- `C:\Users\user1115\Desktop\啟動會議處理服務.lnk` targets `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\meeting-service\start_server.ps1`; it starts the local meeting-service on `127.0.0.1:8420`.
- The laptop has an NVIDIA RTX 5060 Laptop GPU (8,151 MiB reported by `nvidia-smi`); `ks-aw-01` remains CPU-only.
- The canonical shortcut service now has `/api/video/transcribe` (`app.py:97`) and `run_video_transcription` (`pipeline.py:216`), emitting transcript JSON/SRT/VTT. `VIDEO_WORKER_TOKEN` is passed by `start_server.ps1:40,64` and the endpoint fails closed with 503 when absent.
- The shortcut target was launched on 2026-09-09; it selected Windows native GPU mode and `GET http://127.0.0.1:8420/` returned HTTP 200. A real multipart POST to `/api/video/transcribe` returned the expected 503 because no token is configured.
- This local capability is not a production worker URL: `127.0.0.1` is unreachable from `ks-aw-01`. Production dispatch therefore remains 503 until the laptop is exposed through an authenticated HTTPS tunnel and next-admin receives the matching URL/token.

- Before migration, a read-only query in `supabase-db` returned empty values for all seven 0065/0066 tables. After the controlled apply, `information_schema` lists all seven tables and `pg_proc` lists `media_credit_reserve`; row counts remain zero as expected for a new additive ledger.
- `lobster-next-admin` now runs image digest `sha256:919f10a80a3553aae80cbec8e67687d65ad597ffecef268a537d745221f36632`, healthy; `/root/lobster-phase1/.deployed-commit` is `31857c06b6aa415a8806e413c91f99473924c676`.
- Deployment used `sg-deploy.sh next-admin`: snapshot `lobster-phase1-next-admin:rollback-20260909-060402`; `/login`, `/api/ops/summary`, WordPress and node-api smoke checks all returned 200. The saved host-local Remotion edit was restored after deployment. A follow-up compose restart loaded persistence flags; `/login` returned the expected 307 auth redirect and the container is healthy. Config backup: `/root/lobster-phase1/docker-compose.yml.bak-20260909T072812Z`.
