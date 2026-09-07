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

**Progress as of 2026-09-06:** Phase 1A renderer authentication has completed isolated implementation and focused verification on branch `codex/media-video-phase0` (`542e75a8e`, `5b19f0885`), with no production deployment. Its source/change receipt is [PHASE_1A_IMPLEMENTATION_RECEIPT.md](PHASE_1A_IMPLEMENTATION_RECEIPT.md). Phase 1B durable-job design is complete in [PHASE_1B_DURABLE_QUICK_ENGINE_JOB_LIFECYCLE.md](PHASE_1B_DURABLE_QUICK_ENGINE_JOB_LIFECYCLE.md); its additive schema, migration rehearsal and retention rules are specified in [PHASE_1B_2_DURABLE_JOB_SCHEMA_PACKAGE.md](PHASE_1B_2_DURABLE_JOB_SCHEMA_PACKAGE.md), and its no-double-render receipt protocol is specified in [PHASE_1B_4_RENDERER_ATTEMPT_PROTOCOL.md](PHASE_1B_4_RENDERER_ATTEMPT_PROTOCOL.md), while renderer staging canary, acceptance and rollback gates are executable from [PHASE_1B_RENDERER_STAGING_REHEARSAL_RUNBOOK.md](PHASE_1B_RENDERER_STAGING_REHEARSAL_RUNBOOK.md). Its remaining executor, renderer-protocol, route-adapter code, migration and rollout stay blocked until those gates pass.

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

**Progress as of 2026-09-07:** the isolated branch contains the fail-closed, artifact-reference Timeline v1 contract and structural-only preflight API ([Phase 3A](PHASE_3A_TIMELINE_V1_CONTRACT_RECEIPT.md)), plus a pure Timeline→`dynamic-slideshow` compiler that preserves crop, transition, profile and allowed audio semantics ([Phase 3B](PHASE_3B_TIMELINE_TO_REMOTION_COMPILER_RECEIPT.md)). It deliberately has no render-submission API, UI, database write, artifact resolver, renderer call or deployment because the current Remotion route bypasses the durable job/artifact/release lifecycle. This does not satisfy this phase's acceptance gate and must not be described as a deployed Director Engine.

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

**Progress as of 2026-09-06:** the source-of-truth and caption revision boundary is defined in [PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md](PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md); the technical/editorial evidence and Release gate are defined in [PHASE_4_MEDIA_QA_AND_RELEASE_GATE_CONTRACT.md](PHASE_4_MEDIA_QA_AND_RELEASE_GATE_CONTRACT.md). This is design only: no Whisper worker has been attached to VideoStudio, no database schema exists, and no existing ffmpeg subtitle path has changed. Runtime implementation remains gated by Phase 2 asset/release safety and the durable job lifecycle.

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

**Progress as of 2026-09-06:** versioned Story Bible、Edit Decision Plan、capability boundaries and their mandatory Timeline/QA/Release convergence are defined in [PHASE_5_SHORT_DRAMA_AND_FOOTAGE_EDIT_CONTRACT.md](PHASE_5_SHORT_DRAMA_AND_FOOTAGE_EDIT_CONTRACT.md). This is design only: no UI, asset write, provider call, render, migration or deployment exists.

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

**Progress as of 2026-09-06:** WordPress/Postiz attempt lifecycle, outcome snapshots and the self-use/SaaS/enterprise-BYO boundary are defined in [PHASE_6_DELIVERY_OUTCOMES_AND_COMMERCIAL_CONTRACT.md](PHASE_6_DELIVERY_OUTCOMES_AND_COMMERCIAL_CONTRACT.md). This is design only: the current Postiz route remains unchanged, no destination integration was provisioned, and no billing or provider-policy runtime exists.

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
