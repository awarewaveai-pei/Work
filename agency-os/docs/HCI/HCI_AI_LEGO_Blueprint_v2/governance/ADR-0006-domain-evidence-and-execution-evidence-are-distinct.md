# ADR-0006 — Domain Evidence and Execution Evidence Are Distinct

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create a database schema, migration, or production behavior, and does not resolve `HD-09` (whether the thin-reference types below are vendored from one shared kernel or independently declared and contract-tested).

## Context

The bare word "Evidence" is claimed by two different systems for two different purposes, and nothing today stops them from colliding.

HCI's own Evidence provenance record — `evidence_id`, `tenant_id`, `person_id`, `interaction_id`, `source_type`, `raw_observation`, `confidence`, `corroboration_count`, `classification`, `encryption_key_ref`, `tombstoned_at` — answers "why do we believe something about this Person," is insert-only under a `BEFORE UPDATE/DELETE` trigger, and is one of the tables HCI is declared to own outright (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:104-130`, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:154-158`). AI LEGO separately defines its own `Evidence Record` and `Claim Record` at `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:1-5` and `.../claim.schema.yaml:1-5`, versioned and governed under AI LEGO's own ADR/epistemic-label track — a record of how a cognitive run produced a result, not a fact about a Subject.

The integration contract already names this exact split and already prohibits merging it: `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:61-69` states "Two evidence ledgers" (`HCI Domain Evidence` vs. `AI LEGO Execution Evidence`) and "Do not merge these semantics. HCI assessment may store references to AI LEGO run IDs." Its own enforcement note admits the boundary is not yet schema-enforced: `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:71` — "this boundary is not yet tamper-evident in schema — AI LEGO's `evidence.schema.yaml`/`claim.schema.yaml` are full records under the same bare names HCI uses for its own domain entities." `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:124-128` independently confirms the same gap from the taxonomy side: a canonical `EvidenceRef` thin reference was specified in V1 but "never actually built."

This is currently a documentation-layer promise only. `Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql:71-271` (the Wave 1 synthetic schema, `CREATE TABLE hci.*` list) contains tenant, person, authorization, consent, subject, and identity-verification tables under ADR-0009/0010/0011/0014/0015/0016, but zero `evidence`, `claim`, `assessment`, or `trust_domain` tables — those are scheduled for Wave 4 (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:74-79`, "Wave 4 — Evidence/Claim/Assessment core"). The ledger-separation principle must be ratified as an ADR before that Wave starts, not discovered mid-migration, exactly as `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:128` and `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:90` both say ("before the Wave-1 domain freeze").

## Decision

**HCI Domain Evidence and AI LEGO Execution Evidence are separate ledgers with separate ownership, separate schemas, and separate lifecycle/retention/erasure rules. Only a thin, versioned reference type crosses the boundary — never a full record of either side.**

Concretely: HCI's `evidence`/`claim`/`assessment`/`trust_domain` tables (Wave 4) may carry a nullable pointer column (e.g. `execution_run_ref`) shaped as the `EvidenceRef`/`ActorRef`/`EntityRef` canonical thin-reference types already enumerated at `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:126`, and nothing else of AI LEGO's schema. AI LEGO's `evidence.schema.yaml`/`claim.schema.yaml` remain AI LEGO's own governed artifacts; HCI never joins against them, foreign-keys into them, or imports their field shape. Whether the thin-reference type itself is vendored from one shared kernel package or independently declared on each side and contract-tested for lossless mapping is `HD-09`'s open question (`09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:63-65`) and is explicitly out of scope here — either resolution satisfies this ADR as long as only the thin shape crosses.

**Why the alternatives lose, in engineering terms:**

- *Merge into one shared Evidence table/schema* (reject): couples HCI's insert-only, tenant-RLS, crypto-shredding-eligible domain ledger (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130-140`, Immutability vs. Erasure) to AI LEGO's execution-run internals, which are not subject to the same Person-erasure or bitemporal obligations. It also violates the Independence Requirement HCI must satisfy when AI LEGO is unreachable (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:13-17`), and repeats the exact category-collision error ADR-0010 already ruled out for `Consent` — one bare name silently carrying two legally distinct meanings.
- *Leave it ad hoc / string-typed IDs with no declared reference contract* (reject — V1's original state): this is the "contract vacuum" pattern AI LEGO's own cross-review already flags as a top risk (filename/ID/label drift breaking replay), and it is precisely how `evidence.schema.yaml` ended up a full record sitting where a thin reference belonged (`18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:128`).
- *Two ledgers, thin-reference boundary only* (chosen): keeps each ledger's ownership, retention, erasure, and RLS regime independently correct for its own legal exposure, preserves the Independence Requirement by construction, and is the option every existing chapter (`07`, `09`, `10`, `18`) already converges on — this ADR ratifies it rather than inventing a new position.

## Required implementation gates

Runtime implementation gates are **OPEN**. None of the following exist yet; none are authorized by this ADR alone.

1. **Wave 3** (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:67-71`) — the canonical thin-reference types (`EvidenceRef` at minimum) are built as actual versioned code, not prose, at the location `HD-09` settles on. A schema/contract test (e.g. a JSON-Schema or type-level check under `Projects/internal/hci30/packages/contracts/`) asserts the reference type's field list is a strict, finite subset (id, type, source-system pointer, timestamp) and does **not** structurally match or embed `evidence.schema.yaml`'s or `claim.schema.yaml`'s full field list.
2. **Wave 4** (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:74-79`) — the HCI `hci.evidence`, `hci.claims`, `hci.assessments`, `hci.trust_domains` tables (extending the Wave 1 schema at `Projects/internal/hci30/database/migrations/`) contain no column, foreign key, or view that resolves into AI LEGO's own schema; the only cross-boundary column is the thin-reference pointer from gate 1. A CI-blocking schema-lint check (companion to the existing `H1xxx` domain-error-code pattern already used in `0001_wave1_synthetic_up.sql:23-38`) fails the build if such a column or FK is introduced.
3. **Wave 4/10 admission-gate test** — an executable negative test proving the `HCI Domain Validation → Assessment Candidate → Human/Policy Review → Formal HCI Assessment` sequence (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:47-59`) cannot be bypassed: an attempt to write an AI LEGO `analysis_candidates`/`convergence_summary` response directly into `hci.assessments` without passing through the `Assessment Candidate` intermediate state must be rejected (a dedicated `H10xx`-class SQLSTATE or equivalent API 4xx, following the existing error-registry convention, not a bare exception). Test ID: `EVIDENCE-LEDGER-NEG-01`.
4. **Wave 10 independence test** (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:135-139`) — an executable test proving HCI's own create-person/admit-evidence/create-assessment/create-decision paths function with the AI LEGO integration endpoint entirely unreachable (timeout or connection refused), satisfying the Independence Requirement (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:15`). Test ID: `EVIDENCE-LEDGER-NEG-02`.

Until gates 1-3 are implemented and CI-blocking, no Wave 4 migration may introduce `evidence`/`claim`/`assessment`/`trust_domain` tables that reference AI LEGO's schema directly, and no integration adapter (Wave 10) may write an AI LEGO response into an HCI Assessment table without passing through the admission-gate state machine.

## Consequences

- HCI's own Evidence/Claim/Assessment/TrustDomain tables remain the only source of "why do we believe something about this Person," under HCI's own RLS, retention, and erasure rules (ADR-0016, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Immutability vs. Erasure).
- AI LEGO's execution evidence (`evidence.schema.yaml`/`claim.schema.yaml`, run IDs, method versions) remains AI LEGO's own governed artifact; HCI treats it as an external system's output referenced by ID, never as HCI's own row.
- An AI LEGO analysis result is never self-admitting: it must clear `HCI Domain Validation` and `Human / Policy Review` before it can become a Formal HCI Assessment (already stated at `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:45`, now gated by an executable test rather than prose alone).
- This ADR does not authorize: real-person data in any HCI Evidence/Assessment table, a production deployment of Wave 4 or Wave 10, resolution of `HD-09` (kernel vendoring mechanism), resolution of `HD-06` (bitemporal scope) or `HD-07` (erasure mechanism) for either ledger, or any legal claim about AI LEGO output's admissibility as evidence in a non-HCI sense.
- A future proposal to fold the two ledgers together, or to let HCI query AI LEGO's schema directly, requires a superseding ADR, not a Wave-level implementation decision.

## Verification and rollback

- Verification recorded here is documentation-only: the boundary and its current gap are cross-linked to `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`, `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md`, and `governance/ADR_INDEX.md`.
- The thin-reference type, the Wave 4 schema-lint check, and both negative tests (`EVIDENCE-LEDGER-NEG-01`, `EVIDENCE-LEDGER-NEG-02`) have not been implemented; their gates remain open, and no runtime claim of enforcement is made by this ADR.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must be a reviewed migration that does not silently re-merge the two ledgers or delete existing thin-reference pointers; any de-scoping of the boundary needs its own superseding ADR, mirroring the rollback discipline already set by ADR-0016.

## Evidence

- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:104-130,154-158` — HCI's own Evidence provenance fields and domain DB ownership boundary.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:13-17,41-59,61-69,71` — Independence requirement, response package non-admission, Two evidence ledgers, enforcement note.
- `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:124-128` — Canonical cross-system references and the confirmed-unbuilt `EvidenceRef`.
- `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:61-90` — Shared Kernel section, `HD-09` scope boundary (out of scope for this ADR).
- `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:1-5`, `.../claim.schema.yaml:1-5` — AI LEGO's own governed Execution Evidence schema.
- `Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql:23-38,71-271` — current Wave 1 synthetic schema (no evidence/claim/assessment/trust_domain tables yet) and the `H1xxx` error-code convention gate 2/3 extend.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:43-46,67-71,74-79,135-139` — Wave 1, 3, 4, and 10 scope and acceptance criteria.
