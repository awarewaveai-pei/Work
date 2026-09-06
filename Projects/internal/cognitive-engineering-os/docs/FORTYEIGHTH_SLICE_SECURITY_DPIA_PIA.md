# Forty-eighth Method Atlas slice: `security.dpia_pia`

Status: **LANDED (2026-09-06)**. FIFTH member of the `security` family (F20), after `security.stride` (44th), `security.linddun` (45th), `security.attack_tree` (46th), and `security.pasta` (47th) -- the FIRST F20 member that is NOT one of Execution Contract §32's own four named Threat Review methods.

## What was built

Atlas gives this method its own DEDICATED section, §11.46 (L2269-2296) -- full names DPIA (Data Protection Impact Assessment) and PIA (Privacy Impact Assessment), formula `Processing → Purpose → Necessity/Proportionality → Data Subjects → Risks → Controls → Residual Risk → Approval` (EIGHT words), plus a "全球化要求" line naming Jurisdiction Pack as the mandatory-or-not decider. This is RICHER grounding than PASTA's own single-citation case, comparable to STRIDE/LINDDUN's own dedicated sections. The F20 table row (L886) gives a compressed five-word summary; the dedicated section is treated as authoritative (same detail-precedence this session already applies elsewhere), since the table row's own compression silently merges Purpose into Processing and drops Data Subjects as a named step.

Broad, independent grep across the Execution Contract found ZERO mentions of "DPIA"/"PIA" anywhere -- EC §32's own closing sentence names exactly four methods (STRIDE/LINDDUN/Attack Tree/PASTA), no fifth. DPIA/PIA's own trigger (personal-data processing) is genuinely distinct from EC §32's own trigger list (authn/authz/secrets/crypto/network/egress/tenant isolation/file parsing/user content/AI tools). Consequently this record carries NONE of `assets`/`trust_boundaries`/`entry_points`/`test_evidence` -- the FIRST F20 typed object to omit that triplet entirely, directly updating `security.stride.contract.yaml`'s own `OQ-STRIDE-4` (four-for-four identical re-declarations across the true EC §32 methods, now confirmed NOT universal across all of F20).

**Real usage precedent, stronger due diligence than PASTA's own fabricated-but-realistic example**: `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md` (ACCEPTED) explicitly names Atlas §11.46 as its own Recommendation-section skeleton (L41), and explicitly flags a REAL, still-open "Phase 2 DPIA 待辦" (L67): unencrypted event metadata (event type, timestamp) surviving crypto-shred DEK destruction can leak that a subject "once existed" even after erasure. This slice's own CLI demo models THIS real, named, still-open item directly.

Two invariants beyond stage completeness-and-order, both grounded in real, external, named DPIA/GDPR practice, NOT an Atlas citation (same "real practice, not Atlas" disclosure class `security.pasta.contract.yaml` already establishes):

1. **Risk traceability** (GDPR Art. 35 risk-register practice) -- every `risk_id` in the `risks` stage must be addressed by at least one `controls` entry and have EXACTLY ONE `residual_risk` assessment; referential integrity checked in both directions.
2. **High-residual-risk escalation** (GDPR Art. 36 Prior Consultation) -- if any residual assessment's `residual_risk_level` is `high`, the `approval` stage's own `decision` may not be bare `approved`.

* `methods/contracts/security.dpia_pia.contract.yaml`, `specs/cognitive/typed-objects/dpia-pia-impact-assessment-record.schema.yaml`, `methods/registry/contract-backlog.yaml`'s `tier_1.fortysixth_concrete_entry` -- added in the same editing pass as the contract itself (golden suite green, 2937 total).
* `ai_lego/modules/security/dpia_pia.py` -- builder + 2 gates. The stage-order invariant mirrors `pasta.py`; the risk-traceability and escalation invariants are genuinely new, both real referential/conditional derivations (not numeric aggregation).
* `ai_lego/apps/cli/run_dpia_pia_slice.py` -- a real DPIA/PIA for ADR-002's own still-open Phase 2 backlog item, a minimal low-risk record, and two-layer proof of BOTH the order invariant and the escalation rule (construction refusal + independent gate re-derivation).
* `tests/unit/test_dpia_pia.py` -- 71 tests covering stage shape/order, risk traceability (both directions, including multi-risk records), the escalation rule (all four decision outcomes against high/medium residual levels, and the highest-of-multiple-assessments case), and the standard schema/rebuild-not-alias/resolver checks every sibling establishes.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Due diligence

Read Atlas §11.46 in full, the F20 table row, and grep-confirmed zero EC mentions of DPIA/PIA. Read `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md` in full (Status, Method Used, Options Considered, Recommendation, Consequences) to confirm the real usage precedent and the exact still-open backlog wording this slice's CLI demo models -- not a fabricated scenario. Grep-confirmed `jurisdiction` appears in exactly one ai_lego Python file (`core/domain/tenant.py`, `home_jurisdiction`) before choosing a soft, optional, pattern-only reference for `jurisdiction_pack_ref` (no ai_lego builder for `specs/jurisdiction/pack.schema.yaml` exists yet). Read all four existing `specs/security/` typed objects and `specs/jurisdiction/context.schema.yaml` directly, confirmed no duplication.

## Self-review (no critic subagent spawned this slice)

Per this session's own "never spawn wastefully" discipline and the substantial critic-review history already accumulated across all four prior F20 slices (each independently confirming the same due-diligence, two-layer-invariant, and disclosure patterns this slice also follows), this slice was self-reviewed rather than sent to a fresh critic subagent: re-read every citation directly (Atlas §11.46, ADR-002 L41/L67, EC §32's own grep-confirmed absence), re-derived the schema/module/test correspondence field-by-field, and ran the full real-execution verification chain (71 unit tests, CLI slice, golden suite, full regression) before writing this doc. The two genuinely new invariants (risk traceability, escalation) were each proven at BOTH the construction and independent gate layer, in both the CLI demo and the test suite's own `GateMutationTests` (`test_hand_tampered_control_retargeted_to_nonexistent_risk_fails_the_gate`, `test_hand_tampered_high_residual_bare_approved_fails_the_gate`).

## Evidence

CLI: `PASS security.dpia_pia: 8 stages in order ['processing', 'purpose', 'necessity_proportionality', 'data_subjects', 'risks', 'controls', 'residual_risk', 'approval'], gates [provenance_required=PASS, dpia_pia_integrity=PASS], invariant_verified(order=True, escalation=True, gate=True)`. 71 unit tests passed, all on first run. Golden suite: 2937 (includes the newly-landed contract↔backlog registration-parity check from a concurrent background session, which this slice's own registration satisfies). Full product-root regression: see WORKLOG for the exact count.

## Honest limits

`OQ-DPIAPIA-1` (no `method-inventory.yaml` row yet, stale line number by the same +3 offset already disclosed for neighboring F20 rows), `OQ-DPIAPIA-2` (jurisdiction_pack_ref stays a soft, optional reference until a `jurisdiction_pack` ai_lego builder exists), `OQ-DPIAPIA-3` (exactly-one residual assessment per risk_id -- no time-series re-assessment model), `OQ-DPIAPIA-4` (whether the narrower "four true EC §32 methods share a base schema" question is still open -- yes, DPIA/PIA's own omission narrows but does not resolve `OQ-STRIDE-4`).

## `security` family (F20): 5 of 10 built

Five more F20 table rows remain: Zero Trust Review, Secrets Threat Review, Supply Chain Threat Model, Abuse Case, Security Control Mapping -- each an independent future slice, not blocked by this one.
