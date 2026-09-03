# Explainability & Reproducibility Standard

## Consequential output contract
Important recommendations, decisions, classifications, reports, or automated actions expose where applicable:
- conclusion / action
- governing evidence
- evidence cutoff
- unresolved unknowns
- contradictory evidence / disagreement
- alternative explanations or options
- controls / constraints
- what evidence would materially change the result
- policy / method / model / rule versions
- generated_at and execution references

## Reproducibility
Generated outputs MUST preserve enough immutable/versioned references to reconstruct why the output existed at that time. Silent substitution of retired models, policies, methods, providers, or evidence during replay is prohibited.

## Presentation integrity
Presentation layers render decision-relevant values; they do not independently recompute authoritative risk, entitlement, confidence, pricing, security, or policy decisions unless the computation is itself a shared authoritative module with contract tests.
