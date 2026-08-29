# 05 — HCI-30 Intelligence Methods

## Purpose

Define which analytical methods belong to HCI and how they are classified.

HCI methods are **domain methods**. They are not the same as AI LEGO's general cognitive methods.

---

# Stable methodological foundations

HCI may draw from:

- evidence-based reasoning
- Bayesian updating
- reliability engineering
- decision theory
- game theory
- incentive analysis
- organizational behavior
- trust research
- negotiation theory
- risk engineering
- network analysis
- behavioral science
- structured intelligence analysis when invoked through integration
- security/Zero Trust principles
- classical strategy as advisory heuristics
- self-reflection frameworks where explicitly separated from formal decision logic

## Method evidence grading

Recommended:

```text
Grade S — high-confidence standard / mature empirical or formal basis
Grade A — strong empirical framework
Grade B — established professional framework
Grade C — strategic heuristic / classical framework
Grade D — self-reflection framework
Grade X — experimental / under validation
```

Authority names never increase evidence weight by themselves.

---

# Method categories

## Psychology

> 🔴 **DECISION PENDING (`HD-23`)** — this entire section (Big Five instrument choice, MBTI, Enneagram, and 紫微/八字 below) is a cluster of product-positioning calls about what "scientific" means for this brand, explicitly reserved for the operator, not resolved by this review. **Nothing below is implemented until the operator picks.** What follows is the independently-recommended direction, shown in full so the operator can approve, adjust, or reject each item quickly rather than starting from a blank page.

**Big Five / Five-Factor Model — recommended change**: "Big Five" is a construct name, not an implementable method on its own — V1 named no specific instrument and did not distinguish subject-administered self-report (strong validity) from AI-inferred trait estimation from a third party's digital footprint (materially weaker validity — automated-personality-inference literature reports ~r=0.2-0.4 correlation with self-report). Shipping the latter with the evidence badge of the former is false certainty.

```text
RECOMMENDED (pending sign-off):
instrument: IPIP-NEO (public domain, free for commercial use)
inference_mode: self_report | third_party_inferred   -- required field, see §Method Contract
evidence_grade: A if self_report, C if third_party_inferred
```

`third_party_inferred` mode would carry a mandatory UI caveat wherever displayed. Recommendation: do not use BFI-2 or NEO-PI-R without a separate commercial-licensing review — IPIP avoids this entirely. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F1.

Allowed (unchanged from V1): work preference, communication tendency, behavioral tendency.
Forbidden (unchanged from V1): honesty determination, criminality prediction, automatic high-impact rejection.

**MBTI-style typing — recommended for removal**: two independent reasons: (1) weak psychometric support (poor test-retest reliability, traits are continuous not dichotomous per the literature) and (2) live trademark exposure — "MBTI" is a registered trademark of The Myers-Briggs Company, and shipping an "MBTI-style" four-letter typing feature commercially risks trademark/passing-off exposure regardless of the validity question. Big Five already covers the same self-reflection use case with stronger scientific standing. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F2 (REMOVE, High confidence).

**Enneagram — recommended change**: originates from a spiritual/esoteric tradition, not empirical psychology, with no peer-reviewed validation program comparable to the Five-Factor Model. Recommendation: do not populate `evidence_grade` for it (leave ungraded, below the S-X scale rather than at Grade D alongside genuinely self-reflective-but-neutral frameworks); keep strictly as an unscored, clearly-labeled "cultural/entertainment reflection tool," explicitly excluded from any formal Assessment pipeline. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F3.

## Organizational trust

Use ability, benevolence/integrity concepts as inputs, but HCI extends them with:

```text
Reliability
Predictability
Alignment
Governance
Permission separation
```

**KEEP, unchanged from V1**: this extension of the Mayer-Davis-Schoorman ability/benevolence/integrity model is sound organizational-trust science and should not be simplified. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F9.

## Cognitive bias defense

HCI must check analyst/user bias:

- confirmation bias
- halo effect
- horn effect
- recency bias
- availability bias
- anchoring
- loss aversion

**Changed in V2 — quantification removed, and this is now a blocking gate, not optional content**: V1's example rendered bias as a fabricated-precision quantity (`Confirmation bias: MEDIUM`) — the same false-certainty pattern the system explicitly forbids elsewhere (see §Public Intelligence "Fraud Risk = HIGH" ban). Replace with binary process-discipline checks the rest of this document already does correctly:

```text
Counter-search performed: YES/NO
Contradictory evidence actively sought: YES/NO
Evidence diversity reviewed: YES/NO
Single-source reliance flagged: YES/NO
```

Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F6. For the blocking-gate requirement at Stage 4+, see `04_HCI30_PRODUCT_SPEC.md` §Decision Output.

## Negotiation

Applicable methods: interests vs positions, BATNA, reservation point, alternatives, leverage, objective criteria, information asymmetry.

## Game theory

Applicable: signaling, screening, repeated games, moral hazard, adverse selection, principal-agent problem.

## Power analysis

Analyze: resource control, information control, decision authority, gatekeeping, dependency creation, credit allocation, blame allocation.

## Conflict analysis

Analyze: trigger, response, escalation, boundary behavior, repair attempt, resolution, post-conflict behavior.

## Classical strategy

Sun Tzu may be included as a **strategic/classical lens**, not scientific personality scoring.

**KEEP, unchanged from V1 — model of correct method scoping**: the explicit ban below ("may not diagnose psychology, determine honesty, or directly move formal trust scores") is exactly the right boundary-drawing template, and demonstrates the fix path for the two removed self-reflection methods below existed inside this same document all along. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F11.

Suitable dimensions: 知己, 知彼, 形勢, 虛實, 勢, information asymmetry, strategic terrain.

Possible "cooperation terrain": Money Terrain, Information Terrain, Legal Terrain, Relationship Terrain, Time Terrain, Technology Terrain, Reputation Terrain.

Sun Tzu methods may not: diagnose psychology, determine honesty, directly increase/decrease formal trust scores.

## Self-reflection

> This sub-section is still part of the `HD-23` pending decision above — see that block before treating anything below as final.

V1 examples: MBTI-style preference frameworks *(recommended for removal, see §Psychology above)*, Enneagram *(recommended to leave ungraded, see §Psychology above)*.

**紫微 (Zi Wei Dou Shu) and 八字 (Bazi) — recommended for removal**: these are astrological systems with zero empirical validity under any recognized methodology, and V1's forbidden-use list only blocked *formal/automatic* enterprise scoring — it did not stop a single HCI Personal user (single-user private vault, see `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`) from entering a business partner's birth data and informally deciding to trust or distrust them using a system with zero predictive validity, which is exactly the covert third-party-profiling scenario this whole document set is designed to prevent. Recommendation, if retained at all: restrict strictly to a clearly-labeled, unscored, self-only entertainment feature that cannot accept a third party's identifying data as input and never feeds any Assessment, TrustDomain, or Decision object. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F4 (REMOVE, High confidence).

Allowed (unchanged from V1): personal reflection, analyst bias awareness, communication reflection.
Forbidden (unchanged from V1): enterprise trust scoring, automatic risk decisions, protected-class inference.

## Method contract

Each formal HCI method should declare:

```text
method_id
version
category
origin
evidence_grade
allowed_scope
required_inputs
outputs
forbidden_uses
decision_weight
license_status
validation_status
inference_mode: self_report | third_party_inferred | third_party_applied   -- new in V2, see §Big Five above (F5)
```

`inference_mode` is required on every method that can be pointed at a Subject who did not personally provide the input data — without this field, every future method added to the catalog inherits the same blind spot that produced the Big Five and MBTI findings above. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F5.

## Important separation

```text
Domain Method
!= Cognitive Method
```

Examples:

```text
Big Five           → HCI Domain Method
Trust Model        → HCI Domain Method
BATNA              → Shared Strategy / HCI usable
Sun Tzu Lens       → Shared Strategic Lens / HCI usable
Red Team           → AI LEGO Cognitive Method
ACH                → AI LEGO Cognitive Method
Decision Matrix    → AI LEGO Cognitive Method
5 Whys             → AI LEGO Cognitive Method
```
