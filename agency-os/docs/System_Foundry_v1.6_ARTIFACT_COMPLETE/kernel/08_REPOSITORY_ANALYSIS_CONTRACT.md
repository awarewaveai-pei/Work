# Repository Analysis Contract

## Audit order
1. inventory repository and build/runtime entry points
2. locate authoritative configuration and source-of-truth files
3. trace request/data/control flow end-to-end
4. identify owners and boundaries
5. map external dependencies and side effects
6. reproduce the issue or behavior when applicable
7. record findings with exact `file:line` evidence
8. only then propose target-state changes

## Finding quality
A finding must be falsifiable and narrowly worded. Evidence must prove the exact statement, not merely be related to it.

## No "possible cause" as finding
Unverified causal hypotheses belong in an investigation queue and are labeled `ASSUMED` or `INFERRED`; they cannot justify implementation until root cause is verified or an explicit experiment is approved.
