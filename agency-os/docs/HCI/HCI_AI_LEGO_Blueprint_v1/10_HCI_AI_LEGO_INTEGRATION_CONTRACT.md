> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md. See 00_README.md in this folder for why.

# 10 — HCI-30 × AI LEGO Integration Contract

## Principle

Optional integration between independent peer systems.

```text
HCI-30 <---- contract/API/event ----> AI LEGO Cognitive Engineering OS
```

Neither product is a submodule of the other.

## Independence requirement

HCI must remain able to:
- create/edit persons
- create relationships
- record interactions
- admit evidence
- view timelines
- create manual assessments
- create decisions
- view historical data

when AI LEGO is unavailable.

AI LEGO must remain fully usable for non-HCI cognitive work.

## Allowed integration use cases

HCI may request:
- deep partner analysis
- ACH
- Red Team
- Premortem
- Stakeholder Analysis
- Decision Matrix
- independent cross-model review
- structured alternative-explanation generation

## Request package

HCI should send a bounded case package, not raw DB access.

Example logical payload:

```text
case_id
tenant_context
purpose
risk_level
authorized_evidence_refs[]
relationship_context
known_facts
hypotheses
unknowns
domain_policy_ref
requested_capabilities[]
```

## Response package

AI LEGO returns:

```text
execution_run_id
methods_used
method_versions
model_runs
convergence_summary
analysis_candidates
alternative_hypotheses
contradictions
uncertainties
human_review_flags
replay_reference
```

This response does not automatically become HCI fact.

## HCI admission gate

```text
AI LEGO Analysis
↓
HCI Domain Validation
↓
Assessment Candidate
↓
Human / Policy Review
↓
Formal HCI Assessment
```

## Two evidence ledgers

### HCI Domain Evidence

Answers:

> Why do we believe something about the person or collaboration?

### AI LEGO Execution Evidence

Answers:

> How did the cognitive run produce this result?

Do not merge these semantics.

HCI assessment may store references to AI LEGO run IDs.

## Integration API contract

Recommended high-level endpoint style:

```text
POST /cognitive/v1/workflows/execute
GET  /cognitive/v1/runs/{run_id}
POST /cognitive/v1/runs/{run_id}/review
```

HCI-specific integration layer:

```text
systems/hci30/integrations/cognitive-os/
```

Contains only:
- adapter
- request mapper
- result mapper
- policy mapper
- events
- contract tests

Must not contain HCI core logic or Cognitive OS core logic.

## Events

Possible HCI events:

```text
hci.person.created
hci.evidence.admitted
hci.assessment.requested
hci.decision.requested
```

Possible Cognitive events:

```text
cognitive.run.started
cognitive.run.completed
cognitive.run.failed
cognitive.human_review_required
cognitive.convergence.completed
```

## Cross-model gate by risk

Suggested:

```text
LOW
single model + deterministic checks

MEDIUM
planner + verifier

HIGH
independent cross-model review

CRITICAL
model A + model B + rule engine + human review
```

## Confidence separation

HCI should display separately:

```text
Evidence Confidence
Model Agreement
Method Robustness
Decision Confidence
```

Do not collapse them into one number.

## Compatibility

Integration contracts should declare versions.

Example:

```text
HCI 2.7
requires:
Cognitive Runtime >= 5.1 < 6
Method Atlas >= 3.4
Execution Contract v4
```

Deployment should fail closed if incompatible.
