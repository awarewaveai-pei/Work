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

This invariant is a stated principle, not yet a tested property — see `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md` §Vendor Replaceability for what "tested" means here and why it matters (`DOM-` findings, `HCI30_RESEARCH_REVIEW/18_30_YEAR_REPLACEMENT_ANALYSIS.md`).

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

**Immutability and a data subject's right to correction/erasure are not automatically compatible** — see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Data Subject Rights for the resolution (crypto-shredding: destroy the key, keep the tombstoned metadata, so the erasure event is itself an immutable fact).

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

### Invariant 8 — A stated principle is not a control until it is enforced *(new in V2)*

Every invariant, "must," or "never" in this document set requires a corresponding CI-blocking test, DB-level constraint, or policy-engine gate before the data or behavior it protects goes live. A principle stated only in prose is a documented intention, not a guarantee.

**Why this was added**: an independent Red Team review, cross-checked against every other reviewer's recommendations for what to keep unchanged, found that zero of 16 concrete attack scenarios against the V1 architecture were blocked by anything actually enforced in the system as specified — the principles were consistently sound, the enforcement mechanisms were consistently missing or deferred to a later build phase than the data they were meant to protect. See `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` for the full cross-check. This is the single most consequential finding of the V1 review and is elevated to a constitutional invariant rather than left as a project-management note, specifically so it cannot be silently dropped from a future roadmap re-prioritization.

### Invariant 9 — The Subject being assessed is a stakeholder, not only subject matter *(new in V2)*

A Person (or, pending `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Subject Model, an Organization) that HCI-30 profiles has interests in the outcome — reputational, legal, and personal — even when they are not the paying customer. Architecture and product decisions must account for this stakeholder explicitly, not only for the tenant who requested the analysis. See `11_SECURITY_PRIVACY_GOVERNANCE.md` §Data Subject Rights.

## Definition of architecture failure

Any design is considered failed if it requires:
- copying core logic into multiple products
- direct cross-product DB joins
- a vendor-specific dependency inside stable domain logic
- destructive migration with no rollback
- a single universal human trust score
- an AI-only irreversible human decision
- **a same-named concept with two different shapes and two different owners crossing a product boundary undetected** *(new in V2 — see `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-02, the "Evidence"/"Claim" naming collision between HCI and AI LEGO)*
