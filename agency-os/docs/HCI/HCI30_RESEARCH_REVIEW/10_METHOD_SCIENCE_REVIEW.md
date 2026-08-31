# 10 METHOD SCIENCE REVIEW: Scientific / Behavioral Methodology Review

> Independent analysis by Reviewer F (Scientific / Behavioral Methodology) — part of the HCI-30 x AI LEGO V1 architecture re-research. This reviewer worked in isolation from the other 8 reviewers; any agreement with other reviewers noted elsewhere in this package (see `14_CONVERGENCE_MATRIX.md`) was independently re-derived, not copied.

---

## Narrative Analysis

# Reviewer F — Scientific / Behavioral Methodology Review of HCI-30 V1

## Scope and method

This review covers every named or implied method, instrument, or analytic lens in `05_HCI30_INTELLIGENCE_METHODS.md` and `06_HCI30_PUBLIC_INTELLIGENCE.md`, cross-checked against `04_HCI30_PRODUCT_SPEC.md`, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`, `11_SECURITY_PRIVACY_GOVERNANCE.md`, `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`, and `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`. I ran a repo-wide grep for `MBTI|Enneagram|紫微|八字|trademark|license|EU AI Act|GDPR|social scoring` across all 24 blueprint files; results confirm the psychometric/astrological instruments are named exactly once, in `05_HCI30_INTELLIGENCE_METHODS.md:177-180`, and that "EU AI Act," "GDPR," and "social scoring" do not appear anywhere in the 24-document corpus. That absence is itself a finding, not an assumption — I verified it, I am not inferring it from silence in two files.

The product's declared mission (`04_HCI30_PRODUCT_SPEC.md:5`) is: *"a decision-support platform for understanding people, relationships, incentives, trust, risk, and safe collaboration."* Every method judged below is judged against that specific use case — assessing a named, identifiable, often non-consenting third party for a business-collaboration decision — not against the method's validity in its native, consensual, self-administered context. This distinction is the single most important axis this review adds, and V1 does not currently draw it.

## Headline finding: V1 already knows how to be rigorous — and applies that rigor unevenly

The strongest part of this document set is `06_HCI30_PUBLIC_INTELLIGENCE.md`. Its pipeline (line 15-45) — identity resolution before evidence admission, a search planner that structurally forces both favorable and unfavorable search families (lines 80-98), an explicit rule that "Never search only for negative terms after a user forms a suspicion" (line 100), mandatory counter-search on any adverse legal/regulatory hit (lines 222-234), a legal-status taxonomy that preserves Allegation → Investigation → Charge → Trial → Judgment → Appeal → Settlement → Dismissal → Acquittal as distinct states (lines 129-138) rather than collapsing them to "bad," and the refusal to average "Public Reputation" against "Direct Collaboration Reliability" (lines 288-298) — is genuinely good applied epistemics. It independently reconstructs several core doctrines from the structured-intelligence-analysis literature: Richards Heuer's Analysis of Competing Hypotheses tradition (deliberately searching for disconfirming evidence *before* it is asked for, treating "absence of a search" as a defect), and the forecasting-calibration literature associated with Philip Tetlock's work on superforecasting (separating confidence from consensus, tracking what would change the conclusion). The four-confidence-concepts design in `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102` (Evidence Confidence / Model Agreement / Method Robustness / Decision Confidence, kept deliberately un-averaged) is the correct behavioral-science move against the well-documented human tendency to read "several models agree" as "the underlying evidence is strong" — these are orthogonal facts and V1 is right to insist the UI never let them blur.

Given that this level of care exists in the document, the places where the same discipline is *not* applied stand out sharply, and they cluster almost entirely around Category: Psychology and Category: Self-reflection in `05_HCI30_INTELLIGENCE_METHODS.md`.

## Method-by-method evidence grading

**Big Five / Five-Factor Model** (`05:54`, listed as example under "Psychology," and flagged `05:221` as a "HCI Domain Method"). The five-factor taxonomy itself is one of the best-replicated structures in personality psychology — Grade A/S is defensible *for the taxonomy*. But "Big Five" is not a ready-to-deploy instrument; it is a construct measured by many different instruments with very different licensing and validity profiles. IPIP (Goldberg et al., NIH-funded) is explicitly public domain and free for commercial use. BFI/BFI-2 (Berkeley) is free for research/educational use but commercial deployment needs permission from the authors' lab. NEO-PI-R/NEO-FFI (Costa & McCrae, published by PAR) is proprietary, requires per-use licensing fees, and the publisher's own test-user qualification policy typically restricts administration to psychologists or credentialed professionals — incompatible with unsupervised SaaS deployment. V1 never picks one, so "Big Five" as currently written is not implementable as stated; it is a construct name, not a method contract. Worse, and more consequential: nothing in the document distinguishes *self-report Big Five* (subject fills out a validated questionnaire about themselves — legitimate, well-supported) from *AI-inferred OCEAN traits from a subject's digital footprint, writing samples, or third-party observation* (the pattern implied by HCI's whole design, since HCI profiles people who never opened the product). The academic literature on automated personality inference from text/social media (e.g., the "myPersonality" and subsequent replication literature) reports weak-to-moderate correlations with true self-report scores, typically r ≈ 0.2–0.4 depending on trait and data source, with known demographic and cultural skew. Presenting an LLM's inferred OCEAN estimate of a third party with the same "Grade A" evidence badge as a validated self-administered questionnaire is a category error, and it is exactly the kind of false-certainty risk the mission brief asked me to hunt for.

**MBTI-style preference frameworks** (`05:177`). The empirical literature (Pittenger, 1993, *Review of Educational Research*; Boyle, 1995, *Australian Psychologist*) is consistent and long-standing: MBTI's binary-type architecture is not well supported — traits it dichotomizes are continuously distributed, and test–retest reliability for full four-letter type is poor (a large fraction of retested people receive a different type within weeks). Separately, "MBTI" is a registered trademark of The Myers-Briggs Company; reproducing the four-letter-type structure and terminology, even under a hedge like "MBTI-style," carries real trademark/passing-off exposure once this ships as a commercial feature, independent of the science question. Free clones (e.g., 16Personalities) dodge the licensing problem but not the validity problem — several of them now quietly compute Big Five underneath while marketing MBTI-style labels, which does not fix third-party-inference validity either.

**Enneagram** (`05:178`). No peer-reviewed psychometric validation program comparable to the Big Five exists; it originates from a spiritual/esoteric lineage, not empirical psychology. Evidence grade: below "D — self-reflection framework" as V1's own scale defines it; closer to Grade X ("experimental/under validation") at best, and arguably outside the grading scale entirely since there is no serious validation program in progress to grade.

**紫微 (Zi Wei Dou Shu) and 八字 (Bazi / Four Pillars of Destiny)** (`05:179-180`). These are traditional Chinese fate-calculation systems with zero empirical evidence base under any standard scientific methodology — they are, functionally, astrology. I want to be explicit that this assessment is evidentiary, not cultural: Sun Tzu is also a centuries-old Chinese classical text and V1's treatment of it (`05:144-172`) is a model of *correct* scoping — it is labeled a "strategic/classical lens," explicitly barred from diagnosing psychology, determining honesty, or moving a formal trust score (`05:169-172`), and it is intellectually honest about being a heuristic rather than a science. 紫微/八字 get none of that same firewall. They are listed under "Self-reflection" alongside MBTI and Enneagram, where the forbidden-use list only blocks "enterprise trust scoring," "automatic risk decisions," and "protected-class inference" (`05:187-190`). Nothing in that list stops a Personal-edition user (single-user private vault, `08:16-24`) from entering a business partner's birth data and using 紫微/八字 informally to decide whether to trust them — which is precisely a non-consenting third party being profiled with an instrument they never agreed to and that has no predictive validity. This is legal, brand, and product risk stacked on top of scientific risk, and it sits inside a product whose own marketing rules explicitly forbid presenting itself as "a guaranteed prediction engine" (`04:11`) while shipping a literal fortune-telling module under the same roof.

**Trust models (ability/benevolence/integrity)** (`05:69-77`). This is the Mayer, Davis & Schoorman (1995) organizational-trust model — one of the most cited frameworks in management science, Grade A by any reasonable academic standard. V1's extension with Reliability/Predictability/Alignment/Governance/Permission-separation is a sound applied elaboration, not a new unvalidated instrument, and does not require licensing. This is uncontroversially good architecture — recommend KEEP.

**Cognitive bias defense** (`05:81-99`, echoed at `19:153-165`). Confirmation bias, halo/horn effect, recency, availability, anchoring, loss aversion are all mainstream, well-replicated constructs from the Kahneman/Tversky heuristics-and-biases tradition — Grade A, no licensing issue, and directly useful as an analyst self-check. But the *implementation* as sketched (`05:93-99`: "Confirmation bias: MEDIUM", "Halo effect: HIGH") reintroduces exactly the false-precision problem the document elsewhere polices. There is no validated instrument for real-time quantification of a specific analyst's bias level in a specific case; a MEDIUM/HIGH label here will, in practice, be an LLM's qualitative impression wearing an ordinal-scale costume. This directly contradicts the document's own rule two sections later, in Public Intelligence, that "Fraud Risk = HIGH" is Forbidden output for exactly the same reason (`06:216-219`). The system should not forbid fabricated certainty in one module and ship it in another.

**Negotiation theory / game theory** (`05:101-120`). BATNA, reservation point, signaling, screening, moral hazard, adverse selection, principal-agent — this is legitimate, decades-deep formal and applied literature (Fisher & Ury; Akerlof, Spence, Stiglitz Nobel-cited work). No licensing concern (BATNA and the game-theoretic vocabulary are generic academic terms, not trademarked). Appropriate as *structuring lenses* for how a case is framed, not as scoring instruments on their own — V1 does not misuse them as scores, which is correct.

**Power/conflict analysis** (`05:122-142`). General organizational-behavior constructs (resource/information control, escalation, repair) — Grade B/C, standard practitioner frameworks, no licensing issue, appropriately treated as qualitative lenses rather than scored instruments.

**"validated teamwork/communication instruments"** (`05:55`). This is a placeholder, not a method — no specific instrument is named, so there's nothing to grade yet. V1 already lists "Method licensing/legal review" as Open Decision #18 (`16:119`), which is the correct place for this to land; I am not adding a new gap here so much as confirming V1 correctly flagged it as unresolved and should not let implementation get ahead of naming the actual instrument.

## The structural gap: consent is a formal method-contract field for Public Intelligence but not for Psychology/Self-reflection

`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` and `11_SECURITY_PRIVACY_GOVERNANCE.md` build real protective machinery for the OSINT side of HCI (evidence provenance, source quality, protected-attribute exclusion at `11:85-97`, RESTRICTED-by-default classification). But that machinery governs *what evidence is admissible*, not *whether a self-report psychometric or fate-calculation instrument may be run on a person who never consented to being typed at all*. The `05:192-209` method contract schema — `method_id, version, category, origin, evidence_grade, allowed_scope, required_inputs, outputs, forbidden_uses, decision_weight, license_status, validation_status` — has no field for "requires subject's own self-report input" versus "may be inferred/applied to a third party by someone else." That single missing field is the root cause underneath several of the findings above: Big Five's validity collapse under third-party inference, MBTI's forbidden-use gap, and 紫微/八字's complete absence of any third-party guardrail all trace back to the same missing invariant.

## False certainty and regulatory exposure

Two cross-cutting risks deserve explicit naming for the human architect, both because they are large and because more analysis alone won't resolve them — they are genuine value trade-offs.

First, `19:84-102` shows numeric confidence output (`Evidence Confidence: 43%`, `Model Agreement: 95%`, `Method Robustness: 68%`, `Decision Confidence: 54%`) without describing the statistical model that would make those numbers meaningful (calibration curve, backtest, Brier score). Percentages read as measured quantities to end users; an LLM asked to produce "68%" is very likely fabricating false precision from what is actually a qualitative judgment. Until a real calibrated model exists — which `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md` already flags as unresolved ("Confidence algorithm v1," item 3; "Evidence-quality algorithm v1," item 4) — the intelligence-community convention of Words of Estimative Probability bands (per ICD 203: Almost No Chance / Very Unlikely / Unlikely / Roughly Even / Likely / Very Likely / Almost Certain) is both more honest and more defensible than a bare percentage with no calibration behind it.

Second, HCI's stated purpose — assessing the trustworthiness of specific, named, real people, for business decisions, potentially at Enterprise/Group/multi-jurisdiction scale (`08:60-84`) — sits close to language regulators are actively targeting. The EU AI Act (Regulation (EU) 2024/1689) Article 5 prohibits certain forms of social scoring of natural persons, and separately Annex III treats several categories of profiling/assessment of natural persons as high-risk with mandatory conformity obligations. I verified via full-corpus grep that this regulation, GDPR, and "social scoring" are not mentioned anywhere in the 24-document blueprint. That doesn't mean HCI necessarily falls inside the prohibited or high-risk categories — that classification requires an actual legal opinion, which is exactly why I am not resolving it myself — but shipping a Group/Enterprise edition into EU jurisdictions without that opinion on file is a High-risk, essentially irreversible-if-wrong exposure (retroactive fines, forced product withdrawal, reputational damage), and it belongs on the human-decision list explicitly rather than living only inside a generic "Enterprise licensing" bullet (`16:118`).

## What to keep exactly as-is

To be clear this is not a wholesale indictment: the trust-domain model (`04:52-66`), the refusal to collapse to one universal score (`01:116`, `04:54`), the Fact/Observation/Interpretation/Hypothesis/Assessment separation (`01:28-37`, `07:48-76`), the balanced-search-planner and mandatory-counter-search design in Public Intelligence (`06:80-100`, `06:222-234`), the legal-status taxonomy preserving Allegation through Acquittal (`06:129-138`), and the Sun Tzu scoping discipline (`05:144-172`) are all methodologically sound and should not be touched. They demonstrate the authors know how to build this correctly — the psychology/self-reflection category is the outlier, not the norm, and the fix is to bring it up to the standard the rest of the document already sets, not to invent a new standard.

## Bottom line

V1's Public Intelligence layer is publication-quality applied epistemics. V1's Psychology/Self-reflection layer is a well-intentioned but under-specified list that currently treats "Big Five" (a scientifically strong construct with an unpicked, licensing-variable instrument), "MBTI-style" (weak validity, live trademark risk), "Enneagram" (essentially unvalidated), and "紫微/八字" (zero empirical basis, astrology) as members of the same category with the same forbidden-use firewall — and that firewall does not even cover the single scenario the mission brief specifically asked me to hunt for: running any of these on a third party who never consented. Closing that gap, naming actual licensable instruments, replacing quantified-sounding bias/confidence labels with either real calibrated statistics or honest qualitative bands, and getting a formal legal read on EU AI Act exposure before Enterprise/Group ships are the four highest-leverage changes available here, and none of them require abandoning the parts of the design that already work well.


---

## Change Items (11)

### F1 — "Big Five" is a construct name, not an implementable method — no instrument, no self-report-vs-inferred distinction

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:54,221 lists "Big Five / Five-Factor Model" as an HCI Domain Method with no named instrument and no distinction between self-report and AI-inferred application. |
| **Problem** | Big Five the taxonomy is well-validated (Grade A/S), but no specific instrument is chosen, and the document does not distinguish subject-administered self-report (strong validity) from AI-inferred trait estimation from a third party's digital footprint (weak validity, r~0.2-0.4 vs self-report in the automated-personality-inference literature). Shipping the latter with the evidence badge of the former is false certainty. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:54, 05_HCI30_INTELLIGENCE_METHODS.md:192-209 (method contract has no self-report-vs-inferred field), 05_HCI30_INTELLIGENCE_METHODS.md:221 |
| **Risk if unchanged** | Trust scores partly built on unlicensed or unvalidated personality inference; legal exposure if a scored subject disputes the basis of an assessment used against them. |
| **Alternative A** | Instrument = IPIP-NEO (public domain), self-report only, never run on third parties without their own input. |
| **Alternative B** | Instrument = licensed BFI-2 or NEO-PI-R, both self-report and AI-inferred modes, each separately evidence-graded. |
| **Alternative C** | Drop Big Five from formal Trust Assessment scoring entirely; keep only as an optional self-reflection tool inside HCI Personal for the user's own self-administered result. |
| **Recommended** | Name a specific, commercially-clean instrument (IPIP is public domain and free for commercial use; BFI-2 is free for research/education but needs explicit permission for commercial SaaS; NEO-PI-R is proprietary and typically requires credentialed administration and per-use fees — avoid it). Add a required `inference_mode` field to the method contract: `self_report` vs `third_party_inferred`, with a materially lower default evidence_grade and a mandatory UI caveat for the inferred mode. |
| **Why** | An unnamed instrument cannot be licensed, audited, or validated; a named-but-unlabeled inference mode will silently present weak evidence as strong, which the rest of the document (esp. 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md) is otherwise careful to avoid. |
| **Blast radius** | HCI Domain Method layer, Assessment/AssessmentDimension tables (07), Trust Domain scoring (04). |
| **Migration impact** | Low if fixed before first production Assessment; high after, because 01_SYSTEM_CONSTITUTION.md Invariant 6 forbids overwriting historical assessments, so bad inferences would need superseding versions, not correction. |
| **Rollback** | Feature-flag the third_party_inferred mode off; fall back to self_report-only Big Five until instrument and mode are formally specified. |
| **30-year consequence** | Once a scoring pipeline ships with fabricated-precision personality inference baked in, migrating every historical Assessment off it later is expensive and users will have already made real collaboration decisions on faulty confidence. |
| **Confidence** | High |
| **Requires human decision** | YES |

### F2 — MBTI-style typing carries live trademark risk and materially weaker evidence than Big Five for the same purpose

| Field | Content |
|---|---|
| **Disposition** | REMOVE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:177 lists "MBTI-style preference frameworks" under Self-reflection, allowed for personal reflection/analyst bias awareness/communication reflection. |
| **Problem** | MBTI's four-letter binary typing is not well supported by the psychometric literature (Pittenger 1993; Boyle 1995: poor test-retest reliability, traits are continuous not dichotomous). Separately, "MBTI" is a registered trademark of The Myers-Briggs Company; shipping an "MBTI-style" four-letter typing feature commercially risks trademark/passing-off exposure regardless of the validity question, and free clones (16Personalities-style) dodge the license issue but not the validity issue. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:174-190 (Self-reflection category and its allowed/forbidden lists), 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:102 (trademark strategy open decision is scoped to the HCI product name, not to third-party marks used inside the product) and :119 (method licensing/legal review still open) |
| **Risk if unchanged** | Cease-and-desist or brand dispute risk once commercialized; user confusion between a scientifically weak instrument and Big Five sitting in the same UI with equal visual weight. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Either drop MBTI-style typing in favor of Big Five (scientifically stronger, same self-reflection use case covered), or if kept for entertainment/engagement purposes, commission a trademark clearance opinion and add an explicit non-scientific disclaimer distinct from Big Five's evidence badge. |
| **Why** | Two independent risk classes (weak validity, live IP exposure) point the same direction; there is no scientific reason to keep MBTI once Big Five is already in the catalog for the identical use case. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | Trivial — it is not load-bearing for any formal Trust Assessment per the current forbidden-use list. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | YES |

### F3 — Enneagram has no established empirical validation program

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:178 lists Enneagram under Self-reflection with the same Grade D treatment implied for MBTI-style and Big Five's neighbors. |
| **Problem** | Enneagram originates from a spiritual/esoteric tradition, not empirical psychology, and lacks a peer-reviewed validation program comparable to the Five-Factor Model. Grading it at "D — self-reflection framework" alongside MBTI implies more scientific standing than the literature supports; it arguably belongs below the grading scale (closer to Grade X or ungraded). |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:36-43 (evidence grading scale), 05_HCI30_INTELLIGENCE_METHODS.md:174-190 |
| **Risk if unchanged** | Product credibility risk if a scientifically literate enterprise buyer discovers Enneagram sitting next to Big Five with parallel treatment. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Either remove Enneagram from the formal method catalog, or keep it strictly as an unscored, clearly-labeled "cultural/entertainment reflection tool" with no evidence_grade field populated and explicit exclusion from any Assessment pipeline. |
| **Why** | The method contract schema (05:192-209) requires an evidence_grade for every formal method; Enneagram cannot honestly receive one on the current S-X scale without overstating its standing. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### F4 — 紫微 (Zi Wei Dou Shu) and 八字 (Bazi) are astrological systems with zero empirical validity, listed without a third-party-consent firewall

| Field | Content |
|---|---|
| **Disposition** | REMOVE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:179-180 lists 紫微 and 八字 under Self-reflection with the same forbidden-use list as MBTI/Enneagram (enterprise trust scoring, automatic risk decisions, protected-class inference forbidden; personal reflection allowed). |
| **Problem** | These systems have no scientific evidence base under any recognized methodology. More importantly, the forbidden-use list only blocks *formal/automatic* enterprise scoring — it does not block a single HCI Personal user (single-user private vault, 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:16-24) from entering a business partner's birth data and informally deciding to trust or distrust them using a system with zero predictive validity. That is exactly the third-party covert profiling scenario this review was asked to hunt for, and it sits inside a product whose own marketing rules forbid presenting itself as a "guaranteed prediction engine" (04_HCI30_PRODUCT_SPEC.md:11). |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:174-190, 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:16-24, 04_HCI30_PRODUCT_SPEC.md:5-13 |
| **Risk if unchanged** | Legal/regulatory exposure if used to inform an actual business decision about a real person who is harmed by it; severe brand risk if positioned next to "decision-support platform"; potential consumer-protection exposure in jurisdictions that regulate deceptive business-decision aids. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Remove 紫微/八字 from any module that can be pointed at a named third party for a collaboration/trust decision, in any edition. If retained at all, restrict strictly to a clearly-labeled, unscored, self-only entertainment feature that cannot accept a third party's identifying data as input, and that never feeds any Assessment, TrustDomain, or Decision object. |
| **Why** | This is not a validity judgment applied unevenly by origin — Sun Tzu (also classical Chinese, 05:144-172) is scoped correctly with an explicit ban on diagnosing psychology or moving trust scores, and that same discipline is simply missing here. The problem is the absent third-party firewall plus zero evidence base, not the system's cultural origin. |
| **Blast radius** | — |
| **Migration impact** | None if removed pre-launch; customer-facing if removed post-launch (Personal-edition users who used it for self-entertainment would need a deprecation notice). |
| **Rollback** | Straightforward pre-launch; feature-flag off. |
| **30-year consequence** | A pseudo-scientific module baked into the domain method catalog early is disproportionately hard to remove later once customers build workflows around it — better to never ship it inside the formal method taxonomy at all. |
| **Confidence** | High |
| **Requires human decision** | YES |

### F5 — Method contract schema has no field distinguishing self-administered from third-party-inferred/third-party-applied use

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:192-209 defines the method contract: method_id, version, category, origin, evidence_grade, allowed_scope, required_inputs, outputs, forbidden_uses, decision_weight, license_status, validation_status. |
| **Problem** | None of these fields capture whether a method requires the subject's own consenting input (valid self-report use) versus being applied by someone else to infer traits about a non-consenting third party (the root cause underlying F1, F2, F4). This is a structural gap, not a per-method one. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:192-209 |
| **Risk if unchanged** | Every future psychology/self-reflection method added to HCI repeats the same third-party-consent gap. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add `consent_requirement` (enum: subject_self_report_required \| observer_report_permitted \| inference_from_public_data_only \| not_applicable) and `third_party_evidence_grade` (separate from the instrument's native evidence_grade) to the method contract schema before it is finalized (this schema is explicitly listed as Next Artifact #3 in 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:154-162). |
| **Why** | Without this field, every future method added to the catalog inherits the same blind spot that produced F1/F2/F4; fixing the schema once fixes the class of problem instead of patching each instance. |
| **Blast radius** | — |
| **Migration impact** | Low — this is additive to an artifact not yet built (Next Artifact #3 is still open per 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:154). |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### F6 — Analyst-bias quantification ("Confirmation bias: MEDIUM") contradicts the system's own ban on fabricated numeric certainty

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:91-99 and 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:153-165 show reports exposing ordinal bias ratings like "Confirmation bias: MEDIUM", "Halo effect: HIGH". |
| **Problem** | There is no validated instrument for real-time quantification of a specific analyst's cognitive bias in a specific case. An LLM asked to output MEDIUM/HIGH is producing a qualitative impression dressed as a measured ordinal value — the same failure mode the document itself explicitly forbids two files later: "Fraud Risk = HIGH" is listed as Forbidden output in 06_HCI30_PUBLIC_INTELLIGENCE.md:216-219 for exactly this reason. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:91-99, 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:153-165, contradicted by 06_HCI30_PUBLIC_INTELLIGENCE.md:201-220 |
| **Risk if unchanged** | Users anchor on a fabricated bias score the same way the document warns against anchoring on a fabricated risk score — internal inconsistency undermines the credibility of the whole explainability system. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Replace the ordinal bias labels with binary, checkable evidence of process discipline — e.g. "Counter-search performed: YES/NO", "Contradictory evidence reviewed: YES/NO", "Search families covered: N/12" (06:81-98's own categories) — which the document already does correctly elsewhere (05:98 "Contradictory evidence reviewed: YES" is exactly this pattern) rather than an unfounded MEDIUM/HIGH self-rating. |
| **Why** | The system should not forbid fabricated certainty in one module (public intelligence) and ship an equivalent pattern in another (bias self-report); consistency is cheap to fix now and expensive to fix once analysts and customers rely on the ordinal labels. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### F7 — Numeric confidence percentages (43%, 95%, 68%, 54%) imply calibration that does not yet exist

| Field | Content |
|---|---|
| **Disposition** | DEFER |
| **Current V1** | 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102 shows Evidence Confidence, Model Agreement, Method Robustness, and Decision Confidence each rendered as a precise percentage. |
| **Problem** | Percentages read as measured quantities. Without a documented, backtested, calibrated statistical model behind each number (calibration curve, Brier score, or equivalent), an LLM-produced "68%" is very likely a fabricated-precision restatement of a qualitative judgment. 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:105-106 already lists "Confidence algorithm v1" and "Evidence-quality algorithm v1" as unresolved, confirming no such model exists yet. |
| **Evidence** | 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102, 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:105-106 |
| **Risk if unchanged** | Users make real collaboration/trust decisions anchored on numbers that carry no demonstrated statistical meaning. |
| **Alternative A** | Ship qualitative WEP-style bands now, add numeric percentages only after Confidence Algorithm v1 is calibrated and backtested. |
| **Alternative B** | Ship numeric percentages now with a visible "uncalibrated / directional only" caveat on every screen that shows them. |
| **Alternative C** | Ship numeric percentages with no caveat, accepting the false-certainty risk as a conscious product trade-off (not recommended). |
| **Recommended** | Until a calibrated model with documented backtesting exists, replace bare percentages with qualitative bands consistent with the intelligence-community Words of Estimative Probability convention (ICD 203): e.g. Very Low / Low / Moderate / High / Very High, each mapped to a defined and published probability range. Reserve numeric percentages for after Confidence Algorithm v1 ships with calibration evidence. |
| **Why** | This keeps the product's own stated principle — never present false certainty (echoed throughout 04, 06, 19) — consistent between the public-intelligence module (which already does this well) and the UI confidence display (which currently does not). |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | Precision theater in the UI, once normalized, is hard to walk back — customers will treat a later downgrade to qualitative bands as the product getting worse, even though it would be getting more honest. |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### F8 — No formal legal review of EU AI Act / GDPR / social-scoring exposure anywhere in the 24-document blueprint

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:118 lists only a generic "Enterprise licensing" open decision. |
| **Problem** | HCI's stated purpose is assessing the trustworthiness of specific, named, real people for business decisions (04_HCI30_PRODUCT_SPEC.md:5), with Enterprise/Group editions explicitly planned for multi-region/multi-jurisdiction deployment (08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:60-71). This is close to language the EU AI Act (Regulation (EU) 2024/1689) targets: Article 5 restricts certain social-scoring uses of AI on natural persons, and Annex III treats several profiling/assessment categories as high-risk with conformity obligations. A repo-wide grep across all 24 blueprint files confirms "EU AI Act", "GDPR", and "social scoring" appear nowhere in the corpus. |
| **Evidence** | 04_HCI30_PRODUCT_SPEC.md:5, 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:60-71, 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:118 (only generic licensing item present); absence confirmed via full-corpus grep across all 24 files in D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1 |
| **Risk if unchanged** | Shipping Enterprise/Group into EU jurisdictions without this opinion risks regulatory action after significant customer and data investment, which is far more expensive to unwind than to check first. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Commission a formal legal opinion on EU AI Act classification (prohibited social scoring vs. high-risk Annex III vs. out of scope) before any Enterprise/Group edition targets EU customers or data subjects, and add it as an explicit named line item (not folded into generic "Enterprise licensing"). |
| **Why** | This is a High-risk, largely irreversible-if-wrong exposure (forced withdrawal, fines, reputational damage) and a genuine legal/value judgment call that no amount of additional architectural analysis on my part can resolve — it requires actual counsel. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### F9 — Trust model extension (Mayer-Davis-Schoorman ability/benevolence/integrity + Reliability/Predictability/Alignment/Governance) is sound organizational-trust science

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:67-77 uses ability/benevolence/integrity as inputs and extends with Reliability, Predictability, Alignment, Governance, Permission separation. |
| **Problem** | No problem — this is a positive finding included for completeness. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:67-77 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Keep as-is. This is the Mayer, Davis & Schoorman (1995) ABI trust model, one of the most cited frameworks in organizational-trust research (Grade A), and the extension fields are a reasonable applied elaboration rather than a new unvalidated instrument. |
| **Why** | Confirms V1 is capable of correctly grading and scoping a strong method; useful as a positive baseline against which F1-F4 are judged. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### F10 — Public Intelligence's balanced-search-planner and mandatory-counter-search design correctly implements structured-intelligence-analysis debiasing doctrine

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 06_HCI30_PUBLIC_INTELLIGENCE.md:80-100 requires both favorable and unfavorable search families and forbids searching only negative terms after a user forms a suspicion; 06:222-234 mandates counter-search for dismissed/acquitted/settled outcomes on any adverse legal/regulatory hit. |
| **Problem** | No problem — positive finding included for completeness and to anchor the recommendation in F6/F7 that the rest of the system should be brought up to this standard, not the reverse. |
| **Evidence** | 06_HCI30_PUBLIC_INTELLIGENCE.md:80-100, 06_HCI30_PUBLIC_INTELLIGENCE.md:222-234, 06_HCI30_PUBLIC_INTELLIGENCE.md:288-298 (Public Reputation vs Direct Experience divergence, never averaged) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Keep as-is; this is a strong, evidence-based implementation of debiasing practice comparable to Heuer's Analysis of Competing Hypotheses tradecraft and forecasting-calibration literature (Tetlock). Use it as the template when reworking the Psychology/Self-reflection category. |
| **Why** | This is the single best-designed part of the two lens documents and should be explicitly protected from any future simplification pass. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### F11 — Sun Tzu / classical strategy scoping is a model of correct method boundary-drawing

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:144-172 scopes Sun Tzu strictly as a strategic/classical lens, explicitly forbidden from diagnosing psychology, determining honesty, or moving formal trust scores. |
| **Problem** | No problem — positive finding, included to make clear that the removal recommendations for MBTI/Enneagram/紫微/八字 (F2-F4) are about evidence base and the missing third-party firewall specifically, not a blanket objection to non-empirical/classical frameworks as a category. |
| **Evidence** | 05_HCI30_INTELLIGENCE_METHODS.md:144-172, esp. :169-172 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Keep as-is; this is the correct pattern — grade it honestly (Grade C, classical heuristic, not scientific), forbid it from touching formal scores, and it becomes a legitimate advisory lens. Apply this exact pattern to 紫微/八字 if the business decision in F4 is to keep them in some reduced form rather than remove them outright. |
| **Why** | Demonstrates the fix path for F4 already exists inside the same document; the gap is inconsistent application, not absence of a template. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

---

## Open Assumptions Flagged by This Reviewer

- Assumed HCI's 'AI-inferred' trait estimation (vs. self-report) is a real planned use case, inferred from the product mission statement (04:5, profiling people who never log into HCI) rather than from an explicit line in 05/06 that says 'we will infer Big Five from text/behavior' — this should be confirmed with the product owner.
- Assumed 紫微/八字/MBTI/Enneagram are intended for the Personal edition's single-user private vault based on 08:16-24, since 05 does not state which edition(s) carry the Self-reflection category.
- Treated 'EU AI Act exposure' as a live risk based on the product's own stated purpose and planned multi-region Enterprise/Group deployment (08:60-71), not on any stated EU go-to-market plan explicitly found in the corpus — worth confirming actual target jurisdictions before treating F8 as urgent vs. eventually-necessary.
- Licensing characterizations for IPIP/BFI-2/NEO-PI-R and MBTI trademark status reflect my general domain knowledge as of training cutoff, not a fresh legal check against current terms — flagged accordingly as requiring the human-directed legal review already listed as Open Decision #18 (16:119).

---

## Open Risks Flagged by This Reviewer

- Third-party covert profiling: no method in the Self-reflection or Psychology categories currently requires the profiled subject's own consent/input before being applied to them by someone else (F5 root cause; manifests concretely in F1, F2, F4).
- False-certainty stacking: numeric confidence percentages (F7) and ordinal bias self-ratings (F6) both create unwarranted precision, and they compound — a report could show '68% Method Robustness' next to 'Confirmation bias: LOW', giving a false impression of rigor on two axes simultaneously.
- Regulatory: EU AI Act / GDPR / social-scoring exposure is entirely unaddressed in the current 24-document corpus (F8) and is a genuine unresolved legal question, not merely a documentation gap.
- IP/trademark: MBTI-style typing (F2) and any future named commercial instrument (F1) carry licensing/trademark exposure that has not been legally reviewed, though V1 does correctly flag 'Method licensing/legal review' as an open decision (16:119).
- Brand coherence risk: shipping 紫微/八字 (astrology-grade evidence) inside the same product and even the same method category as Big Five (strong scientific evidence) undermines the credibility of the entire HCI evidence-grading system in the eyes of a sophisticated enterprise buyer, independent of the legal risk in F4.
