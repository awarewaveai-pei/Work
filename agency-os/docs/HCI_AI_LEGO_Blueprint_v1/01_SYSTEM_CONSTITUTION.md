> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/01_SYSTEM_CONSTITUTION.md. See 00_README.md in this folder for why.

# 01 — System Constitution

## Authority

This file defines the global architecture principles for the Aware Wave ecosystem. Lower-level documents may extend these rules but must not contradict them.

## Mission

Build systems that remain stable, secure, maintainable, verifiable, explainable, migratable, and rollbackable over a 30-year horizon.

## Decision discipline

Every architecture or product decision must pass:

1. Multi-angle analysis
2. 30-year engineering discipline
3. Zero-rework preference
4. Closed-loop design
5. Minimal blast radius
6. Explicit data ownership
7. Explicit failure behavior
8. Explicit rollback
9. Explicit verification
10. Explicit human authority for high-impact decisions

## System-level invariants

### Invariant 1 — Evidence is not interpretation

```text
Fact
!= Observation
!= Interpretation
!= Hypothesis
!= Assessment
!= Decision
```

### Invariant 2 — AI is non-authoritative

AI may:
- summarize
- extract
- compare
- generate hypotheses
- run configured methods
- find contradictions
- assist research

AI may not unilaterally:
- create immutable facts
- make high-impact final decisions
- silently change policy
- silently substitute models where policy forbids it
- infer protected attributes for decision scoring

### Invariant 3 — Systems must fail independently

Failure of one product or provider must not unnecessarily disable unrelated functions.

### Invariant 4 — No hidden vendor lock-in

Core domains must not depend directly on:
- a single LLM provider
- a single cloud
- a single payment vendor
- a single proprietary vector database
- a single frontend framework

### Invariant 5 — Version everything material

Version:
- database schema
- API
- domain methods
- scoring models
- decision policies
- prompts
- workflow recipes
- method atlas
- authority rules
- jurisdiction rules
- report templates

### Invariant 6 — Historical truth is immutable

Do not overwrite history. Corrections create new versions and retain lineage.

### Invariant 7 — Privacy and legality outrank convenience

High-level authority order should preserve:

```text
Law / regulatory obligation
↓
Security / privacy
↓
Machine-readable contract
↓
ADR
↓
Global product architecture
↓
Method / domain policy
↓
Workflow recipe
```

## Definition of architecture failure

Any design is considered failed if it requires:
- copying core logic into multiple products
- direct cross-product DB joins
- a vendor-specific dependency inside stable domain logic
- destructive migration with no rollback
- a single universal human trust score
- an AI-only irreversible human decision
