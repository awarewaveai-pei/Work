# Selection and Output Correctness Standard

## Objective
Prove bidirectionally that questionnaire choices and generated artifacts agree exactly.

## Required proof directions
- Input -> rule -> capability -> dependency closure -> module -> artifact.
- Artifact -> module -> activating capability -> rule/baseline -> input evidence.
- Absence proof: unselected modules and their paths do not exist.
- Completeness proof: all selected modules contain every mandatory artifact role.
- Applicability proof: all 73 blueprint sections are either ACTIVE or NOT_APPLICABLE.
- Determinism proof: same canonical answers and rule version produce the same Foundry plan.

## Mandatory matrix
- ALL NO.
- ALL YES.
- Every question individually YES with minimum prerequisites.
- Exhaustive pairwise question combinations when prerequisites are compatible.
- Randomized mixed valid/invalid configurations.
- One generated project proving each module is reachable.
- Every explicit conflict rule.
- Deferred capability non-leakage.
- Generated artifact manifest hash verification.

Any mismatch blocks release.
