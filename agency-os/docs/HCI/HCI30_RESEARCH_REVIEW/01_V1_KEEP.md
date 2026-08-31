# 01 V1 KEEP

> 7 items across all 9 independent reviews where a reviewer's job was specifically to look for what V1 got right and actively defend it from being "fixed" by a future contributor who mistakes correct restraint for an oversight. This list is short by design -- the mission brief's own anti-overengineering and anti-underestimation constraints mean most of what reviewers found worth a full write-up was a gap, not a confirmation. A short KEEP list is not evidence of a weak review; every item below survived independent scrutiny under `AGREE != FACT` and is explicitly protected from future "improvement."

---

| ID | Title | Why | Source | Confidence |
|---|---|---|---|---|
| DOM-11 | Core peer-product domain boundary (Person/Relationship/Trust vs. Method/Workflow/Execution) is correctly designed and should not be disturbed | A Person/Relationship/TrustDomain aggregate and a Method/Workflow/ExecutionRun aggregate answer genuinely unrelated questions for genuinely different consumers, and the failure-ind | A (05_DOMAIN_ARCHITECTURE_REVIEW.md) | High  |
| CI-12 | DB-per-tenant correctly rejected for shared tiers, but this call is never stated or justified anywhere in V1 | Confirms and formalizes a call V1's own tier list implicitly supports but never commits to, closing the ambiguity gap without changing any actual architecture. | B (06_DATABASE_ARCHITECTURE_REVIEW.md) | High  |
| D-14 | 'Modular monolith first' principle is correct and should be preserved, but stated as an isolated line rather than the load-bearing header it deserves to be | Confirms and reinforces an already-correct decision; the fix is to make it load-bearing (tied to real tooling) rather than aspirational prose, addressing the same root gap as D-03  | D (08_DEVOPS_SRE_REVIEW.md) | High  |
| F9 | Trust model extension (Mayer-Davis-Schoorman ability/benevolence/integrity + Reliability/Predictability/Alignment/Governance) is sound organizational-trust science | Confirms V1 is capable of correctly grading and scoping a strong method; useful as a positive baseline against which F1-F4 are judged. | F (10_METHOD_SCIENCE_REVIEW.md) | High  |
| F10 | Public Intelligence's balanced-search-planner and mandatory-counter-search design correctly implements structured-intelligence-analysis debiasing doctrine | This is the single best-designed part of the two lens documents and should be explicitly protected from any future simplification pass. | F (10_METHOD_SCIENCE_REVIEW.md) | High  |
| F11 | Sun Tzu / classical strategy scoping is a model of correct method boundary-drawing | Demonstrates the fix path for F4 already exists inside the same document; the gap is inconsistent application, not absence of a template. | F (10_METHOD_SCIENCE_REVIEW.md) | High  |
| REG-07 | SOC 2 Type II and formal ISO/IEC 27001 certification correctly absent from V1 at current stage -- confirming, not flagging | V1's own instinct to omit this was correct; the review's job here is to confirm that instinct with external evidence so a future reader doesn't mistake the silence for an oversight | I (REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md) | High  |

---

## Reading this table

**HUMAN** in the Confidence column marks an item the original reviewer flagged as `requires_human_decision=true` even though its disposition is KEEP -- meaning "this should stay as-is, but the *decision to formally ratify it as unchangeable* (e.g. via an ADR) should be made explicitly, not left implicit." None of the KEEP items in this file carry that flag; every one is a low-friction confirmation. Full reasoning for each item lives in the reviewer's own numbered file (see Source column).
