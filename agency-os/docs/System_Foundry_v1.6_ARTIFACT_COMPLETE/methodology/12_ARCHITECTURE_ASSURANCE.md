# Architecture Assurance Standard

## Purpose
正式的架構把關關卡：把步驟 01-11 累積的證據組成一份 Claim-Argument-Evidence 式的保證案例，決定架構是否被「assured」。

## Sequencing
Step 12. Consumes evidence from every prior step since `00_IDEA_INTAKE_STANDARD.md`, particularly closed red-team findings (`10_RED_TEAM_STANDARD.md`) and the complexity audit (`11_COMPLEXITY_AUDIT.md`). Feeds `13_CONVERGENCE_STANDARD.md`.

## Required Scope
- claim
- argument
- evidence
- residual risk
- independent review

## Required Fields
1. **Claim register / claim tree** — top-level trustworthiness/fitness claims for the proposed architecture, decomposed per `assurance/CLAIM_ARGUMENT_EVIDENCE.md` down to claims directly backed by steps 01-11's evidence.
2. **Control evidence matrix** — for each control this architecture relies on (security, operational, compliance), evidence it actually operates (`assurance/CONTROL_EVIDENCE_STANDARD.md`), not just that it's documented.
3. **Golden/contract test evidence** — positive and adversarial negative fixtures exist for the machine-checkable parts of the design (`assurance/GOLDEN_TEST_STANDARD.md`).
4. **Counterfactual/shadow validation, if applicable** — required when the design includes a classification/recommendation/automated-decision component (`assurance/COUNTERFACTUAL_SHADOW_VALIDATION_STANDARD.md`); explicitly marked not-applicable otherwise.
5. **Residual risk statement** — explicit, not omitted; every assurance case has some residual risk, and hiding it is worse than stating it (`assurance/ASSURANCE_CASE_STANDARD.md`).
6. **Independent reviewer** — the person granting assurance MUST NOT be the architecture's sole author (`kernel/04_SUBAGENT_INHERITANCE.md` independence-of-roles requirement, `assurance/INDEPENDENT_REVIEW_STANDARD.md`).

## Assurance Outcomes
Assurance is granted, granted-with-conditions (named conditions and owners), or denied. A denial MUST specify exactly which prior step's evidence is insufficient and route back to it — not a vague "needs more work."

## Gate
`G8_ASSURANCE_READY` (`runtime/stage-gates.yaml`) requires: claim_register, control_evidence_matrix, independent_review, golden_contract_tests, counterfactual_shadow_validation_if_applicable; stops on `INDEPENDENCE_VIOLATION` or `ADVERSARIAL_TEST_FAILED`. It fails when the claim register has no residual-risk statement, when the assurance reviewer is the same individual who authored the architecture options in `05_ARCHITECTURE_OPTIONS.md`, or when any required field above is missing.
