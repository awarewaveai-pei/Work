# Counterfactual & Shadow Validation Standard

## Counterfactual validation
Where a system makes classifications, recommendations, prioritizations, rankings, or automated decisions, test whether irrelevant or protected/contextually prohibited attributes can improperly change outcomes.

## Shadow validation
Material replacements of models, decision rules, search/retrieval, pricing engines, policy engines, schedulers, or other behavior-critical components SHOULD run old and new logic in parallel when feasible before cutover.

Compare at minimum:
- correctness / task quality
- safety and policy outcomes
- disagreement rate
- latency
- cost/resource use
- error/failure rate
- data/source coverage where applicable
- calibration where probability/confidence is claimed

Cutover requires explicit acceptance thresholds and rollback criteria. Shadow outputs MUST NOT create unintended production side effects.
