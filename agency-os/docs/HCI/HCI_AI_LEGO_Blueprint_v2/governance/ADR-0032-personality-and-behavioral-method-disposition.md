# ADR-0032 — Personality and Behavioral Method Disposition

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 method catalog only; this ADR does not authorize processing real third-party personal data, production deployment, or any claim of diagnostic/clinical/legal validity for any method named below.

## Context

`22_OPEN_HUMAN_DECISIONS.md:138-141` (`HD-23`) bundles five method-science calls the reviewers explicitly declined to resolve themselves, each filed as a product-positioning judgment reserved for the operator. `05_HCI30_INTELLIGENCE_METHODS.md:52-53` and `:140` both carry a `🔴 DECISION PENDING (HD-23)` block gating the entire Psychology and Self-reflection sections — "nothing below is implemented until the operator picks."

Current draft state, as written (none of it yet ACCEPTED):
- Big Five is named as a construct with no chosen instrument and no self-report/third-party split (`05:54-64`); the method contract has no field to carry that split (`05:149-166`).
- MBTI-style typing is still listed as an allowed self-reflection method (`05:69`, full self-reflection list `05:138-147`) despite a live trademark exposure — "MBTI" is a registered mark of The Myers-Briggs Company — and weak test-retest reliability.
- Enneagram is listed alongside MBTI with the same implied Grade-D treatment (`05:71`, `:142`), overstating its standing versus the S-A-B-C-D-X evidence scale defined at `05:32-43`.
- 紫微 (Zi Wei Dou Shu) / 八字 (Bazi) sit under the same forbidden-use list as MBTI/Enneagram (`05:144-147`), but that list only blocks *formal/automatic enterprise* scoring — nothing in the current draft stops an HCI Personal single-user vault from entering a named business partner's birth data and informally deciding to trust or distrust them, which is the exact covert third-party-profiling pattern the rest of the document set is built to prevent.
- `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:29-41` still shows the V1 pattern of bare numeric confidence (`Evidence Confidence: 43%`, etc.) as the "changed in V2" recommendation, not yet ratified — no calibrated model exists behind those numbers (`16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:47`, `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04, still open).

Independent evidence for all five sub-questions is in `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md`: F1 (`:68-88`, Big Five instrument/inference-mode gap), F2 (`:89-108`, MBTI removal), F3 (`:110-129`, Enneagram grading), F4 (`:131-150`, Zi Wei/Bazi third-party firewall), F5 (`:152-171`, method-contract schema gap that let F1/F2/F4 happen), F7 (`:194-213`, confidence-percentage false precision).

The operator delegated full decision authority for HCI on 2026-09-02, including decisions previously reserved for human approval (see this session's own instruction; there is no separate operator sign-off document for `HD-23` beyond that delegation — recorded honestly, not backfilled as an item-by-item approval).

## Decision

Resolve `HD-23` as follows. Each sub-decision states the chosen option; the losing alternatives are rejected in engineering terms, not preference.

**(a) Big Five instrument = IPIP-NEO-120.** Named instrument, not the bare construct name currently in `05:54`. IPIP is public domain and free for commercial use, so it ships with zero licensing-review dependency; BFI-2 (Alternative B in F1) needs a separate commercial-licensing review before it could ship at all, and NEO-PI-R (also Alternative B) is proprietary and typically requires credentialed administration — both lose on cost-to-ship, not scientific merit. Add `inference_mode: self_report | third_party_inferred | third_party_applied` to the method contract (`05:149-166`) as F5 already specifies. Grading rule, generalized beyond Big Five to every method carrying this field: **`third_party_inferred` evidence_grade is exactly one grade step below the same method's `self_report` evidence_grade** on the S/A/B/C/D/X scale (`05:32-43`), not the two-step drop F1's draft proposed (`05:61`: A self-report / C third-party-inferred). A fixed one-step rule is machine-checkable per method pair without a fresh judgment call each time a method is added, which is what a *contract* field needs to mean; a two-step, per-reviewer-judgment drop is not reproducible across future methods. For Big Five specifically: `self_report = A`, `third_party_inferred = B`, and every UI/report surface must render the `INFERRED` label whenever `inference_mode = third_party_inferred`.

**(b) MBTI-style typing is REMOVED**, not merely delicensed or kept unscored. F2's kept-with-clearance alternative loses because Big Five already covers the identical self-reflection use case at stronger evidence standing (Grade A vs. weak/no formal grade), so there is no scientific reason to carry the trademark and reliability exposure for a redundant method. Kept-unscored-for-entertainment also loses: the trademark risk in F2 attaches to the "MBTI-style" branding and four-letter typing pattern itself, independent of whether it is formally scored.

**(c) Enneagram carries no formal evidence_grade and is confined to self-reflection modules.** This is F3's "keep ungraded" branch, not its "remove entirely" branch: unlike (d), Enneagram does not require a named third party's identifying data to run, so it does not reproduce the covert-third-party-profiling pattern this ADR is built to close, and removing a self-administered reflection tool with no third-party attack surface is unwarranted scope contraction. `evidence_grade` stays unpopulated (below the S-X scale, not at any grade on it) and Enneagram output must never source an Assessment, TrustDomain, or Decision object.

**(d) Ziwei Dou Shu / Bazi are REMOVED from every path that can target a named third party.** F4's Recommended option, adopted in full: self-only, labeled entertainment, cannot accept a third party's identifying data as input, never feeds an Assessment, TrustDomain, or Decision object — in any edition, including single-user HCI Personal. This is enforced structurally, not by policy prose: the method-registry gains a `third_party_allowed BOOLEAN NOT NULL DEFAULT false` field, checked at method invocation, so every *future* method defaults to third-party-blocked and must explicitly opt in (extends F5's schema-gap fix — `consent_requirement`/`third_party_evidence_grade` alone would not have stopped a Personal-vault user from entering someone else's birth data, since neither field blocks invocation). `ziwei_dou_shu` and `bazi` ship with `third_party_allowed = false`, immutably — only a superseding ADR may flip it.

**(e) Qualitative confidence bands replace bare percentages.** F7's Alternative A, adopted: Evidence Confidence, Model Agreement, Method Robustness, and Decision Confidence (`19:29-32`) render as ICD 203 Words-of-Estimative-Probability bands — `Very Low / Low / Moderate / High / Very High`, each mapped to a published, fixed probability range — until Confidence Algorithm v1 ships with documented calibration/backtesting evidence (P0-04, still open per `16:47`). F7's Alternative B (numeric now with an "uncalibrated" caveat) loses: a caveat next to a precise number does not stop a user from anchoring on the number, which is the exact failure mode F7 and the system's own forbidden-output rule (`06_HCI30_PUBLIC_INTELLIGENCE.md:216-219`, "Fraud Risk = HIGH") already reject elsewhere in this document set.

This decision does not authorize: running any of these methods against real, non-synthetic third-party data; a production deployment of the method catalog; or any marketing or report language claiming diagnostic, clinical, or predictive validity for Enneagram or Ziwei/Bazi.

## Required implementation gates

No design artifact for this ADR exists yet (unlike ADR-0009/0010/0011, which already had `wave1/` specs at acceptance time). Before Wave 4 admits any Method/Assessment data and before Wave 5 implements method math, the following must exist and pass:

1. **Method-contract schema** (Wave 4 — Evidence/Claim/Assessment core; `Method` is the named node in that Wave's acceptance trace `Decision → Assessment → Method → Claim → Evidence → Source`): `methods` table carries NOT NULL `inference_mode` and NOT NULL `third_party_allowed BOOLEAN DEFAULT false`; CI schema-lint test `TEST-METHOD-CONTRACT-COLUMNS-PRESENT` fails the build if either column is missing, nullable-without-default, or `third_party_allowed` defaults to `true`.
2. **(a) Grade-delta enforcement** (Wave 4 schema / Wave 5 P0-04 math spec): trigger `trg_enforce_inferred_grade_one_step_below` rejects any `third_party_inferred` row whose evidence-grade rank is not exactly one step below its `method_family_id`'s `self_report` row; negative test `TEST-METHOD-GRADE-DELTA-BIG-FIVE` seeds IPIP-NEO-120 at self_report=A/third_party_inferred=B and asserts a C-or-lower or A-tied insert is rejected.
3. **(b) MBTI absence** (Wave 4 catalog population): migration-lint check `chk_no_mbti_method` fails the build if any row's `origin` or `method_id` matches `mbti|myers-briggs` (case-insensitive); integration test `TEST-METHOD-CATALOG-NO-MBTI` asserts zero such rows after every migration.
4. **(c) Enneagram firewall** (Wave 4): CHECK constraint `chk_enneagram_ungraded` forces `evidence_grade IS NULL` for `method_id='enneagram'`; negative test `TEST-METHOD-ENNEAGRAM-BLOCKED-FROM-ASSESSMENT` asserts an Assessment/TrustDomain/Decision write citing `enneagram` as `source_method_id` is rejected.
5. **(d) Third-party invocation block** (Wave 4 schema / Wave 5 invocation-path enforcement): `method_invocations` BEFORE INSERT trigger `trg_reject_third_party_method_invocation` raises when `third_party_allowed=false` and `subject_id <> requesting_user_id`; negative test `RLS-METHOD-THIRDPARTY-01` (naming parallel to ADR-0016's `RLS-ESCALATE-01`) attempts a `bazi`/`ziwei_dou_shu` invocation against a third-party subject and asserts rejection; companion test `TEST-ASSESSMENT-REJECTS-ENTERTAINMENT-METHOD-OUTPUT` asserts neither method can appear as an Assessment/Decision `source_method_id` under any subject. Both new tables inherit ADR-0016's mandatory tenant RLS (`tenant_id NOT NULL`, forced RLS, non-owner cross-tenant test) — this ADR does not create an RLS exception.
6. **(e) Confidence-band gate** (Wave 5 — matches `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:89`'s existing acceptance line): the confidence record carries NOT NULL `band` (enum, ICD-203-mapped) and nullable `raw_percentage` gated by CHECK `raw_percentage IS NULL OR calibration_evidence_ref IS NOT NULL`; CI check `TEST-CONFIDENCE-NO-BARE-PERCENTAGE` fails any report/UI template rendering a percentage without a populated `calibration_evidence_ref`. `calibration_evidence_ref` can only be populated by a Wave 11 (Scientific calibration) artifact — reaching Wave 11 does not itself authorize the switch; a superseding ADR does.

Wave 1 (Domain foundation) is unaffected — it need not encode any of the above, since Method is not among its listed V2 new entities.

## Consequences

- The Psychology and Self-reflection sections of `05_HCI30_INTELLIGENCE_METHODS.md` (`:52-53`, `:140`) may drop their `🔴 DECISION PENDING (HD-23)` markers once this ADR and its gates are cross-linked in; the prose recommendations already drafted there become the ratified content, not new content to write.
- `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` §Confidence display moves from "changed in V2, pending" to ratified: qualitative bands are the only confidence surface until Wave 11 delivers calibration evidence.
- Any future method added to the catalog inherits `third_party_allowed=false` by default and the one-step evidence-grade-delta rule; neither can be silently bypassed by a new method definition without failing gate 1/2/5 above.
- This ADR does not resolve `HD-04` (identity-match confirmation, ADR-0015), `HD-03` (data-subject rights, ADR-0014), or `HD-20` (regulatory market scope, still open) — a method with `third_party_allowed=true` in the future still needs those other gates satisfied independently.

## Verification and rollback

- Verification recorded here is documentation-only: the five chosen options are cross-linked to `05_HCI30_INTELLIGENCE_METHODS.md`, `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`, `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md`, and `governance/ADR_INDEX.md`.
- None of the six gates above have been implemented; this ADR authorizes their design and construction, not their completion. No `methods` or `method_invocations` table exists in any runtime yet.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision (the operator retains that right despite the 2026-09-02 delegation). After implementation, rollback must be a reviewed migration — it must not silently re-grade a historical `third_party_inferred` Assessment result or flip `third_party_allowed` on a live method without a superseding ADR, per Invariant 6 (no overwriting historical assessments).

## Evidence

- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:138-141` — `HD-23` statement and options.
- `05_HCI30_INTELLIGENCE_METHODS.md:52-64,69,71,138-169` — current draft state, decision-pending markers, method contract fields.
- `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:29-41` — confidence-display draft state.
- `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md:68-213` — F1, F2, F3, F4, F5, F7 full evidence/alternatives/blast-radius analysis.
- `14_ROADMAP_AND_DEFINITION_OF_DONE.md:71` — method-contract Definition-of-Done requirement.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:75-90` — Wave 4/Wave 5 scope and the existing qualitative-confidence acceptance line this ADR ratifies.
- `governance/ADR-0016-mandatory-tenant-rls.md` — RLS pattern the new `methods`/`method_invocations` tables must inherit; not modified by this ADR.
