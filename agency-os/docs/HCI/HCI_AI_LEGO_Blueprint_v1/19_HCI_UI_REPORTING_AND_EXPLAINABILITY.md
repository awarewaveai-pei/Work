> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md. See 00_README.md in this folder for why.

# 19 — HCI UI, Reporting & Explainability

## Purpose

Define how HCI should present intelligence without producing misleading certainty.

## Person dashboard

Do not make a single score the hero.

Recommended sections:

```text
Relationship Status
Current Permissions
Trust Domains
Evidence Confidence
Top Strengths
Material Risks
Unknowns
Contradictions
Recent Behavior Change
Next Validation
Review Due
```

## Analysis lenses

A person/case should support independent lenses:

```text
Evidence
Reliability
Behaviour
Incentive
Conflict
Power
Network
Culture
Psychology
Strategy
Self Reflection
```

Do not average lens disagreement away.

## Model disagreement

Example:

```text
Reliability: LOW RISK
Incentive Alignment: HIGH RISK

MODEL DISAGREEMENT
```

Explain:

> Historical delivery is strong, but the current deal creates materially different incentives.

## Explainability button

Every material conclusion should provide:

```text
WHY THIS CONCLUSION?
```

Expanded view should show:

```text
Assessment
Evidence used
Contradictory evidence
Unknowns
Methods used
Method versions
Policy version
Confidence
Execution run reference
```

## Four confidence concepts

Keep separate:

```text
Evidence Confidence
Model Agreement
Method Robustness
Decision Confidence
```

Example:

```text
Evidence Confidence: 43%
Model Agreement: 95%
Method Robustness: 68%
Decision Confidence: 54%
```

Interpretation:

Models may strongly agree even when evidence is weak.

## “What would change my mind?”

Every important conclusion should expose:

```text
What evidence would raise confidence?
What evidence would lower confidence?
What remains untested?
```

Example:

```text
Current:
Financial Trust = LOW

Would increase:
- 12-month verified payment history
- audited financial information
- independent references

Would decrease:
- unexplained defaults
- conflicting ownership information
- refusal of reasonable verification
```

## Alternative explanations

Important interpretations should show competing explanations.

Example:

```text
Observed:
Repeated delayed replies.

Possible explanations:
A. workload
B. time zone
C. lower project priority
D. declining interest
E. communication habit
```

## Analyst bias check

Reports may expose:

```text
Confirmation bias risk
Halo effect risk
Horn effect risk
Recency bias risk
Source diversity
Contradictory evidence reviewed
```

## Public intelligence display

For a public claim:

```text
Claim
Status
Independent source count
Confidence
Source quality
URLs
Contradictions
Resolution status
```

Example states:

```text
VERIFIED FACT
CORROBORATED REPORT
SINGLE-SOURCE REPORT
CLAIM
ALLEGATION
OPINION
UNKNOWN
```

## Formal report

Recommended sections:

```text
Executive Overview
Identity Confidence
Relationship Context
Career Timeline
Major Achievements
Contributions
Recognition
Business Relationships
Public Disputes
Legal / Regulatory Matters
Resolved Issues
Unresolved Claims
Trust Domains
Incentive Analysis
Power / Dependency Map
Risk Analysis
Unknowns
Contradictions
Recommended Controls
Decision Options
What Would Change This Conclusion
Source Quality Summary
Full Source Appendix
Method / Model / Policy Appendix
```

## Source appendix

Every cited source should include where available:

```text
Source ID
Title
Publisher
Author
Published date
Retrieved date
URL
Source type
Quality grade
Identity match confidence
Independent-source status
```

## Decision visualization

Final UI should prefer:

```text
PROCEED
PROCEED_WITH_CONTROLS
LIMIT_ACCESS
PAUSE
REVIEW_REQUIRED
EXIT
```

with explanation and required controls.

## Permission UI

Trust and access must be separate.

Display permissions explicitly:

```text
P0 Public
P1 Internal
P2 Confidential
P3 Financial
P4 Strategic
P5 Administrative
P6 Ownership / Governance
```

## Reporting reproducibility

Every generated report must retain:

```text
report_version
assessment_version
evidence_cutoff
method_versions
policy_version
generated_at
execution_run_refs
```
