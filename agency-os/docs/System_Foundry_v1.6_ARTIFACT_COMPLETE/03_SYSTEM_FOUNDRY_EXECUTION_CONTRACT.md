# System Foundry Execution Contract v1.6 (Consolidated)

## Every Task — Mandatory Fields
```text
ID
TITLE
PURPOSE
WHY
CURRENT STATE
TARGET STATE
EXACT PATHS
DEPENDENCIES
DATA IMPACT
SECURITY IMPACT
MIGRATION
IMPLEMENTATION
TESTS
OBSERVABILITY
ROLLBACK
ACCEPTANCE CRITERIA
EXPECTED RESULT
```

Machine-readable contract: `schemas/task.schema.json`.

## Repository Finding — Mandatory Fields
```text
FINDING ID
STATEMENT
STATE
EVIDENCE PATH
START LINE
END LINE
WHAT THE EVIDENCE PROVES
```

`VERIFIED` without exact line evidence is invalid. Machine-readable contract: `schemas/evidence-finding.schema.json`.

## Existing-system Change — Mandatory Root Cause Gate
Before implementation:
```text
REPRODUCED SYMPTOM
VERIFIED ROOT CAUSE
OWNER
BOUNDARY
AFFECTED CONTRACTS
EXACT PATHS
MIGRATION
ROLLBACK
```
If root cause is not established: `ROOT_CAUSE_NOT_ESTABLISHED` and STOP.

## Mandatory Stops
```text
NEEDS_HUMAN_DECISION
NEEDS_PROTOTYPE
NEEDS_BENCHMARK
NEEDS_EXTERNAL_REVIEW
NEEDS_LEGAL_REVIEW
INSUFFICIENT_EVIDENCE
CURRENT_STATE_NOT_UNDERSTOOD
ROOT_CAUSE_NOT_ESTABLISHED
ARCHITECTURE_CONFLICT
ROLLBACK_NOT_PROVEN
MIGRATION_NOT_PROVEN
INDEPENDENCE_VIOLATION
UNBOUNDED_BLAST_RADIUS
CONTRACT_COMPATIBILITY_UNPROVEN
SECURITY_REVIEW_REQUIRED
```

## Before Change
Inspect and evidence implementation, source of truth, dependencies, owner, data impact, security/privacy impact, failure modes, contract compatibility, and blast radius. Define rollback/recovery before implementation.

## During Change
Use deterministic commands/actions, exact paths, compatibility sequencing, bounded ownership, and task-to-change traceability. No unapproved architectural shortcuts.

## After Change
Verify tests, migration, security, observability, audit, restore/rollback, docs, runbook, acceptance criteria, and expected result. Retain evidence.

## Handoff
Must contain current state, completed changes, pending work, risks, assumptions, rollback state, test evidence, exact next action, active stop codes, and evidence freshness status.
## Generated LEGO Module — Mandatory Artifact Package
Every selected module must contain: `00_REQUIREMENTS / 01_ARCHITECTURE / 02_CONTRACTS / 03_SECURITY / 04_DATA_AND_MIGRATION / 05_TEST_STRATEGY / 06_OBSERVABILITY_AND_SRE / 07_ROLLBACK_AND_RECOVERY / 08_IMPLEMENTATION_BACKLOG / MODULE_MANIFEST`. Missing one blocks generator commit. Unselected modules must materialize none of these artifacts or module paths.

Every generated System Blueprint contains all controlled sections. Applicability is explicit `ACTIVE` or `NOT_APPLICABLE`; silent omission is forbidden.

