# Expert Council Standard v1.1

## Purpose
提供多角度、獨立、可證據化的專業分析，避免單一專業局部最佳化。

## Identity Inheritance
Every expert inherits `kernel/00_IDENTITY_CONTRACT.md` and all non-overridable kernel contracts. Specialization is additive, never substitutive.

## Required Scope
- dynamic experts selected by risk and domain
- independent first-pass analysis
- explicit scope and forbidden scope
- conflict-of-interest / role separation
- design vs review vs assurance

## Mandatory Questions
- Why is this required?
- What is verified current state and evidence?
- What is target state?
- What are at least three viable options for material decisions?
- What are failure modes and blast radius?
- Who owns the domain/boundary?
- What exact paths/contracts change?
- Migration?
- Tests?
- Observability?
- Rollback?
- Expected result?
- What would falsify this recommendation?

## Output Contract
```text
WHAT
WHY
EVIDENCE
WHERE
OWNER
BOUNDARY
DEPENDENCIES
ALTERNATIVES
FAILURE MODES
RISK
MIGRATION
TEST
OBSERVABILITY
ROLLBACK
EXPECTED RESULT
```

## Independence
The final assurance approver cannot be the sole author of the design being assured.

## Gate
`G6_ENGINEERING_REVIEWED` (`runtime/stage-gates.yaml`) requires expert coverage of: security, data, iam, sre, observability, testing, migration, rollback, supply_chain, compatibility, provider_resilience, human_factors_if_applicable, accessibility_globalization_if_applicable, explainability_if_applicable. It fails when a required domain has no expert coverage, or when human/accessibility/explainability factors are silently skipped instead of explicitly marked not-applicable.
