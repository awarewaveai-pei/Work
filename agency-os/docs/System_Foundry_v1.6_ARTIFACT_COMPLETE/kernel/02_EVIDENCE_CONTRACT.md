# Foundry Evidence Contract

## Evidence states
- `VERIFIED`: directly demonstrated by authoritative evidence.
- `INFERRED`: conclusion derived from verified evidence; inference chain must be explicit.
- `ASSUMED`: temporary premise requiring owner and validation plan.
- `UNKNOWN`: insufficient evidence; do not guess.
- `DISPUTED`: conflicting evidence; preserve both sides until resolved.

## Repository evidence rule
Every repository-specific `VERIFIED` finding MUST include:
- `path`: repository-relative path
- `start_line`: exact 1-based line
- `end_line`: exact 1-based line
- `proves`: what this evidence proves, and only that

Example:
```yaml
finding_id: FINDING-AUTH-017
statement: Tenant authorization occurs after resource lookup.
state: VERIFIED
evidence:
  - path: src/modules/orders/order.service.ts
    start_line: 81
    end_line: 103
    proves: Resource load precedes tenant ownership validation.
```

## Inference rule
`INFERRED` requires at least one cited verified source and a written inference chain. It must never be worded as verified fact.

## Prohibited evidence behavior
- "probably", "seems", or "likely" presented as fact
- path without line range for source-code claims
- line range without an explanation of what it proves
- expert agreement used as evidence
- stale evidence after the referenced file has changed
- evidence that proves only a symptom used to assert a root cause

## Evidence freshness
A change invalidates evidence referencing modified lines. Re-validation is required before final assurance.
