# Fiftieth Method Atlas slice (provisional ordinal): `security.secrets_threat_review`

Status: **LANDED (2026-09-06)**. SIXTH member of the `security` family (F20), after `security.stride` (44th), `security.linddun` (45th), `security.attack_tree` (46th), `security.pasta` (47th), and `security.dpia_pia` (48th) -- the SECOND F20 member (after `security.dpia_pia`) that is NOT one of Execution Contract §32's own four named Threat Review methods. Ordinal is provisional: four sibling F20 members (Zero Trust Review, Supply Chain Threat Model, Abuse Case, Security Control Mapping) were being built concurrently this same session by other agents, so the exact "Nth Method Atlas slice" and "Nth `contract-backlog.yaml` tier_1 entry" numbers depend on merge order -- see "Text needed in shared files" below.

## Duplication check performed FIRST (before any design work)

`specs/security/key-vault-lifecycle.schema.yaml` was read in full. It is confirmed a **narrow, different-purpose object**: it models the internal STATE of one Key Vault instance's cryptographic key records (`key_use` enum EXACTLY `[KEK, DEK, HMAC_SIGNING_KEY]` -- crypto keys only), with `key_record`, `key_destruction_record`, `vault_restore_event`, and `rollback_scenario` shapes covering issuance-through-destruction of ONE vault. It has no `access` concept (who/what may use a key) and no `exposure` concept (the EC §33 forbidden-locations list). Execution Contract §33 "Secrets Contract" (`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1264-1300`, grep-confirmed heading) was also read in full: a forbidden-locations list, a preferred-mechanisms list, and a mandatory STOP→REVOKE/ROTATE→INVESTIGATE→RESUME flow -- real, load-bearing prose with **zero machine-checkable predicate anywhere in the spec root before this slice**.

Neither file, nor their combination, already provides a staged, gated review record for the six-stage chain Atlas's own F20 table row names (`inventory→storage→access→rotation→exposure→revocation`, covering eight secret kinds, crypto keys being only one). **Conclusion: this contract is genuinely additive, not a duplicate.** It cross-references (does not re-declare) `key-vault-lifecycle.schema.yaml` for the one secret type both touch (`crypto_key`), via `storage.entries[].key_vault_ref` -- a soft pointer, not a hard `$ref` (see "Real invariants" below for why).

## Grounding: Atlas gives no dedicated section, but three converging citations do

Grep-confirmed: zero `^#.*Secret` headings anywhere in the Atlas file -- no dedicated `§11.4x`-style section exists for this method, unlike STRIDE/LINDDUN/DPIA-PIA. In isolation, the ONLY direct citation is the F20 tool table row (`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:888`: "Secrets Threat Review | 檢查秘密生命週期 | inventory→storage→access→rotation→exposure→revocation | 防 secrets 進 argv/log/git"). Three additional, independently grep-verified citations converge on the same concept:

1. **Atlas §13.11 Security Review Recipe** (`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3472-3487`; heading L3472, "Secret / Identity Review" itself at L3481) -- names this concept as recipe step 7, between Attack Tree and Supply Chain Review, in the SAME causal position (Threat-Model-step feeding an eventual ADR) STRIDE/LINDDUN/Attack-Tree/PASTA already occupy.
2. **`docs/architecture/SECURITY_THREAT_MODEL.md`** (this repository's own real, applied Phase 2 Security Threat Review, PROPOSED 2026-08-29) -- L38 and L52 explicitly disclose "Secret / Identity Review" as an undone Phase 3 backlog item: `| Secret / Identity Review | ❌ 不含，列 Phase 3 待辦 | 尚無 IdP/secret store 實作可審 |`. Same due-diligence class `security.dpia_pia`'s own ADR-002 "Phase 2 DPIA 待辦" precedent already establishes.
3. **Execution Contract §33 "Secrets Contract"** (`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1264-1300`) -- a real, dedicated, SIBLING section to §32, not part of it. Grep-reconfirmed: §32's own closing sentence (L1260) names exactly STRIDE/LINDDUN/Attack Tree/PASTA -- this method is NOT a fifth alternative. Consequently this record carries none of `assets`/`trust_boundaries`/`entry_points`/`test_evidence`, a SECOND F20 typed object (after DPIA/PIA) to omit that triplet.

**A genuinely disclosed tension, not silently resolved**: Atlas §13.11's own recipe names ONE combined step, "Secret / Identity Review", while the F20 tool table SPLITS this into two rows: "Zero Trust Review" (L887) and "Secrets Threat Review" (L888, this contract's own row). This contract covers ONLY the "Secret" half; the "Identity" half is `security.zero_trust_review`, built concurrently this same session by a different agent -- not built, not claimed, not coordinated with here.

**A further R4 finding, not this contract's file to fix**: `docs/architecture/SECURITY_THREAT_MODEL.md:35` cites Atlas §13.11 as "L3504-3519" -- grep-verified WRONG; real location is L3472-3487. Same recurring stale-mother-document-line-number class already disclosed elsewhere in this corpus.

## Real, closed, in-repository lifecycle precedent

`CLAUDE.md:17` records "前公司桌機憑證善後已於 2026-08-15 結案" (former-employer desktop-machine credential cleanup, closed 2026-08-15), cross-confirmed by `agency-os/WORKLOG.md:3102` and `:10499`. This slice's own CLI demo and test fixtures model an **illustrative reconstruction** of that real, closed event: the fact and its close date are real and cited; the granular per-secret inventory (an SSH crypto key deferring to the Key Vault, and a git deploy SSH key) is disclosed as a reasonable reconstruction, not verbatim source content (no mother document enumerates the exact secret-by-secret breakdown) -- the same honesty class `security.pasta.contract.yaml`'s own disclosed "fabricated-but-realistic" precedent establishes, but anchored to a real, named, closed event.

## Real invariants beyond stage completeness-and-order

Both grounded in EC §33's own real, dedicated content (an in-repository load-bearing contract section, a different grounding class from `security.pasta`/`security.dpia_pia`'s own "real external practice" disclosures, but the same "not a bare Atlas citation" honesty discipline):

1. **Exposure-triggers-mandatory-response-flow, ONE-DIRECTIONAL.** If a secret has ANY recorded `exposure` finding, the matching `revocation` entry's `response_flow.triggered` MUST be `true` and `flow_stage_reached` MUST NOT be `NOT_TRIGGERED`. A secret with NO exposure finding carries no requirement in either direction: `response_flow.triggered` must always internally agree with `flow_stage_reached` (true iff not `NOT_TRIGGERED`), but the secret may be legitimately, proactively revoked for other real reasons (departure, scheduled decommission). Directly encodes EC §33's own mandatory "STOP→REVOKE/ROTATE→INVESTIGATE→RESUME" flow (L1290-1300) as a MINIMUM for exposed secrets, not an exclusive trigger for revocation.
2. **Crypto-key secrets defer to the Key Vault as sole owner.** Every `inventory` secret with `secret_type: crypto_key` MUST have a non-null `storage.entries[].key_vault_ref` (a soft, pattern-free pointer to `key-vault-lifecycle.schema.yaml`'s own `key_record.key_id`); every other `secret_type` MUST have `key_vault_ref: null`. The concrete anti-duplication mechanism: a crypto-key secret's rotation/destruction/physical-copies detail lives exclusively in the Vault's own `key_record`; this record only points at it.

`storage_mechanism`/`exception_justification` (EC §33's own "優先" preferred-mechanisms list, with a disclosed-deviation escape hatch for `OTHER`) and cross-stage secret-id traceability (`storage`/`access`/`rotation`/`revocation` must each cover EXACTLY the secret set `inventory` declares; `exposure` is a deliberately sparse findings-only list) are treated as part of stage completeness-and-order, the same class `security.dpia_pia`'s own risk-id traceability is treated as part of its own stage validity.

## Why `key_vault_ref` is a soft reference, not a hard `$ref`

Unlike `security.dpia_pia`'s own `jurisdiction_pack_ref` (soft because no `ai_lego` builder existed yet), a real working builder DOES exist here: `ai_lego/security/key_vault/local_key_vault.py`. The reasoning is different: `key-vault-lifecycle.schema.yaml` exposes no atomic "key-id-only" sub-schema -- only the full `key_record` object. A hard `$ref` would require embedding an entire key record (algorithm, rotation_policy, physical_copies, status...) inside this record's own `storage` stage entry, duplicating fields whose single canonical owner is the Key Vault -- directly contradicting the "one clear owner per concern" principle. A bare string pointer preserves single ownership while still giving a real, runtime-checked cross-reference.

## What was built

* `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/contracts/security.secrets_threat_review.contract.yaml`
* `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/secrets-threat-review-record.schema.yaml`
* `Projects/internal/cognitive-engineering-os/ai_lego/modules/security/secrets_threat_review.py` -- builder + 2 gates (`provenance_required`, `secrets_threat_review_integrity`)
* `Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/run_secrets_threat_review_slice.py` -- the illustrative former-employer-desktop-cleanup record, a second exposed-`api_key` record, and two-layer proof of both real invariants (construction refusal + independent gate re-derivation)
* `Projects/internal/cognitive-engineering-os/tests/unit/test_secrets_threat_review.py` -- 89 tests covering stage shape/order, cross-stage secret traceability, the crypto-key-defers-to-vault rule (both directions), the exposure-response-flow rule (both the exposed-must-trigger direction and the unexposed-may-still-be-revoked non-constraint), response-flow internal consistency, and the standard schema/rebuild-not-alias/resolver checks every sibling establishes.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module. `MethodCatalog.from_spec_root` scans `methods/contracts/*.contract.yaml` directly (confirmed by reading `method_resolver.py`), so this method resolves at runtime without any edit to `contract-backlog.yaml` or `method-inventory.yaml`.

## Self-caught bug: the first draft fabricated a reverse-direction rule

The first draft of the `response_flow` invariant asserted BOTH directions: exposed secrets must trigger the flow, AND unexposed secrets must leave it untouched. Running the real test suite against the real-world cleanup scenario (`CLAUDE.md:17`'s own precedent, where both secrets are proactively, fully revoked despite having **zero** exposure findings) immediately failed 10 tests and 1 schema-example check -- the reverse direction was a fabricated, undisclosed over-constraint with no basis in EC §33's own text (that section conditions the flow on *possible exposure*; it never claims exposure is the *only* legitimate trigger for revocation). The invariant, the module, the CLI proof step, the test suite, and this contract/schema's own documentation were all corrected in place before this slice was declared done: `response_flow` is now checked for (a) internal consistency (`triggered` agrees with `flow_stage_reached`) for every secret, and (b) the one-directional exposed-implies-triggered rule. This is exactly the class of self-review this corpus's `security.dpia_pia.contract.yaml` and `security.pasta.contract.yaml` already warn about ("undisclosed over-constraint") -- caught here by real execution, not by inspection alone.

## Evidence

CLI: `PASS security.secrets_threat_review: 6 stages in order ['inventory', 'storage', 'access', 'rotation', 'exposure', 'revocation'], gates [provenance_required=PASS, secrets_threat_review_integrity=PASS], invariant_verified(vault_defer=True, vault_defer_reverse=True, exposure_flow=True, proactive_revocation_legal=True, consistency_guard=True, gate=True)`. 89 unit tests passed (`python -m unittest tests.unit.test_secrets_threat_review -v`), all after the invariant fix described above.

## Text needed in shared files (NOT written by this task -- report only, verbatim, ready to paste)

This task's own scope forbids editing `contract-backlog.yaml`, `method-inventory.yaml`, `WORKLOG.md`, `TASKS.md`, or any sibling `security.*.contract.yaml` file. The exact text needed:

**`methods/registry/contract-backlog.yaml`, `tier_1`** (key name is a placeholder -- four sibling agents are concurrently adding their own entries this same session; pick whichever ordinal word is actually next when integrating, e.g. `fortyseventh_concrete_entry` if this lands before the others, or later if not):

```yaml
  <next_ordinal>_concrete_entry:
    method_id: "security.secrets_threat_review"
    contract_status: complete
    tier: 1
    mandated_by: >
      Same class of justification as every entry above. SIXTH entry from
      the `security` family (F20), after security.stride, security.linddun,
      security.attack_tree, security.pasta, and security.dpia_pia. Atlas
      gives this method NO dedicated section (grep-confirmed), only its own
      F20 table row (L888) -- but three converging citations (Atlas §13.11
      Security Review Recipe L3472-3487, this repo's own
      docs/architecture/SECURITY_THREAT_MODEL.md L38/L52 honestly
      disclosing it as an undone Phase 3 backlog item, and EC §33's own
      dedicated "Secrets Contract" section L1264-1300) together give it
      richer grounding than a bare table row, distributed across locations
      rather than concentrated in one section. SECOND F20 member (after
      DPIA/PIA) that is NOT one of EC §32's own four named Threat Review
      methods.
    real_invariant_beyond_schema_shape: >
      Two invariants beyond stage completeness-and-order, both grounded in
      EC §33's own real, dedicated content: (1) exposure-triggers
      -mandatory-response-flow, ONE-DIRECTIONAL (an exposed secret's
      revocation entry must show the flow triggered past NOT_TRIGGERED; an
      unexposed secret carries no requirement in either direction, since it
      may be legitimately, proactively revoked for other reasons -- the
      first draft of this rule wrongly asserted the reverse direction and
      was caught and corrected by this slice's own real test suite, see
      docs/FIFTIETH_SLICE_SECURITY_SECRETS_THREAT_REVIEW.md); (2)
      crypto-key-defers-to-key-vault (a crypto_key secret's storage entry
      must carry a non-null soft pointer into
      specs/security/key-vault-lifecycle.schema.yaml's own key_record.key_id;
      every other secret_type must not) -- the concrete anti-duplication
      mechanism confirmed against that pre-existing, narrower, STATE
      -focused sibling object.
    source: "methods/contracts/security.secrets_threat_review.contract.yaml (built this session, mints machine_id security.secrets_threat_review) + specs/cognitive/typed-objects/secrets-threat-review-record.schema.yaml (new output type)"
    note: >
      Not placed under tier_0: same "table row thin, converging citations
      thick" pattern this contract's own description establishes -- a
      genuinely different grounding SHAPE from STRIDE/LINDDUN/DPIA-PIA's
      own single-dedicated-section richness. Tier 1, mandated by the
      actively-running implementation slice. SIXTH entry of the `security`
      family -- four more F20 table rows remain (Zero Trust Review, Supply
      Chain Threat Model, Abuse Case, Security Control Mapping), each an
      independent slice built concurrently this same session by other
      agents, not blocked by this one.
```

**`methods/registry/method-inventory.yaml`** -- the existing row (verified at the line shown by this session's own grep) should gain `has_contract: true` and a `machine_id: security.secrets_threat_review`:

```yaml
      - name: "Secrets Threat Review"
        line: 885   # stale by the same +3 offset already disclosed for neighboring F20 rows; real Atlas line is L888
        category: "F20 security"
        has_contract: true
        contract_status: complete
        machine_id: "security.secrets_threat_review"
```

**`methods/contracts/security.stride.contract.yaml`'s own `OQ-STRIDE-4`** (this contract does NOT edit that file): its `resolved_by` field could be extended with a THIRD data point --

```
`security.secrets_threat_review` (built the same session as `security.dpia_pia`) is a SECOND F20 member, after DPIA/PIA, that is grep-confirmed absent from EC §32 entirely and carries none of assets/trust_boundaries/entry_points -- further narrowing (not resolving) the open question: a shared base schema for the EC §32 triplet remains PLAUSIBLE across the four true EC §32-named Threat Review methods, but two of the remaining six F20 members built so far (DPIA/PIA, Secrets Threat Review) both confirm it is NOT universal across all of F20.
```

**`docs/architecture/SECURITY_THREAT_MODEL.md:35`** -- its own citation of Atlas §13.11 ("L3504-3519") is stale; the real location, grep-verified by this contract's own due diligence, is L3472-3487.

## Honest limits / open questions deliberately left disclosed

* `OQ-SECRETSREVIEW-1`: no `method-inventory.yaml` row/machine_id yet (see "Text needed in shared files" above).
* `OQ-SECRETSREVIEW-2`: whether a future revision should cross-link this contract's own `recommended_next` with `security.zero_trust_review`'s own (the two contracts split Atlas §13.11's combined "Secret / Identity Review" step) -- deliberately NOT coordinated with a concurrently-in-flight sibling file this task's own scope did not include.
* `OQ-SECRETSREVIEW-3`: `SECURITY_THREAT_MODEL.md:35`'s own stale Atlas §13.11 citation -- not this contract's file to fix.
* `OQ-SECRETSREVIEW-4`: `key_vault_ref` stays a soft reference until `key-vault-lifecycle.schema.yaml` (a file this contract is forbidden from editing) carves out an atomic key-id-only sub-schema to hard-`$ref` against.
* `OQ-SECRETSREVIEW-5`: the `exposure` stage's sparse (findings-only) shape trades audit-completeness (no way to machine-confirm all ten locations were actually checked for a given secret) for practicality -- a future revision could add an optional `locations_checked` manifest per secret without making it mandatory.

## `security` family (F20): 6 of 10 built

Four more F20 table rows remain: Zero Trust Review, Supply Chain Threat Model, Abuse Case, Security Control Mapping -- each built concurrently this same session by other agents, not blocked by this one.
