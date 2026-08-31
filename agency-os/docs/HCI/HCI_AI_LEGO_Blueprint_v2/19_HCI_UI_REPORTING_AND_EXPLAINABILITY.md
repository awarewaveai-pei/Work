# 19 — HCI UI, Reporting & Explainability

## Purpose

Define how HCI should present intelligence without producing misleading certainty.

## Subject dashboard

Do not make a single score the hero.

Recommended sections: Relationship Status, Current Permissions, Trust Domains, Evidence Confidence, Top Strengths, Material Risks, Unknowns, Contradictions, Recent Behavior Change, Next Validation, Review Due.

## Analysis lenses

A Subject/case should support independent lenses: Evidence, Reliability, Behaviour, Incentive, Conflict, Power, Network, Culture, Psychology, Strategy, Self Reflection.

Do not average lens disagreement away.

## Model disagreement

Example: `Reliability: LOW RISK` / `Incentive Alignment: HIGH RISK` → `MODEL DISAGREEMENT`. Explain: "Historical delivery is strong, but the current deal creates materially different incentives."

## Explainability button

Every material conclusion should provide: `WHY THIS CONCLUSION?`

Expanded view should show: Assessment, Evidence used, Contradictory evidence, Unknowns, Methods used, Method versions, Policy version, Confidence, Execution run reference.

## Confidence display — changed in V2

Keep separate: Evidence Confidence, Model Agreement, Method Robustness, Decision Confidence.

**Changed in V2 — qualitative bands, not bare percentages, until a calibrated model exists**: V1's example rendered these as bare numbers (`Evidence Confidence: 43%`, `Model Agreement: 95%`, `Method Robustness: 68%`, `Decision Confidence: 54%`). `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md` itself lists "Confidence algorithm v1" as unresolved — meaning no documented, backtested, calibrated statistical model exists behind these numbers yet. A percentage reads as a measured quantity; an LLM-produced "68%" with no calibration evidence behind it is very likely a fabricated-precision restatement of a qualitative judgment, which directly contradicts this same document set's own forbidden-output rule elsewhere (`06_HCI30_PUBLIC_INTELLIGENCE.md`'s ban on "Fraud Risk = HIGH").

Until Confidence Algorithm v1 ships with documented calibration/backtesting evidence, use qualitative bands consistent with the intelligence-community Words of Estimative Probability convention (ICD 203):

```text
Very Low / Low / Moderate / High / Very High
```

each mapped to a defined and published probability range. Reserve numeric percentages for after the algorithm is calibrated. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F7.

**Wiring note (new in V2)**: Model Agreement specifically must be computed with source-independence as an input — see `06_HCI30_PUBLIC_INTELLIGENCE.md` §Source Independence for why (two models agreeing after both retrieving the same poisoned source should not read as high agreement).

Interpretation: models may strongly agree even when evidence is weak — this is exactly the scenario the source-independence wiring above is meant to catch.

## "What would change my mind?"

Every important conclusion should expose: What evidence would raise confidence? What evidence would lower confidence? What remains untested?

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

Example: repeated delayed replies → possible explanations: A. workload, B. time zone, C. lower project priority, D. declining interest, E. communication habit.

## Analyst bias check

**Changed in V2 — binary process checks, not ordinal risk quantification**: see `05_HCI30_INTELLIGENCE_METHODS.md` §Cognitive Bias Defense for the replacement of `Confirmation bias: MEDIUM`-style ordinal self-ratings with binary process-discipline checks (`Counter-search performed: YES/NO`, etc.), and `04_HCI30_PRODUCT_SPEC.md` §Decision Output for this becoming a blocking gate at Stage 4+ rather than optional report content.

## Public intelligence display

For a public claim: Claim, Status, Independent source count, Confidence, Source quality, URLs, Contradictions, Resolution status.

Example states: `VERIFIED FACT`, `CORROBORATED REPORT`, `SINGLE-SOURCE REPORT`, `CLAIM`, `ALLEGATION`, `OPINION`, `UNKNOWN`.

## Formal report

Recommended sections: Executive Overview, Identity Confidence, Relationship Context, Career Timeline, Major Achievements, Contributions, Recognition, Business Relationships, Public Disputes, Legal / Regulatory Matters, Resolved Issues, Unresolved Claims, Trust Domains, Incentive Analysis, Power / Dependency Map, Risk Analysis, Unknowns, Contradictions, Recommended Controls, Decision Options, What Would Change This Conclusion, Source Quality Summary, Full Source Appendix, Method / Model / Policy Appendix.

**New in V2**: see `06_HCI30_PUBLIC_INTELLIGENCE.md` §HCI Report Structure for the mandatory legal disclaimer and purpose-reassertion statement added to every export.

## Source appendix

Every cited source should include where available: Source ID, Title, Publisher, Author, Published date, Retrieved date, URL, Source type, Quality grade, Identity match confidence, Independent-source status.

## Decision visualization

Final UI should prefer: `PROCEED`, `PROCEED_WITH_CONTROLS`, `LIMIT_ACCESS`, `PAUSE`, `REVIEW_REQUIRED`, `EXIT`, with explanation and required controls.

## Permission UI

Trust and access must be separate. Display permissions explicitly: `P0 Public`, `P1 Internal`, `P2 Confidential`, `P3 Financial`, `P4 Strategic`, `P5 Administrative`, `P6 Ownership / Governance`.

See `02_PRODUCT_BOUNDARIES.md` §Core Domain Objects for why this Permission axis must stay distinct from the separate Data Classification axis (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED, `11_SECURITY_PRIVACY_GOVERNANCE.md`).

## Reporting reproducibility

Every generated report must retain: `report_version`, `assessment_version`, `evidence_cutoff`, `method_versions`, `policy_version`, `generated_at`, `execution_run_refs`.
