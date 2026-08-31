> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/06_HCI30_PUBLIC_INTELLIGENCE.md. See 00_README.md in this folder for why.

# 06 — HCI-30 Public Intelligence & Evidence Acquisition

## Purpose

Add lawful public-information research about a person or organization without turning HCI into a rumor engine or secret surveillance platform.

## System name

Recommended module:

```text
Public Intelligence & Evidence Acquisition Layer
```

## Pipeline

```text
Person
↓
Identity Resolution
↓
Search Planning
↓
Multi-source Retrieval
↓
Source Quality Assessment
↓
Deduplication
↓
Claim Extraction
↓
Entity/Event Resolution
↓
Cross-source Corroboration
↓
Contradiction Detection
↓
Timeline
↓
Achievement / Contribution / Concern Analysis
↓
Synthesis
↓
Citation Graph
```

## Identity resolution is mandatory

Before admitting search results, maintain:

```text
name
alternative_names
native_name
romanized_names
known_aliases
country
city
current_company
previous_companies
job_title
industry
education
official_website
known_social_accounts
```

Identity states:

```text
MATCH_CONFIRMED
MATCH_HIGH_CONFIDENCE
MATCH_POSSIBLE
MATCH_AMBIGUOUS
MATCH_REJECTED
```

Ambiguous identity must not enter formal evidence.

## Balanced search planner

Search families should include both favorable and unfavorable dimensions:

```text
Identity
Career
Achievements
Contributions
Recognition
Business
Disputes
Criticism
Legal
Regulatory
Failures
Counter-evidence
Resolution
```

Never search only for negative terms after a user forms a suspicion.

## Claim categories

Avoid simple Positive/Negative.

Use:

```text
Achievements
Contributions
Recognition
Leadership
Innovation

Disputes
Criticism
Failures
Legal Matters
Governance Concerns

Resolved Matters
Unresolved Matters
Disputed Claims
```

Legal status must preserve distinctions:

```text
Allegation
Investigation
Charge
Trial
Judgment
Appeal
Settlement
Dismissal
Acquittal
```

## Source quality

Recommended hierarchy:

```text
S1 Primary authority
S2 Direct primary source
S3 High-quality independent journalism
S4 Professional / industry source
S5 General web
S6 Social / forum / weak lead
```

Important:

A company website may reliably prove that a company **made a claim**, but not necessarily that the claim is objectively true.

## Source independence

URL count is not independent-source count.

Track:

```text
source_relationships
cites
derived_from
original_source
```

## Claim object

A claim should retain:

```text
claim_id
person_id / organization_id
claim_text
claim_type
event_date
status
confidence
source_ids[]
independent_source_count
contradicting_source_ids[]
review_status
```

## Search result admission states

```text
DISCOVERED
MATCHED
VERIFIED
ACCEPTED
ACTIVE
REJECTED
```

Raw web result must never automatically become formal HCI Evidence.

## Negative evidence rules

Example:

A forum post says “John is a fraud.”

Allowed output:

```text
Unverified allegation located.
Source quality: low.
Independent corroboration: none.
Decision weight: informational only.
```

Forbidden:

```text
Fraud Risk = HIGH
```

## Mandatory counter-search

If a negative legal/regulatory result appears, automatically look for:

```text
dismissed
acquitted
settled
appeal
judgment
resolution
response
```

## Timeline

Build a dated career/event timeline.

## Citation requirements

Reports should include:

1. inline source references per claim
2. full source appendix with URL, title, publisher, author, publication date, retrieval date, type, quality

## Multi-language research

Support:
- native name
- transliteration
- simplified/traditional variants
- language-specific public records
- jurisdiction-specific registries

## Research modes

```text
Quick Search
Standard Research
Deep Due Diligence
Continuous Monitoring
```

Depth must be proportional to collaboration risk.

## HCI report structure

```text
Executive Overview
Identity Confidence
Career Timeline
Major Achievements
Notable Contributions
Recognition
Business / Organizational Relationships
Publicly Documented Disputes
Legal / Regulatory Matters
Resolved Issues
Unresolved Claims
Contradictions in Sources
Current Public Profile
Evidence Gaps
Source Quality Summary
Full Source Appendix
```

## Public reputation vs direct experience

Never average them blindly.

Example:

```text
Public Reputation: Strong
Direct Collaboration Reliability: Weak
DIVERGENCE DETECTED
```
