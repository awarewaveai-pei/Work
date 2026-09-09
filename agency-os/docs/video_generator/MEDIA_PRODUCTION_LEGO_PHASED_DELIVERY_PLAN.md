# Media Production LEGO Platform — phased delivery plan

**Status:** DRAFT — no production change authorised
**Primary goal:** make the existing video tool reliably runnable first, then add the missing LEGO capabilities without replacing working paths.
**Companion plan:** [MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md](MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md)

## Operating rules

1. A phase changes code only after its contract, impact analysis, test plan, rollback and deployment plan are reviewed.
2. No phase installs an entire reference repository, adds a paid provider, applies a database migration or publishes media merely because this plan exists.
3. Every new public operation has an AI LEGO Capability Contract. Internal Next-admin block IDs remain implementation mappings.
4. Existing `media_assets` and `video_jobs` are the starting records. New data is additive and must not create a competing truth source.
5. A phase is complete only with file/line evidence, automated fixtures, staging evidence and an operator runbook.

## Domain map

The delivery plan uses the four domains defined in [the platform plan](MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md#21-four-platform-domains-and-their-lego-boundaries): **Media workbench**, **Media Core**, **Production/QA/artifact-version library**, and **Delivery/outcomes**. A domain groups responsibilities; every independently enabled, replaced or rolled-back operation remains a registered Capability Contract inside that domain.

## Phase 0 — prove the current tool is runnable

**User result:** an operator can use the existing VideoStudio route to make a draft, review it, render it and find the result, with failures classified rather than guessed.

**Scope**

- Produce a read-only service map for Next-admin, Quick Engine, Remotion, R2, Supabase, Whisper, WordPress and the current Postiz integration.
- Document the two currently supported paths:
  - Quick Engine: draft → edit → render → status/history.
  - Manual Remotion template: template selection → render → status.
- Verify configuration contracts without printing secrets, including the code-level token-name mismatch between Remotion (`RENDER_AUTH_TOKEN`) and its client (`REMOTION_AUTH_TOKEN`).
- Define a disposable staging smoke run, expected output, logs to inspect and recovery procedure.
- Freeze deletion-path changes until reference protection is designed.

**Deliverables**

- `CURRENT_BASELINE_AND_GAP_AUDIT.md`
- `RUNNABLE_BASELINE_SMOKE_TEST.md`
- service/configuration matrix with exact source evidence

**Acceptance gate**

- The supported Quick Engine and manual Remotion user journeys are documented from UI to persistent record.
- A disposable staging run either succeeds end-to-end or produces a classified failure with its owner and recovery instruction.
- No external publication, database write, provider purchase or production cleanup occurs.

**Rollback:** documentation only; revert the documentation commit.

## Phase 1 — reliable Quick Engine

**User result:** the already-existing Quick Engine is a dependable first tool: native-format draft, human edit, render, status and retrieval.

**Progress as of 2026-09-09:** commit `a913546a0` adds the isolated S3 egress proxy and staging-only credential installer. The staging Remotion canary passes (`submit_http=200`, `render_status=done`, HTTPS artifact); all three staging containers are healthy. Production renderers were not restarted and the durable production rollout/migration remains pending.

**Scope**

- Fix only defects proven by Phase 0.
- Add readiness visibility and deterministic health checks for current dependencies.
- Formalize and test existing job transitions, tenant ownership, output-profile metadata and recovery behaviour.
- Add a supported runbook for retry, restart and output reconciliation.

**Out of scope**

- New Timeline, new database ledger, new providers, social publishing changes, short drama and footage editing.

**Acceptance gate**

- Successful and failed jobs remain understandable after service restart/retry.
- Output formats and media-history records agree.
- Existing UI/API compatibility is preserved.

**Rollback:** route/configuration feature flag or a reviewed code revert; no destructive migration.

## Phase 2 — release and reference safety

**User result:** a video used by WordPress or social delivery cannot silently be deleted.

**Scope**

- Design additive release, delivery-attempt and asset-reference records around existing `media_assets` and `video_jobs`.
- Reserve immutable transcript versions and re-creatable caption renditions in the same asset/reference design, so Phase 4 does not create a second media truth source.
- Define WordPress embed/replacement and Postiz delivery state machines with idempotency keys and external IDs.
- Add deletion preflight: live references block deletion; replacement/detach is an explicit reviewed operation.
- Rehearse migration, RLS, legacy-reference backfill, restore and rollback on an isolated database copy.

**Acceptance gate**

- A referenced artifact delete is refused and reports its references.
- A WordPress replacement retains a rollback target.
- Delivery retries do not duplicate external posts.
- Production migration is not considered until rehearsal evidence is reviewed.

**Rollback:** additive schema only; disable the new path and retain legacy read access.

## Phase 3 — Timeline v1 and Remotion Director

**User result:** users can use a validated multi-scene Director Engine while Quick Engine remains unchanged.

**Progress as of 2026-09-09:** `main` contains the fail-closed Timeline v1 contract/compiler and a tenant-safe `timeline/submit` route that creates a durable internal job before calling Remotion. It also contains compile/submit route tests. The code is present across commits `ef1c2be2b`, `eee9f3fea` and `a913546a0`; it is not deployed to the production Next-admin. The Director acceptance gate still requires staging API deployment, interruption recovery and review UI.

**Scope**

- Define Timeline v1 JSON Schema: timebase, output profiles, tracks, source-artifact references, captions, style pack and provenance.
- Create `media.create_timeline` and `media.validate_timeline` as Capability Contracts.
- Validate ownership, references, source bounds, time overlap, frame alignment, caption constraints, output safety and renderer feasibility deterministically.
- Turn `dynamic-slideshow` into an adapter with durable run/output linkage and restart-safe polling.
- Add Timeline review UI: inspect, revise, validate and explicitly submit render.

**Acceptance gate**

- Invalid or unauthorized Timeline data cannot reach Remotion.
- A valid Timeline renders and is recoverable after interruption.
- Quick Engine remains selectable and functional.

**Rollback:** disable Director Engine capability; preserve existing assets and Quick Engine behaviour.

## Phase 4 — Whisper captions and QA

**User result:** a candidate video receives reviewable captions and cannot form a release with known technical failure.

**Progress as of 2026-09-09:** the source-of-truth and caption revision boundary remains defined by the contracts. `a913546a0` adds a tenant-safe transcript import route that validates source ownership and writes immutable JSON/SRT/VTT renditions with lineage. `724044af7` carries validated caption cues into Remotion DynamicSlideshow with frame-accurate rendering. `adb92808c` adds deterministic Quick Engine technical QA for ffprobe streams, dimensions and positive duration; `646896954` adds the tenant-scoped persisted QA report boundary. Whisper execution, automatic transcription dispatch and media-analysis workers are still pending; no existing Quick Engine subtitle path was changed.

**Scope**

- Expose existing local faster-whisper through a media-worker boundary.
- Store timed transcript provenance, confidence, review edits and SRT/VTT/ASS outputs.
- Implement technical QA: streams, duration, dimensions, silence, loudness, black/freeze frames, caption timing, reading speed and safe areas.
- Implement editorial QA: narrative, brand, rights, accessibility and character consistency.
- Gate release creation on pass/warn/fail policy; waivers are explicit and auditable.

**Acceptance gate**

- Caption edits are versioned without overwriting the source transcript.
- QA reports identify detector version, rule ID, evidence and decision.
- Technical failure blocks release creation.

**Rollback:** QA begins report-only; promotion to a hard release gate is separately controlled.

## Phase 5 — short drama and real-footage edit plans

**User result:** short-drama and real-footage workflows become independent production modes that converge only at Timeline, QA and Release.

**Progress as of 2026-09-09:** versioned Story Bible and Edit Decision Plan structural validators are in `5476df680`, with UUID references, source ranges, frame alignment and overlap checks. Persistence/RLS, review UI, asset resolver integration and render convergence remain pending; no production-mode capability is enabled.

**Scope**

- Define Story Bible: character/location/prop IDs, reference assets, immutable anchors, season state, episode state delta, hooks and production pack.
- Define Edit Decision Plan: proxy/source ranges, selects, cuts, transitions, audio/music, captions, notes and output profiles.
- Test any professional editor interchange strictly as a versioned import/export adapter.
- Connect both paths to Timeline v1, QA and release creation.

**Acceptance gate**

- Continuity violations are detected before render.
- Edit plans only reference valid source ranges and are revisioned.
- A reviewer approves a drama package or edit plan before provider spend/render.

**Rollback:** disable either production-mode capability while keeping existing artifacts readable.

## Phase 6 — delivery, learning and commercial modes

**User result:** approved releases reach WordPress and Postiz safely, outcomes improve future work, and local/SaaS/enterprise use follows one controlled product model.

**Progress as of 2026-09-09:** migrations 0065/0066 are applied to production after a public-schema custom-format backup and `ON_ERROR_STOP=1` transaction checks; all seven tables and `media_credit_reserve` are present. `723bee99d` adds signal QA extraction; `64f7ad8e2` exposes the EDP→Timeline compiler in VideoStudio. Postiz and WordPress accept optional `releaseId` receipt linkage behind `MEDIA_PRODUCTION_PERSISTENCE_ENABLED`; `/api/webhooks/video-outcome` and `/api/video/outcomes` provide authenticated ingestion/read aggregation behind explicit flags. Automatic Whisper worker execution, production flag activation and Release delivery UI remain gated work.

**Scope**

- Make Postiz the sole social-delivery adapter: draft, schedule, approved publish, retry, verify, replace and withdrawal where supported.
- Store immutable platform-scoped outcome snapshots linked to release, variant and experiment.
- Add entitlements and usage accounting for free, credit, subscription and enterprise modes.
- Add tenant provider profiles, credential references, regional/data rules, spend controls and kill switches.
- Add dashboards, alerts, backup/restore exercise, support runbooks and staged canaries.

**Acceptance gate**

- A release traces to WordPress/Postiz external IDs and verification evidence.
- A tenant cannot use an unapproved provider or exceed its entitlement.
- Historical outcomes are append-only and comparable by platform/maturity.
- Enterprise tenant credentials and artifacts remain isolated.

**Rollback:** independently disable a destination, provider or tenant policy while retaining receipts and lineage.

## Cross-phase proof requirements

| Area | Required proof |
|---|---|
| Capability | Contract, ACTIVE resolution, positive/negative schema fixtures and tests. |
| Data | Migration rehearsal, RLS proof, backup/restore test and rollback steps. |
| Security | Threat model, secret isolation, tenant-boundary test and provider-policy record. |
| Render | Golden fixture, media probe, QA report and interruption-recovery test. |
| Delivery | Idempotency test, external-ID receipt, retry classification and replacement test. |
| Operations | Dashboard fields, alert route, runbook and named owner. |

## Implementation order

```text
Phase 0: prove baseline
  → Phase 1: reliable existing Quick Engine
  → Phase 2: release/reference safety
  → Phase 3: Timeline + Director
  → Phase 4: Whisper + QA
  → Phase 5: drama + footage edit plans
  → Phase 6: Postiz/outcomes/commercial modes
```

The immediate executable work is **Phase 0, then Phase 1**. Phase 2–4 contracts may be specified early to prevent incompatible implementations, but they do not authorize their runtime paths. This gives you a working, reviewable video tool before any new ledger, supplier, renderer or commercial surface is introduced.

## 2026-09-09 implementation slice

- `0b79deecc`: `packages/db/migrations/0065_media_production_persistence.sql` plus rollback script. Apply only after isolated Supabase rehearsal.
- `delivery-receipts.ts`: idempotent service-role adapter; disabled until `MEDIA_PRODUCTION_PERSISTENCE_ENABLED=true`.
- Postiz route and WordPress embed route: optional `releaseId`/`variant` receipt lifecycle with queued→drafted→published/failed transitions.
- `FootageEditor.tsx`: VideoStudio tab for MP4 import through existing R2 route, cut points, output offsets, EDP JSON export and validated EDP→Timeline compilation.
- `edit-plan-timeline.ts` and `/api/video/footage/compile`: pure compiler plus tenant-bound API; no renderer or persistence side effects.
- `video-service/server.py`: bounded ffmpeg signal analysis for black frames, freezes, loudness and true peak; failures block output metadata.
- `MediaOperationsPanel.tsx`: VideoStudio 營運成效 tab，讀取租戶方案/點數/provider 與 outcome totals。
- `0066_media_billing_and_provider_profiles.sql`: plan account, credit ledger, atomic reserve RPC and provider profile metadata; secrets remain Vault-only.
- `/api/video/billing` and `/api/video/credits/reserve`: tenant-scoped account/provider read-write and atomic credit reservation.
- `/api/webhooks/video-outcome` and `/api/video/outcomes`: bearer-authenticated event ingestion, deduplication and tenant dashboard read model.
- `a93c413a0`: provider allowlist boundary; billing profile changes fail closed unless `MEDIA_PROVIDER_ALLOWLIST` explicitly permits the provider.

Runtime activation requires migration 0065/0066 rehearsal, staging env flags and receipt/outcome secret provisioning. Existing Quick Engine, Remotion and publication paths remain unchanged when flags are off.
