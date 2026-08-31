> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/14_ROADMAP_AND_DEFINITION_OF_DONE.md. See 00_README.md in this folder for why.

# 14 — Roadmap & Definition of Done

## Architecture-first implementation order

### Phase 0 — Constitution & ADRs

Create:
- system constitution
- product boundaries
- data ownership
- security baseline
- domain policies

Expected result:
No developer or AI can silently redefine system boundaries.

### Phase 1 — Platform identity + tenant foundation

Implement:
- tenant
- organization
- workspace
- identity
- memberships
- roles
- permissions

Expected result:
Multi-tenant correctness exists before business data grows.

### Phase 2 — HCI core domain

Implement:
- Person
- Relationship
- Interaction
- Observation
- Evidence
- Organization
- Decision

Expected result:
HCI works without AI integration.

### Phase 3 — HCI assessment core

Implement:
- trust domains
- risk
- confidence
- unknowns
- contradictions
- permission model
- relationship lifecycle

### Phase 4 — Public intelligence

Implement:
- identity resolution
- search planner
- source registry
- source quality
- claim graph
- contradiction
- timeline
- source appendix

### Phase 5 — Personal product / founder dogfooding

Use HCI daily.

Expected result:
Validate real domain design before enterprise expansion.

### Phase 6 — Team/commercial

Implement:
- workspaces
- collaboration
- entitlements
- subscriptions
- licensing
- usage metering

### Phase 7 — Enterprise

Implement:
- SSO
- SCIM
- ABAC
- audit
- legal hold
- data residency
- enterprise policy
- dedicated deployment

### Phase 8 — AI LEGO optional integration

Implement only through formal integration contract.

### Phase 9 — Group / conglomerate

Implement:
- multi-organization hierarchy
- delegated admin
- regional policy
- legal entity isolation

### Phase 10 — Public API / SDK / partner ecosystem

Expose stable capability contracts.

## Definition of Done

A feature is not complete without:

```text
Requirements
Domain impact review
Threat model
Data model
Migration
Implementation
Unit tests
Integration tests
Contract tests
Security tests
Observability
Audit behavior
Documentation
Runbook
Rollback
Acceptance criteria
```

For intelligence methods also require:

```text
Method contract
Evidence grade
Allowed use
Forbidden use
Version
Validation plan
Bias test
Replay support
```

## Stop conditions

Do not continue implementation when:
- domain ownership is ambiguous
- a new feature requires direct cross-system DB access
- no rollback path exists
- sensitive data purpose is unclear
- a high-impact decision has no human review
