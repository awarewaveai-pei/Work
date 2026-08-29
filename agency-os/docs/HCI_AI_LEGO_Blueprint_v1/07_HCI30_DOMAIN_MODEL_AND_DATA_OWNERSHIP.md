> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md. See 00_README.md in this folder for why.

# 07 — HCI-30 Domain Model & Data Ownership

## Purpose

Define stable HCI entities and ownership boundaries.

## Core entities

```text
Person
Organization
OrganizationHierarchy
Relationship
Interaction
Observation
Evidence
Claim
Source
SourceSnapshot
SourceRelationship
PublicEvent
Hypothesis
Assessment
AssessmentDimension
TrustDomain
RiskEvent
Permission
Decision
Outcome
Review
Consent
PolicyVersion
AuditReference
```

## Important identity separation

```text
User != Person
```

A User logs into HCI.

A Person is a subject represented in HCI.

Never merge these models.

## Fact model

Store separately:

```text
Fact
Observation
Interpretation
Hypothesis
```

Do not write:

> Alice is unreliable

as a fact.

Instead:

```text
Observation:
3 deadlines, 2 missed.

Interpretation:
Current evidence suggests lower delivery reliability in high-pressure context.

Unknown:
Long-term pattern not yet established.
```

## Evidence provenance

Each evidence record should support:

```text
evidence_id
tenant_id
person_id
interaction_id
timestamp
source_type
source_reference
raw_observation
observer
context
confidence
corroboration_count
contradiction_count
created_at
updated_at
version
classification
```

## Assessment versioning

Never overwrite historical assessments.

Store:

```text
assessment_version
model_version
policy_version
method_versions
evidence_cutoff
created_at
valid_until
review_required_at
```

## Domain DB ownership

HCI owns:

```text
Person
Organization
Relationship
Interaction
HCI Evidence
Public Claim
Trust Assessment
Risk Assessment
Permission
Collaboration Decision
Outcome
```

HCI does not own:
- AI LEGO workflow runs
- AI LEGO method atlas
- model execution internals
- platform identity
- tenant billing

## Recommended relational tables

```text
people
organizations
organization_hierarchy
relationships
interactions
observations
evidence
hypotheses
assessment_dimensions
assessments
trust_domains
risk_events
permissions
decisions
outcomes
reviews

search_jobs
search_queries
web_sources
source_snapshots
source_relationships
claims
claim_sources
claim_contradictions
public_events
event_people
event_organizations
identity_candidates
identity_matches
research_reports
research_report_versions
```

## Relationship graph

Track relationships among:

```text
Person
Company
Project
Investor
Partner
Supplier
Client
Advisor
Introducer
```

Graph connections generate investigation leads, not guilt.

## Claim graph

Support:

```text
Person
→ role_in → Organization
→ involved_in → Event
→ supported_by → Source
→ contradicted_by → Source
```

## Data retention principle

30-year system life does not imply 30-year retention for all personal data.

All data categories must have:

```text
retention_policy
deletion_policy
legal_hold_behavior
archive_policy
```
