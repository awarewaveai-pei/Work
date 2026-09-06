# Forty-fifth Method Atlas slice: `security.linddun`

Status: **LANDED (2026-09-06)**. SECOND member of the `security` family (F20), immediately after `security.stride` (44th slice, FIRST member).

## What was built

Atlas gives this method four citations, each independently re-verified by direct read (not inherited from `security.stride`'s own citation set without re-checking): the F20 tool table's LINDDUN row (L885: "DFD→privacy threat categories→controls"); a dedicated §11.45 LINDDUN 隱私威脅建模 section (L2249-2267: seven dimensions -- Linkability, Identifiability, Non-repudiation, Detectability, Disclosure, Unawareness, Non-compliance); the §10 Security recipe row (L1112, the same row `security.stride` cites, confirming LINDDUN sits directly after STRIDE in the same recipe); and §13.11 Security Review Recipe (L3472-3487, "... → STRIDE → LINDDUN → Attack Tree → ..."), verified from the FIRST draft this time -- the exact citation `security.stride`'s own first draft missed and its critic round had to add. A fifth, load-bearing citation shared with STRIDE: Execution Contract §32 Security Change Contract (L1231-1260), which names LINDDUN alongside STRIDE as an acceptable method.

Field shape DELIBERATELY MIRRORS `security.stride`'s own record shape (assets/trust_boundaries/entry_points/data_flow_elements/threats[]/elements_with_no_recorded_threats) exactly, differing only in `threats[].category`'s own vocabulary (LINDDUN's seven privacy dimensions, not STRIDE's six security categories) and identifiers. This directly answers `OQ-STRIDE-4` (raised in STRIDE's own contract, asking whether a shared base schema should be factored out "once a second real instance exists") with "not yet" -- two instances is deliberately treated as still too thin an evidence base for the right shape of a shared abstraction, tracked forward as `OQ-LINDDUN-4`.

* `methods/contracts/security.linddun.contract.yaml`, `specs/cognitive/typed-objects/linddun-privacy-threat-model-record.schema.yaml`, `methods/registry/contract-backlog.yaml`'s `tier_1.fortythird_concrete_entry` -- added in the same editing pass as the contract itself, not deferred (golden suite 2821 -> 2824).
* `ai_lego/modules/security/linddun.py` -- builder + 2 gates, byte-identical in logic to `stride.py` after normalizing STRIDE/LINDDUN naming (independently diffed, not merely asserted).
* `ai_lego/apps/cli/run_linddun_slice.py` -- a real cross-project semantic-memory-retrieval-service privacy review (a Linkability threat recorded against the process element, the shared vector index surfaced as uncovered), a minimal zero-threats reference-service record, plus two-layer attack-and-confirm.
* `tests/unit/test_linddun.py` -- 77 tests, structurally mirroring `test_stride.py`'s own 77, including all-seven-LINDDUN-category and all-four-DFD-element-type round-trips.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Review: self-review with real mutation testing (oracle unavailable)

The `critic` subagent hit an account-wide rate limit (Opus session limit) mid-review and failed before producing findings. Per this session's own standing protocol for when the external oracle is down (do not skip review; do the adversarial self-review plus real mutation testing yourself), the following was done directly instead of retrying the same call:

1. **Independent citation re-verification**: every line-number citation (F20 table L885, §11.45 L2249-2267, §10 L1112, §13.11 L3472-3487, EC §32 L1231-1260) re-read directly from the mother documents, not inherited from `security.stride`'s own citations. All confirmed accurate.
2. **Line-by-line diff against `stride.py`**: normalizing STRIDE/LINDDUN naming differences, the entire builder body and both gate functions are byte-identical between the two modules -- the "mirrors STRIDE exactly" design claim holds under direct verification, not just assertion. Zero accidental logic drift or weakening found.
3. **Real mutation testing, 5 mutations, all killed by name**: referential-integrity check removed (`test_threat_naming_a_nonexistent_element_is_refused_at_construction` + `test_hand_tampered_dangling_threat_element_name_fails_the_gate`); `elements_with_no_recorded_threats` recomputation comparison bypassed (`..._mismatch_fails_the_gate` + `..._falsely_populated_fails_the_gate`); DFD-name-uniqueness check removed (`test_duplicate_data_flow_element_names_are_refused` + `test_hand_tampered_duplicate_element_names_fails_the_gate`); per-threat non-empty-field check truncated to one field (`test_threat_with_empty_control_is_refused` + `test_threat_with_empty_test_evidence_is_refused` + `test_hand_tampered_empty_threat_field_fails_the_gate`, 5 sub-failures); gate's `entry_points` re-verification removed (`test_hand_tampered_non_string_entry_point_fails_the_gate`). All 5/5 killed the exact named tests; file restored byte-identical after each mutation, confirmed programmatically.
4. **Registry registration verified real** by direct grep of `contract-backlog.yaml` (`fortythird_concrete_entry` / `method_id: "security.linddun"`), not by trusting the contract's own prose.
5. **A real follow-up found and fixed**: `architecture.adr.contract.yaml`'s own prose (edited during the STRIDE slice to note "Threat Model now has a machine_id, security.stride") was about to become an incomplete claim the moment LINDDUN shipped as a SECOND Threat Model machine_id. Updated both the `recommended_next` comment and `OQ-ADR-2` to name both `security.stride` and `security.linddun` -- functionally inert (neither feeds `recommended_next`, since Threat Model sits before ADR in the chain), but left as a singular claim it would have been the next stale-prose class this session keeps catching.
6. **DPIA/PIA scope non-absorption confirmed**: F20's own DPIA/PIA row (L886: "processing→necessity/proportionality→risk→controls→approval") is a legal/regulatory-necessity assessment, structurally unrelated to LINDDUN's DFD-based technical threat enumeration -- no proportionality/necessity/approval fields exist in this record, confirming no scope creep.
7. **Dedup re-confirmed independently**: all four `specs/security/*.yaml` typed objects re-read directly (not assumed unchanged since STRIDE's own check) -- none model privacy-threat-review content.
8. **`SECURITY_THREAT_MODEL.md` §4 cross-check**: this repository's own real LINDDUN review, read directly (not deferred to a critic round, the exact class of miss STRIDE's own first draft made). Confirmed it shares the identical `OQ-STRIDE-6` gaps (no severity/source fields, Lk1 scoped to a named data asset rather than a `data_flow_elements[]` entry in the strict DFD sense, review-level not per-threat residual risk) -- pointed to directly via `OQ-LINDDUN-5` rather than re-disclosing under a new id.

No Critical/Major/Minor findings survived this self-review process (none were found in the first place -- the point of the exercise was to prove that, not assume it).

## Due diligence

Broad across all three normative documents from the first draft, re-verified independently rather than inherited from `security.stride`. Confirmed distinct from all four existing `specs/security/` typed objects and from DPIA/PIA's own future scope. This repository's own `SECURITY_THREAT_MODEL.md` §4 checked from the first draft, not caught only by a critic round.

## Evidence

CLI: `PASS security.linddun: 2 elements, 1 threats, uncovered=['shared_vector_index'], gates [provenance_required=PASS, linddun_integrity=PASS], invariant_verified(construction=True, gate=True)`. 77 unit tests passed. Golden suite 2824 (2821 before this slice). Full product-root regression: 1701 tests OK (1624 -> 1701, +77, zero regressions).

## Honest limits

Same disclosed limits `security.stride`'s own contract already names, pointed to directly rather than re-disclosed under new ids where the gap is identical: `OQ-LINDDUN-2` (no LINDDUN-dimension-per-element-type applicability matrix), `OQ-LINDDUN-3` (no cross-validation between framing lists and DFD elements), `OQ-LINDDUN-4` (direct continuation of `OQ-STRIDE-4` -- shared base schema deferred to a real third instance), `OQ-LINDDUN-5` (direct pointer to `OQ-STRIDE-6` -- no severity/source fields, no trust-boundary-scoped threats, no review-level residual risk, both records affected identically). `OQ-LINDDUN-1`: no `method-inventory.yaml` machine_id row yet (that file's own `line: 882` for LINDDUN is itself stale -- pre-existing drift, not this slice's to fix).

## `security` family (F20): 2 of 10 built

Eight more F20 table rows remain: Attack Tree, PASTA, DPIA/PIA, Zero Trust Review, Secrets Threat Review, Supply Chain Threat Model, Abuse Case, Security Control Mapping -- each an independent future slice, not blocked by this one.
