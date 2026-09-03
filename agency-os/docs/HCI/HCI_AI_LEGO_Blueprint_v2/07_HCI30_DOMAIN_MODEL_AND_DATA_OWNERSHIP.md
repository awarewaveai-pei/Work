# 07 — HCI-30 Domain Model & Data Ownership

## Purpose

Define stable HCI entities and ownership boundaries.

## Core entities

```text
Person
Organization
OrganizationHierarchy
Relationship
Interaction
Observation
Evidence
Claim
Source
SourceSnapshot
SourceRelationship
PublicEvent
Hypothesis
Assessment
AssessmentDimension
TrustDomain
RiskEvent
Permission
Decision
Outcome
Review
Consent
PolicyVersion
AuditReference
Control / Mitigation              -- new in V2, see 04 §Cooperation Safety Principle
Case / Engagement                 -- new in V2, see §Case Aggregate below
DataSubjectRequest                -- new in V2, see §Data Subject Rights below
PersonMergeLog / PersonSplitLog   -- new in V2, see §Identity Correction below
```

## Subject Model *(new section in V2)*

> ✅ **RESOLVED (`HD-00` / `DOM-12`, 2026-09-01) — ADR-0011**: HCI remains Person-only for V1 assessment functionality. At Wave 1 ERD freeze, the Evidence, Claim, Assessment, and TrustDomain table matrix must reserve nullable, forward-compatible `subject_type`/`subject_id` fields with `subject_type` defaulting to `PERSON`. Organization is not independently assessable until a future explicit ADR authorizes its Evidence, Assessment, and TrustDomain behavior. The ERD, Person-default constraint, and negative test are open gates; see `governance/ADR-0011-hci-subject-type-scope.md`.

## Important identity separation

```text
User != Person
```

A User logs into HCI. A Person is a Subject represented in HCI.

**New in V2**: a Person (the researched Subject) is never automatically a User, has no account, and by design typically does not know a record about them exists. This distinction is the basis for §Data Subject Rights below — do not conflate "the tenant's own account data" rights processes with the separate rights process a Person needs.

## Case Aggregate *(new section in V2)*

> ✅ **RESOLVED (`HD-10`, 2026-09-02) — ADR-0020**: Option A — `hci.cases` is a Wave 1 aggregate root (`purpose`, `risk_tier`, `relationship_context`, `requester_context`, `project_ref` nullable non-FK, lifecycle `OPEN→ACTIVE→CLOSED`), distinct from the commercial `Project` in `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`. Evidence/Claim/Assessment/TrustDomain and the future Decision table are owned by a Case; replay bounds to one `case_id`, never a Subject's full history. Schema, lifecycle trigger, and ownership-binding tests are open implementation gates. See `governance/ADR-0020-case-engagement-aggregate.md`.

## Data Subject Rights *(new section in V2 — highest-priority addition)*

A `DataSubjectRequest` entity: `request_type` (access / correction / dispute / deletion), submitting party, linked Claims/Evidence/Assessments affected, resolution, and lineage into the bitemporal history (§Bitemporal History below) so a correction produces a new version rather than a silent overwrite, consistent with Invariant 6.

**Why this exists**: this was the single most independently re-derivable finding across the entire V1 review — four reviewers, using four different methods (missing-domain-entity analysis, security-sequencing conflict, red-team attack simulation, and live regulatory research into GDPR Art. 15/16/17), converged on the same gap without any cross-contamination: **a real, named, non-consenting Person who is the Subject of an HCI dossier has no documented way to learn a profile exists, see what's recorded, contest a claim, or request correction/deletion** — even when the underlying claim originated from an identity-collision error (§Identity Correction below). V1 filed privacy runbooks (`DSAR_RUNBOOK.md`, `DELETION_RUNBOOK.md`) under Enterprise-readiness (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-01), framed entirely around the *tenant's own account data* — nowhere in 24 documents was the distinction between "rights of the customer" and "rights of the data subject" made explicit.

> **RESOLVED (`HD-03=A`, ADR-0014)** — HCI adopts the full `DataSubjectRequest` entity with lifecycle, append-only event history, and affected-record lineage as a P0 requirement. The local synthetic schema/test skeleton implements this limited gate; legal deadlines, real-person processing, and bitemporal scope remain open.

Related, separate decision on the controller/processor determination (who bears GDPR liability for a mis-profiled Person) — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Data Protection Roles.

## Identity Correction *(new section in V2)*

`PersonMergeLog` / `PersonSplitLog`: full lineage of what was merged/split, when, by whom, and an evidence re-attribution trail, plus a correction workflow that can retroactively flag and re-issue any Assessment/Decision that depended on the erroneous match.

**Why this exists**: common-name collisions or later-discovered aliases mean two different real people can get silently merged into one Person record (contaminating an innocent person's trust profile with someone else's disputes), or one person can be split across records (understating risk). V1's identity-match states (`06_HCI30_PUBLIC_INTELLIGENCE.md`) define confidence levels but no correction protocol for after a wrong match is discovered — treated as a solved problem because match states exist, when the actually dangerous case (correcting a match after evidence has already propagated into formal Assessments) was unaddressed. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-8, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-05.

## Consent

> ✅ **RESOLVED (`HD-02` / `DOM-04`, 2026-09-01) — ADR-0010**: HCI will not use a bare `Consent` entity. Model three distinct records or fields: tenant authorization to open/continue a Case, data-subject consent or another explicitly documented lawful-basis record where applicable, and source terms-of-use. None may be substituted for another; tenant authorization and source terms do not establish data-subject consent. The data model, lawful-basis policy, and anti-conflation constraints/tests remain open gates; see `governance/ADR-0010-consent-entity-scope.md`.

## Fact model

Store separately:

```text
Fact
Observation
Interpretation
Hypothesis
```

Do not write "Alice is unreliable" as a fact. Instead:

```text
Observation:
3 deadlines, 2 missed.

Interpretation:
Current evidence suggests lower delivery reliability in high-pressure context.

Unknown:
Long-term pattern not yet established.
```

**Changed in V2 — sourced from the shared Foundation kernel, not independently re-derived**: this Fact/Observation/Interpretation/Hypothesis ladder maps onto AI LEGO's already-ACCEPTED, ADR-governed epistemic-status vocabulary (`ai-lego://specs/evidence/epistemic-label.schema.yaml`, `ADR-004`, an 11-value enum with promotion redlines). V1 independently re-derived a 4-level version of the same concept, with only 2 of 4 levels backed by an actual table. See `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel for the extraction plan. Full reasoning: `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-03, `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C1.

## Evidence provenance

Each evidence record should support:

```text
evidence_id
tenant_id
person_id             -- pending subject_type generalization, see §Subject Model above
interaction_id
timestamp
source_type
source_reference
raw_observation
observer
context
confidence
corroboration_count
contradiction_count
created_at
updated_at
version                -- see §Bitemporal History: a version column alone is NOT immutability
classification
encryption_key_ref      -- new in V2, see §Immutability vs. Erasure below
tombstoned_at           -- new in V2, see §Immutability vs. Erasure below
```

**Changed in V2 — insert-only is now a DB-level guarantee, not an application-level promise**: `REVOKE UPDATE, DELETE` on the application role for Evidence, Claim, Assessment, Decision, Observation, and Audit tables, enforced via a `BEFORE UPDATE/DELETE` trigger that raises an exception (defense in depth beyond grants, since a superuser/owner connection bypasses grants — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Break-Glass Access for why this matters on the verified single-box baseline). Model "correction" as a new row with a `supersedes_id` pointer plus a `corrected_reason`; a `_current` view resolves "give me the latest state" without ever allowing a destructive write. A `version` column on an otherwise-mutable row is not the same guarantee as a DB-enforced immutable row — Invariant 6 is a promise the schema must actually keep, not merely assert. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-2.

## Bitemporal History *(new section in V2)*

> ✅ **RESOLVED (`HD-06`, 2026-09-02) — ADR-0017**: the recommended scope, ratified — `Evidence`, `Claim`, `Assessment`, and `Decision` carry real bitemporal columns: `valid_from`/`valid_to` (real-world applicability window) and `system_recorded_at`/`system_superseded_at` (when HCI's row set changed), distinct from each other. Every other table stays insert-only with a single server-assigned `created_at`. Supersession is a new row (`supersedes_id`+`corrected_reason`), never an in-place edit. Migration, supersession trigger, and "what was known at T" views/functions are open implementation gates. See `governance/ADR-0017-bitemporal-scope.md`.

**Why this matters**: `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-02 itself flags bitemporal modeling as self-acknowledged-missing, and V1's actual schema sketch (elsewhere in this document) was system-time only (`created_at`/`valid_until`/`assessment_version`) — meaning "what did HCI know on date X" (promised by `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md`'s replay requirement) could not actually be answered precisely. In a defamation or regulatory discovery process, this is exactly the question a court or regulator asks — retrofitting bitemporal modeling after years of system-time-only data exists is far more expensive than designing it in at Wave 1, which is why this decision cannot simply wait. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-06, `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-1, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-14.

## Immutability vs. Erasure *(new section in V2)*

> ✅ **RESOLVED (`HD-07`, 2026-09-02) — ADR-0018**: Option A, crypto-shredding — every Evidence/Claim row's content is ciphertext under a per-record key (`encryption_key_ref`, held in a key table the application role cannot read); erasure destroys the key, sets `tombstoned_at`, and appends an immutable `ERASURE_RECORDED` event. Key material never leaves PostgreSQL in Wave 1 (`pgcrypto`); BYOK/HSM/external-KMS is deferred and not authorized here. This is a schema mechanism the operator has chosen to defend, not a legal determination — `HD-20`/`HD-21` remain the governing decisions for that claim. Key table, reference columns, tombstoning function, and mediated read/write functions are open implementation gates. See `governance/ADR-0018-crypto-shredding-for-erasure.md`.

## Assessment versioning

Never overwrite historical assessments. Store: `assessment_version`, `model_version`, `policy_version`, `method_versions`, `evidence_cutoff`, `created_at`, `valid_until`, `review_required_at`.

## Physical isolation from shared automation data *(new section in V2)*

> ✅ **RESOLVED (`HD-11`, 2026-09-02) — ADR-0021**: HCI-30 runs its own dedicated PostgreSQL instance — dedicated compose service, volume, backup stream, credentials, resource limits — physically separate from the shared Supabase instance serving n8n/other automation. No FK/dblink/postgres_fdw crosses the two instances. This amends `ADR-0007`'s "single database" gate on this one point (a second Postgres *data* service is not a second *application* deploy unit). Dedicated compose service, credentials, and backup line are open implementation gates. See `governance/ADR-0021-physical-isolation-of-hci-postgres.md`.

## Retention & Partitioning *(new section in V2)*

`evidence`/`observations`/`web_sources`/`source_snapshots`/`claims`/`audit` are the highest-growth-rate tables (unbounded, tenant-multiplied, append-only) and require time-range partitioning plus retention-driven partition detachment from Wave 1 — this is the mechanical enforcement of the `retention_policy` principle already implied elsewhere in this document, and the specific technique that avoids an operational cliff on the verified single-box, non-elastic Postgres reality. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-3.

## Domain DB ownership

HCI owns: Person, Organization, Relationship, Interaction, HCI Evidence, Public Claim, Trust Assessment, Risk Assessment, Permission, Collaboration Decision, Outcome.

HCI does not own: AI LEGO workflow runs, AI LEGO method atlas, model execution internals, platform identity, tenant billing.

## Recommended relational tables

See `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-01 for the formal ERD deliverable this section defers to (`HCI_DOMAIN_ERD.md`, `HCI_ENTITY_DICTIONARY.md`, `HCI_INVARIANTS.md`, `HCI_STATE_MACHINES.md`) — that ERD must incorporate every entity and column added in this V2 chapter before Wave 1 database work begins.

## Data architecture — 30-year decision, confirmed

**KEEP, confirmed after independent 3-option comparison** (PostgreSQL modular monolith vs. PostgreSQL + dedicated event store vs. PostgreSQL + graph DB) — see `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §1 for the full comparison table. **PostgreSQL modular monolith**, with the insert-only ledger design above already capturing most of event-sourcing's value, and Apache AGE (in-Postgres graph extension) as the correct graph-query answer with an explicit, measurable trigger condition for ever adopting a standalone graph database (same file, §1). Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md`.

**RLS vs. DB-per-tenant — confirmed, made mandatory**: see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation for the resolution — RLS mandatory for shared tiers, dedicated DB as a formal `Entitlement` for Enterprise+.
