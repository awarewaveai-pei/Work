# HCI Reference Gap Integration Report

## Scope
HCI was used only as a mature reference system. HCI-specific trust, intelligence, person-analysis, tenant, and AI LEGO domain semantics were intentionally excluded.

## Verified reusable gaps

1. **Explainability must be structural, not decorative.** HCI V2 requires important conclusions to expose what evidence could change the result and preserves report/version execution metadata (`HCI_AI_LEGO_Blueprint_v2/19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:47-49,104-106`). Added `experience/EXPLAINABILITY_REPRODUCIBILITY_STANDARD.md` and `schemas/reproducible-output.schema.json`.
2. **Do not average disagreement into false certainty.** HCI V2 explicitly says not to average lens disagreement away and defines visible model disagreement (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:13-23`). Added presentation-integrity and disagreement requirements.
3. **Accessibility/globalization must be architectural.** HCI V2 identifies native globalization/accessibility as a long-term product requirement (`21_HCI_TOP_TIER_GAP_ANALYSIS.md:206-208`). Added `experience/ACCESSIBILITY_GLOBALIZATION_STANDARD.md`.
4. **Human/operator workflows need recovery semantics.** HCI V2 requires rollback across application/database/configuration/policy/prompt/method/workflow dimensions (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:52-54`) and a stop condition when high-impact decisions lack human review (`14_ROADMAP_AND_DEFINITION_OF_DONE.md:86-90`). Added operator-safety and meaningful-human-review contracts.
5. **Behavior-changing replacements benefit from shadow validation.** HCI V2 requires production-old versus shadow-new comparison before cutover (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:44-46`). Added `assurance/COUNTERFACTUAL_SHADOW_VALIDATION_STANDARD.md`.
6. **Counterfactual tests are a general defense against irrelevant-factor leakage.** HCI V2 explicitly tests identical behavior with irrelevant identity changes (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:26-28`). Added counterfactual validation for applicable decision systems.
7. **Human-facing status must reflect canonical system truth.** HCI V2 exposes explicit decision states rather than opaque prose (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:94-96`). Added canonical state/status presentation rule.
8. **UI must not become a second business-logic engine.** HCI 30-year replacement review warns that decision-relevant logic in frontend components converts a framework migration into a domain rewrite (`HCI30_RESEARCH_REVIEW/18_30_YEAR_REPLACEMENT_ANALYSIS.md:36`). Added presentation-layer integrity rule.

## Deliberately not generalized
HCI-specific trust domains, named-person intelligence, evidence scoring formulas, HCI commercial editions, AI LEGO cognitive primitives, HCI-specific regulatory conclusions, and HCI-specific data models remain outside System Foundry.
