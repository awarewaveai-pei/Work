# HCI Entity Dictionary

P0-01 (`21_HCI_TOP_TIER_GAP_ANALYSIS.md`). SSOT for every table's shape and
purpose. Derived from the shipped, real-Docker-tested schema
(`database/migrations/0001`-`0011`), not invented — every row below is a
transcription of an already-enforced constraint, not a new design decision.
Column lists and CHECKs are as of migration 0011; if a later migration
changes a table, update this file in the same commit (R4).

Legend: **PK** primary key · **FK** foreign key · **UQ** unique · all tables
have `tenant_id uuid NOT NULL REFERENCES hci.tenants(id)`, RLS enabled+forced
with a `tenant_isolation` policy (`USING/WITH CHECK tenant_id = hci.current_tenant_id()`),
and a `(tenant_id, id)` UQ unless noted — omitted per-row below to avoid
repeating it 21 times; see `HCI_INVARIANTS.md` §Tenant isolation.

## Registry / infrastructure

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.tenants` | `id` PK, `slug` UQ NOT NULL, `jurisdiction` NOT NULL (0003) | full CRUD | `id` IS the tenant identity — RLS policy compares `id`, not `tenant_id`, to `current_tenant_id()`. `jurisdiction` CHECK denies EU/EEA/UK/EFTA codes (0003 gate 1). |
| `hci.app_tenant_bindings` | `role_name` PK, `tenant_id` FK | owner-only, zero app-role grants | Maps a Postgres role to a tenant; `hci.current_tenant_id()` reads it. Deliberately unreadable by app roles — see `HCI_INVARIANTS.md` §Tenant isolation. |
| `hci.data_encryption_keys` | `id` PK, `key_material bytea`, `created_at`, `destroyed_at` | owner-only, zero app-role grants (0007 gate 1) | Wave 1: key material in the clear, isolated by grant absence not encryption. `destroyed_at` unused until Wave 4 crypto-shredding wiring. |
| `hci.principals` | `id` PK, `display_name NOT NULL` | full CRUD (name only) | Human-user stub (ADR-0019 gate 5). No auth/identity system — Wave 1 has no separate reviewer-authentication path. |

## Person & consent

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.persons` | `id` PK, `display_label NOT NULL` | full CRUD | The Person core entity. |
| `hci.tenant_authorizations` | `id` PK, `status IN (ACTIVE,REVOKED,EXPIRED)`, `expires_at` | full CRUD | Gates `research_workflows` creation (H1001). Revocation does not retroactively affect existing rows. |
| `hci.subject_lawful_basis_records` | `id` PK, `person_id` FK→persons, `basis NOT NULL` | full CRUD | ADR-0010. Not yet wired to any admission workflow (Wave 1 schema only). |
| `hci.identity_candidates` | `id` PK, `person_id` FK→persons, `match_state IN (CANDIDATE,MATCH_CONFIRMED)` DEFAULT CANDIDATE | `person_id` frozen once `MATCH_CONFIRMED` | See state machine in `HCI_STATE_MACHINES.md` §Identity match. |
| `hci.identity_verifications` | `id` PK, `candidate_id` FK, `method IN (DETERMINISTIC,HUMAN,LLM)`, `evidence_ref` (non-blank if set) | last supporting row for a `MATCH_CONFIRMED` candidate cannot be removed (H1005) | — |

## Case aggregate

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.cases` | `id` PK, `tenant_authorization_id` FK, `purpose` (allow-listed, 0003 gate 2), `risk_tier IN (R0..R4)`, `relationship_context`, `requester_context NOT NULL`, `project_ref` (opaque, no FK), `status IN (OPEN,ACTIVE,CLOSED)` DEFAULT OPEN, `opened_at`, `closed_at` | see `HCI_STATE_MACHINES.md` §Case lifecycle; every field frozen once CLOSED; never deleted | The Case/Engagement aggregate (ADR-0020). `research_workflows`/`subject_records` bind to exactly one Case (`case_id NOT NULL`, immutable once set), and only if that Case is OPEN or ACTIVE at INSERT time (H1011). |
| `hci.research_workflows` | `id` PK, `tenant_authorization_id` FK, `case_id` FK→cases (immutable) | full CRUD | Requires an ACTIVE, unexpired `tenant_authorization` at INSERT/UPDATE (H1001). |

## Evidence / provenance graph

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.sources` | `id` PK, `source_ref NOT NULL` | full CRUD, but undeletable once any snapshot references it (FK) | — |
| `hci.source_terms_records` | `id` PK, `source_id` FK, `terms_ref NOT NULL` | full CRUD | — |
| `hci.source_snapshots` | `id` PK, `source_id` FK, `retrieved_at` (server-assigned), `content_hash NOT NULL`, `snapshot_ref NOT NULL` | append-only | A specific retrieval of a Source at a point in time. |
| `hci.source_relationships` | `id` PK, `claim_id` FK→subject_records(kind=CLAIM), `relationship_type IN (CITES,DERIVED_FROM,ORIGINAL_SOURCE)`, exactly one of `source_id`/`source_snapshot_id` | append-only, **no correction mechanism at all** | The corroboration graph. A wrong CITES edge can never be retracted — blocked on ADR-0017's bitemporal shape never being extended to this table (tracked gap, not oversight). |

## Subject records (polymorphic: Evidence / Claim / Assessment / TrustDomain)

`hci.subject_records` is the single largest and most heavily-gated table —
one physical table, four logical entities distinguished by `kind`. Every
column below is scoped to specific `kind` values via a `scoped`/`required`
CHECK pair (e.g. `author_class` required for EVIDENCE/CLAIM/ASSESSMENT,
forbidden for TRUST_DOMAIN); see `HCI_INVARIANTS.md` §Kind-scoped columns
for the full scoping table rather than repeating it per column here.

| Column | Added by | Scope (`kind`) | Purpose |
|---|---|---|---|
| `id`, `person_id` FK→persons, `subject_type='PERSON'`, `subject_id` (= person_id or NULL), `kind IN (EVIDENCE,CLAIM,ASSESSMENT,TRUST_DOMAIN)`, `case_id` FK→cases | 0001/0002 | all | Identity + polymorphic discriminator + Case binding. |
| `valid_from`, `valid_to`, `system_recorded_at`, `system_superseded_at`, `supersedes_id`, `corrected_reason` | 0005 | EVIDENCE/CLAIM/ASSESSMENT semantically; physically present on TRUST_DOMAIN too but `supersedes_id` is CHECK-forbidden there (0011) | Bitemporal history — see `HCI_STATE_MACHINES.md` §Bitemporal supersession. |
| `encryption_key_ref` FK→data_encryption_keys, `tombstoned_at` | 0007 | EVIDENCE/CLAIM required; forbidden elsewhere | Crypto-shredding erasure hook (ADR-0018). |
| `author_class IN (DETERMINISTIC,PROBABILISTIC,LLM_ASSISTED_HUMAN_REVIEW_REQUIRED,HUMAN_ONLY)` | 0008 | EVIDENCE/CLAIM/ASSESSMENT required; forbidden on TRUST_DOMAIN | Per-kind allow-list enforced at INSERT — see `HCI_INVARIANTS.md` §Author-class policy. |
| `claim_state IN (DRAFT,ASSESSMENT_CANDIDATE)`, `human_spotcheck_status IN (PENDING,APPROVED,REJECTED)`, `spotcheck_principal_id` FK→principals (0009), `reaudit_required boolean` | 0008/0009 | CLAIM only | See `HCI_STATE_MACHINES.md` §Claim admission. |
| `epistemic_label` (11-value kernel enum, see ADR-0013), `epistemic_verifier_principal_id` FK→principals | 0010 | CLAIM only | See `HCI_STATE_MACHINES.md` §Epistemic promotion. |
| `domain IN (OPERATIONAL,COMPETENCE,CONFIDENTIALITY,FINANCIAL,STRATEGIC,REPUTATIONAL,GOVERNANCE_POWER)`, `evidence_ref_id`/`evidence_ref_kind` (typed self-FK, person-pinned) | 0011 | TRUST_DOMAIN only | ADR-0004: one row per (person, domain), never a universal scalar. `subject_records_trust_domain_no_supersede` forbids correction — no value exists yet to correct. |
| `payload jsonb NOT NULL DEFAULT '{}'` | 0012 (ADR-0034) | all | The real content/payload column this table lacked through 0001-0011 — app-layer validated (`validate-subject-record-payload.mjs`), not a DB CHECK per ADR-0034. Previous revisions of this table said no such column existed yet; it has since 2026-09-09. |
| `content_hash text`, `prev_hash text` | 0018 | all | Tamper-evidence hash-chain (`security/evidence-integrity/HCI_EVIDENCE_TAMPER_EVIDENCE_SPEC.md` items 4/5) — server-computed only, via `hci.compute_subject_record_hash()`. `prev_hash` chains every row to its immediate predecessor within the same `case_id`, ordered by `system_recorded_at`; `hci.subject_record_chain_tips` (one row per case) tracks the current tip. |

Composite UQ/FK keys used for typed self-reference (so a reference can pin
*which kind* it points at, not just an id): `(tenant_id, id, kind)`,
`(tenant_id, person_id, id, kind)` (0011, narrower — pins the same Person
too). Consumers: `data_subject_request_targets.target_id`,
`source_relationships.claim_id`, `decision_claims.claim_id`,
`subject_records.supersedes_id` (same-kind via the plain `(tenant_id, id)` UQ),
`subject_records.evidence_ref_id` (person-pinned).

## Data subject rights (DSR)

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.data_subject_requests` | `id` PK, `person_id` FK, `request_type IN (ACCESS,CORRECTION,DISPUTE,DELETION)`, `status IN (RECEIVED,IN_REVIEW,RESOLVED,REJECTED)` | see `HCI_STATE_MACHINES.md` §DSR lifecycle; `person_id`/`request_type` frozen once review starts; never deleted | — |
| `hci.data_subject_request_events` | `id` PK, `request_id` FK, `event_type` (6-value enum), `detail NOT NULL`, `created_at` (server-assigned) | append-only | Audit ledger for the DSR lifecycle. |
| `hci.data_subject_request_targets` | `id` PK, `request_id` FK, `target_kind IN (EVIDENCE,CLAIM,ASSESSMENT)`, `target_id` (typed FK into subject_records) | never deleted | What a DSR is about. |

## Decision aggregate

| Table | Columns (beyond tenant_id) | Mutability | Notes |
|---|---|---|---|
| `hci.decisions` | `id` PK, `case_id` FK→cases, `outcome` (6-value enum, `04_HCI30_PRODUCT_SPEC.md` §Decision output — never GOOD_PERSON/BAD_PERSON), `rationale NOT NULL`, bitemporal columns (same shape as subject_records), `author_class='HUMAN_ONLY'` (required, 0008), `principal_id` FK→principals (0008) | append-only, bitemporal-superseded | A Decision must be recorded by a human (`author_class` CHECK), by a named principal. Full Decision workflow semantics (bias-check precondition, requester binding) deferred to whichever ADR resolves HD-19/HD-21 — see `packages/intelligence/bias-check-gate.mjs` for the one piece (04:138) already pulled forward and implemented as an application-layer validator, not a schema constraint. |
| `hci.decision_claims` | `id` PK, `decision_id` FK, `claim_id` FK→subject_records(kind=CLAIM), `created_at` (server-assigned) | append-only | Junction: which Claims a Decision cites. Gated by `enforce_decision_reaudit_gate()` — see `HCI_INVARIANTS.md` §Decision-Claim reaudit gate. |

## Canonical read views (not base tables)

`hci.evidence_current` / `claims_current` / `assessments_current` /
`decisions_current` — `WHERE system_superseded_at IS NULL`, `security_invoker = true`
(RLS evaluated as the querying role). Companion point-in-time functions
`hci.evidence_as_of(timestamptz)` / `claims_as_of` / `assessments_as_of` /
`decisions_as_of` apply `system_recorded_at <= t AND (system_superseded_at IS NULL OR system_superseded_at > t)`.
Column list must be kept in sync between each view and its `_as_of()`
twin — this has broken twice already (0007→0009 M6, 0008→0009 M6); adding a
bitemporal-table column without updating both is a defect, not a style choice.

## Not yet modelled (genuinely open, not oversight)

`Claim` content itself (the `evidence_refs: string[]` shape is opaque —
see `docs/intelligence/HCI_CONTRADICTION_SPEC.md`), `Permission` as schema
(the P0-04 tier enum exists in `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`,
the mapping formula does not — see `docs/intelligence/HCI_PERMISSION_SPEC.md`),
`RiskEvent`, `Outcome` (post-decision real-world result), `Control`/`Mitigation`,
`PersonMergeLog`/`PersonSplitLog`, `Organization`, `Relationship` — all named
in `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`'s 28-entity list but with no
migration yet.
