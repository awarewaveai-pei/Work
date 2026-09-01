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

> 🔴 **DECISION PENDING (`HD-10`)** — does a due-diligence effort get its own bounded aggregate, distinct from the billing-scoping "Project" concept, or does replay have to reconstruct against a Subject's entire eternal history instead? **Recommended (Option A)**: a `Case` / `Engagement` aggregate root bounding a single due-diligence effort: `purpose`, `risk_level`, `relationship_context`, `requester_context` (individual / corporate team / group — see `02_PRODUCT_BOUNDARIES.md` Subject Model decision), evidence refs, decisions, research report refs, lifecycle state — distinct from the tenancy `Project` concept in `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` (a billing-scoping container); a Case is a domain-workflow unit, a Project is a commercial-scoping unit, referencing but not equal to each other. **Alternative B**: merge into Project itself — simpler, but re-couples domain data to the tenancy control plane this document says HCI must not own. **Alternative C**: defer, leave `case_id` an opaque string until Wave 4 — cheapest short-term, but leaves `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`'s `case_id` field with nothing concrete backing it, and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md`'s replay requirement unsatisfiable in the interim. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-10, `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-06.

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

> 🔴 **DECISION PENDING (`HD-06`)** — full bitemporal treatment everywhere is over-engineering for a solo-operator team; zero bitemporal treatment breaks the product's core "what did we know when" promise. Where exactly is the line is a cost/completeness trade-off the operator, not this review, must draw. **Recommended scope**: `Evidence`, `Claim`, `Assessment`, and `Decision` — the four tables backing every "why did we conclude this" explanation (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` §Explainability Button) — carry real bitemporal columns: `valid_from`/`valid_to` (real-world applicability window) and `system_recorded_at`/`system_superseded_at` (when HCI's row set changed), distinct from each other. Research artifacts (`search_jobs`, `source_snapshots`, `identity_candidates`) would stay simple insert-only with `created_at` — they aren't "facts about a Subject that can be superseded," full bitemporal treatment there would be over-engineering.

**Why this matters**: `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-02 itself flags bitemporal modeling as self-acknowledged-missing, and V1's actual schema sketch (elsewhere in this document) was system-time only (`created_at`/`valid_until`/`assessment_version`) — meaning "what did HCI know on date X" (promised by `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md`'s replay requirement) could not actually be answered precisely. In a defamation or regulatory discovery process, this is exactly the question a court or regulator asks — retrofitting bitemporal modeling after years of system-time-only data exists is far more expensive than designing it in at Wave 1, which is why this decision cannot simply wait. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-06, `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-1, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-14.

## Immutability vs. Erasure *(new section in V2)*

> 🔴 **DECISION PENDING (`HD-07`)** — this is a legal-mechanism choice (does deleting a key satisfy "erasure" in the applicable jurisdictions?) the operator, not the architecture, must be comfortable defending. **Recommended (Option A)**: crypto-shredding resolves the tension between Invariant 6 (never overwrite history) and a Person's erasure/correction rights (§Data Subject Rights above) — each sensitive Evidence/Claim payload would carry a per-record `encryption_key_ref`; on a lawful erasure request, only the key is destroyed (`tombstoned_at` set), the row's metadata (that evidence existed, its timestamp, its role in past Decisions, its correction lineage) survives for audit purposes, but its content becomes permanently unrecoverable — the erasure event itself becomes an immutable, logged fact, satisfying Invariant 6 and the erasure obligation simultaneously. **Alternative B**: literal storage-level WORM — infeasible today, no S3-Object-Lock-class storage exists in the verified infrastructure. **Alternative C**: narrow WORM scope to non-personal audit metadata only, keep personal evidence conventionally deletable — weakens the tamper-evidence guarantee for the data that matters most. This must be designed into the schema at Wave 1 if Option A is chosen — retrofitting per-record encryption onto an existing large evidence table later is a genuinely painful, high-risk migration. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-07, `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-7.

## Assessment versioning

Never overwrite historical assessments. Store: `assessment_version`, `model_version`, `policy_version`, `method_versions`, `evidence_cutoff`, `created_at`, `valid_until`, `review_required_at`.

## Physical isolation from shared automation data *(new section in V2)*

> 🔴 **DECISION PENDING (`HD-11`, no urgency — decide when convenient)** — does HCI-30's RESTRICTED-classified data live in the same physical Postgres cluster as unrelated, lower-sensitivity automation data (n8n) already running on the shared self-hosted Supabase instance, or is it physically isolated as a compensating control? No recommendation is forced here — this is a genuine cost-vs-defense-in-depth trade-off with no forcing function; decide once real data volume or a specific compliance requirement makes the answer concrete. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-11, `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-9.

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
