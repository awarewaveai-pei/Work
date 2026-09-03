# Foundry Execution Invariants

These are fail-closed rules. A stage cannot pass when any applicable invariant is violated.

## I-01 Current truth before target truth
No redesign or implementation of an existing system may begin before the relevant current state, source of truth, ownership, dependency graph, runtime behavior, data impact, and security impact are evidenced.

## I-02 No evidence, no factual claim
A repository-specific factual finding must contain an exact repository-relative path and exact line range. Without sufficient evidence the only valid state is `INSUFFICIENT_EVIDENCE`, `UNKNOWN`, `INFERRED`, or `ASSUMED` as applicable.

## I-03 Root cause before implementation
Implementation cannot start until the chain is established:
`Symptom -> Reproduction -> Root Cause -> Owner -> Boundary -> Contract -> Migration -> Implementation`.

## I-04 No patch engineering
A local workaround is rejected when it hides or preserves a known root-cause defect, violates ownership, duplicates policy, introduces hidden coupling, or creates structural rework.

## I-05 Multiple architecture options
Material architecture decisions require at least three viable options unless a hard external constraint is evidenced and independently reviewed.

## I-06 Closed-loop change
Every actionable change requires exact path, dependencies, data/security impact, migration, implementation steps, tests, observability, rollback, acceptance criteria, and expected result.

## I-07 Reversibility
A production-affecting change cannot pass without a tested rollback/recovery path or an explicit, human-approved irreversible-change exception with compensating controls.

## I-08 Minimum blast radius
Changes must use the smallest safe ownership boundary. Minimum blast radius must not be used to justify duplication, bypasses, or long-term structural debt.

## I-09 Independent assurance
The author/design agent may not be the sole assurance approver for material changes.

## I-10 Modular replaceability
Vendor, framework, runtime, transport, and persistence choices may not leak into stable domain semantics without an explicit adapter/boundary decision.

## I-11 Verification before completion
No task is DONE until its acceptance criteria are demonstrated with retained evidence.

## I-12 Handoff completeness
No handoff is valid without current state, completed changes, pending work, risks, assumptions, rollback state, test evidence, and exact next action.
