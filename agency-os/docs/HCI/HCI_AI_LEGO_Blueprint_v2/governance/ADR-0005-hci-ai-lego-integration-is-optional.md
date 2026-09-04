# ADR-0005 — HCI × AI LEGO Integration Is Optional

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create a database schema, migration, or production behavior, and does not authorize real-person data processing or a production deployment.

## Context

The blueprint already states the integration boundary in prose but has never ratified it as a governed decision.

- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:3-5` declares the principle "Optional integration between independent peer systems," and `:11` states "Neither product is a submodule of the other."
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:13-17` (§Independence requirement) enumerates the specific HCI workflows that must keep working when AI LEGO is unavailable — create/edit persons, create relationships, record interactions, admit evidence, view timelines, create manual assessments, create decisions, view historical data — and requires the converse: "AI LEGO must remain fully usable for non-HCI cognitive work."
- `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:96-98` (§AI LEGO must not own) and `:100-102` (§HCI must not duplicate) draw the same peer boundary from the AI LEGO side.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:135-139` schedules the adapter as its own Wave (Wave 10 — Optional AI LEGO integration, path `D:\Work\Projects\internal\hci30\integrations\cognitive-os\`), after every core-workflow Wave (Wave 1 domain foundation through Wave 9 enterprise readiness). Its acceptance line already reads "no direct DB, timeout/failure graceful, contract compatibility, AI results cannot self-admit as HCI facts, run references preserved, convergence != evidence confidence."
- `ADR_INDEX.md:23` listed this exact topic as `ADR-0005 | HCI × AI LEGO integration is optional | ... | PLANNED | Not recorded` at drafting time — the file had never existed. Both are now stale: the index row is `ACCEPTED` and this file exists, as of the same edit batch.

The gap is not disagreement about the principle; every source document above already assumes it. The gap is that nothing here is a ratified ADR.

Nothing currently blocks a future implementer from wiring a core HCI workflow — Person, Case, Evidence, Assessment, Decision, or the DataSubjectRequest lifecycle already under synthetic construction at `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql` — to require the adapter's presence. That would silently convert an optional peer integration into a hard dependency, with no ADR to cite against it.

## Decision

Adopt the option already implied throughout the blueprint: **AI LEGO integration is a disabled-by-default, optional adapter module confined to `integrations/cognitive-os/`; every HCI core workflow (Person, Case, Evidence, Assessment, Decision, DSR) must complete correctly with the adapter absent, unreachable, or disabled.**

This rules out the two alternatives visible in the source documents:

- **Reject as a required dependency instead** — core workflows call the adapter synchronously and fail if it does not respond.
  Loses because `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:87` already rejected "Pure synchronous REST ... as the sole transport" for exactly this reason: "blocking HTTP couples HCI's own request-thread availability to AI LEGO's completion time, violating the Independence Requirement."
  A required dependency also collapses the peer-product boundary `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:96-102` and `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:11` both state, and would strand any HCI deployment that has not purchased or provisioned Cognitive OS.
- **Merge as one shared runtime instead** — no adapter boundary; HCI calls Cognitive OS internals directly.
  Loses on the same evidence used to reject full event-driven coupling in `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:87`: it would make "the broker itself ... a new shared-fate dependency," here generalized to the whole runtime, on "the verified single-box baseline" with no HA.
  It also violates `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:83`'s existing constraint that the integration layer "must not contain HCI core logic or Cognitive OS core logic," and directly contradicts the "Neither product is a submodule of the other" statement at line 11.

## Required implementation gates

No wave1/ design artifact for this adapter exists yet (unlike ADR-0009/0010/0011, which already have `wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md`, `wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`, and `wave1/HCI_WAVE1_DOMAIN_ERD.md`). Runtime implementation gates are **OPEN**. Two land in Wave 1 (they protect the core schema that is already under construction), two land in Wave 10 (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:135`, when the adapter is actually built):

1. **[Wave 1 — now] No hard schema dependency.**
   No Wave 1 migration outside a future `integrations/cognitive-os/` schema may declare a `NOT NULL` foreign key from a core table (`person`, `case`/`engagement`, `evidence`, `assessment`, `decision`, `data_subject_request`, per `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql`) into any cognitive-os-owned entity.
   Any future run reference (e.g. `execution_run_id`, `replay_reference` per `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:43`) must be a nullable, unenforced-FK reference column.
   Test-id `HCI-INDEP-SCHEMA-01`, added to `D:\Work\Projects\internal\hci30\scripts\mutation-check-wave1.ps1`'s constraint set: CI-blocking, fails if such a `NOT NULL`/enforced-FK constraint is introduced.
2. **[Wave 1 — now] Adapter-absent runtime proof.**
   Test-id `HCI-INDEP-RUNTIME-01`, added under `D:\Work\Projects\internal\hci30\tests\`: runs the full core lifecycle from `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:15` (create/edit person, create relationship, record interaction, admit evidence, view timeline, create manual assessment, create decision) plus DataSubjectRequest create/access/correct/delete against the synthetic DB, with the test harness's network egress to any cognitive-os host blocked, and asserts a full pass.
   This is the machine-checkable form of the Independence requirement itself and must be green before Wave 1 schema freeze.
3. **[Wave 10] Module-isolation CI check.**
   A CI-blocking `dependency-cruiser`/import-linter config committed at `D:\Work\Projects\internal\hci30\integrations\cognitive-os\.dependency-cruiser.cjs`, enforcing `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:83`'s existing prose rule mechanically: zero imports from HCI core domain modules into `integrations/cognitive-os/` internals, and zero imports the other direction beyond the declared adapter/request-mapper/result-mapper/policy-mapper interface.
   Required before the adapter's first PR merges.
4. **[Wave 10] Default-off flag and graceful-degradation test.**
   An integration-enablement flag (e.g. `cognitive_os_integration.enabled`) that defaults to `false`/absent, verified by a config-schema test.
   Test-id `HCI-INDEP-FAILOVER-01` simulates the adapter returning 5xx or timing out and asserts: (a) the calling Case/Evidence workflow completes or fails cleanly with no hang, matching `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:139`'s "timeout/failure graceful" acceptance line; (b) no AI LEGO response is written directly into the `assessment` table — only into an Assessment Candidate state pending human review, per `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:45` ("This response does not automatically become HCI fact") and the admission-gate diagram at `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:47-59`.

## Implementation note (2026-09-05, gate 1 landed, gate 2 assessed as blocked)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

- **Gate 1 (`HCI-INDEP-SCHEMA-01`) was not built as a separate mechanism.**
  It asks for a test that fails if any Wave 1 migration declares a `NOT
  NULL`/enforced FK from a core table into a cognitive-os-owned entity.
  `ADR-0001` gate 2 (`ARCH-PEER-02`, `migrations/*`, real-Docker-verified
  2026-09-05) already asserts something strictly broader: no `pg_constraint`
  of type `f` anywhere in schema `hci` may reference a relation outside that
  schema, `NOT NULL` or not, cognitive-os-specific or not. Any FK this gate
  worries about is necessarily also a violation of that one. Building a
  second, narrower test for the same invariant would be exactly the
  duplicate-mechanism pattern this project's own anti-patch discipline
  rejects (close the class once, not per-caller). `ARCH-PEER-02`'s own test
  ID is what closes this gate; no `HCI-INDEP-SCHEMA-01`-named assertion
  exists or is needed.
- **Gate 2 (`HCI-INDEP-RUNTIME-01`) is genuinely not implementable yet, not
  skipped.** It requires exercising the full core HCI lifecycle (create/edit
  person, create relationship, record interaction, admit evidence, view
  timeline, create manual assessment, create decision, plus the
  DataSubjectRequest lifecycle) with the adapter unreachable. None of that
  application/API surface exists at Wave 1 — this repo is schema-only so
  far (`database/`, no `domain/`/`api/`). Recorded `OPEN`, to be built once
  that surface exists, not faked against a database that has no application
  layer to run "core use cases" through.
- Gates 3-4 remain `OPEN`, unchanged, correctly scoped to Wave 10.

## Consequences

- Every HCI deployment must be independently operable and sellable with the adapter switched off; product, sales, and infra planning may not assume Cognitive OS reachability as a precondition for HCI's own core value.
- AI LEGO remains free to serve non-HCI cognitive work with no HCI-specific coupling in its core (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:17`); this ADR does not let HCI schema, policy, or naming leak into AI LEGO's domain core, matching `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:96-102`.
- This ADR does not authorize building the Wave 10 adapter now, does not authorize any AI LEGO analysis output to become a Formal HCI Assessment without passing the admission gate (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:47-59`), and does not resolve the still-open `HD-08` field-authority enumeration or `HD-22` usage-metering question in `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`.
- This ADR does not authorize processing real-person data, a production deployment, or any legal/compliance claim; scope is architecture only, matching the Scope line above.
- A later change to this boundary (e.g. making any part of the integration mandatory) requires a new HCI change proposal and an explicit superseding ADR — not a quiet edit to `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`.

## Verification and rollback

- Verification recorded here is documentation-only: the decision is cross-linked to `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`, `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`, and `governance/ADR_INDEX.md`.
- None of the four required gates above have been implemented; all four gates remain open. Gates 1-2 are assigned to Wave 1 (in progress) and should close before Wave 1 schema freeze; gates 3-4 are assigned to Wave 10 and cannot close before that Wave starts.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision — the operator retains the right to override this Claude-made decision at any time.
- After implementation, rollback must not delete the `integrations/cognitive-os/` isolation boundary in place; any future move toward tighter coupling requires a reviewed migration and a new superseding ADR, not an in-place relaxation of the gates above.

## Evidence

- `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:96-102` — AI LEGO must-not-own / HCI must-not-duplicate boundary.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:3-17,41-59,73-88,130-142` — Principle, Independence requirement, Response package/admission gate, integration layer path and isolation rule, Transport decision, Compatibility fail-closed rule.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:11-21,135-142` — dependency order placing "Optional AI integration" after core workflow; Wave 10 path and acceptance criteria.
- `governance/ADR_INDEX.md:23` — prior `PLANNED` registration of this exact topic, sourced from `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` and `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`.
- `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql` and `D:\Work\Projects\internal\hci30\README.md` — current Wave 1 synthetic core schema that gates 1-2 attach to.
