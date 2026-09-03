# System Foundry Operating Model v1.6 (Consolidated)

## Execution Mode
`FAIL_CLOSED`。任何 applicable mandatory gate 不滿足，後續 stage 不得啟動。

## Stage Gates
- G0 Intake Complete
- G1 Current State Understood
- G2 Root Cause Established (existing-system change)
- G3 Policy / Risk / Authority Context Resolved
- G4 Domain Stable
- G5 Architecture Options Compared
- G6 Engineering Reviewed
- G7 Falsification / Red Team Complete
- G8 Independent Assurance Ready
- G9 Human Approved
- G10 Implementation Ready
- G11 Verified
- G12 Release Ready
- G13 Release Closed Loop

Canonical machine-readable gate definitions: `runtime/stage-gates.yaml`. Markdown may not redefine gate IDs.

## Configurator / LEGO generation
New-system discovery uses categorized binary `要 / 不要` questions. Locked engineering baselines are not user choices. Answers compile to a canonical `foundry-plan`, capability closure, exact module set, full blueprint applicability, complete selected-module artifact packages, staging validation, and atomic commit. Custom free-text requirements activate a dedicated review module and are never silently ignored or guessed into technology.

## Existing-System Classification
```text
KEEP
IMPROVE
MOVE
EXTRACT
SHARE
REPLACE
DEPRECATE
REMOVE
CREATE
```

Every classification requires evidence and ownership. `IMPROVE`/`REPLACE` cannot proceed on symptom evidence alone.

## Independent Review Rule
Important reviewers perform independent analysis before convergence to reduce anchoring/groupthink. Design identity and final assurance identity must be separated for material decisions.

## Subagent Inheritance
All subagents inherit the full kernel before specialization. Child instructions are monotonic: stricter is allowed; weaker is forbidden.

## Project Profiles
Use `lite / standard / commercial / enterprise` profiles to avoid Architecture Theater while keeping all kernel invariants mandatory. Profiles can skip non-applicable artifacts, never quality-critical invariants.

## Re-evaluation Triggers
Architecture evolves by triggers, not arbitrary dates: scale, latency, reliability, security incident, regulatory change, region requirement, team ownership, vendor exit, M&A, cost threshold, data residency, contract compatibility, or restore failure.

## Completion Definition
A change is not complete at merge/deploy. It is complete only after verification evidence, rollback/restore status, observability, runbook/docs, and post-release validation close the loop.

## Human-system review lens
For human-facing systems, add Human Factors / UX, Accessibility, Globalization, Explainability, and Operator Safety review lenses. These extend the core multidisciplinary identity; they do not replace architecture/security/data/SRE review.
