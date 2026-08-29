# 09 AI INTELLIGENCE REVIEW: AI / Intelligence Architecture Review

> Independent analysis by Reviewer E (AI / Intelligence Architecture) — part of the HCI-30 x AI LEGO V1 architecture re-research. This reviewer worked in isolation from the other 8 reviewers; any agreement with other reviewers noted elsewhere in this package (see `14_CONVERGENCE_MATRIX.md`) was independently re-derived, not copied.

---

## Narrative Analysis

# Reviewer E — AI / Intelligence Architecture — Independent Review of HCI-30 × AI LEGO V1

## Method

I read all 24 files in `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\` in the prescribed order (00→23), then cross-checked the specific claims those documents make about "AI LEGO Cognitive Engineering OS" against the actual, currently-existing AI LEGO artifacts under `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\` — the three mother documents (Global Master Plan, Method Atlas, Execution Contract), ten accepted/proposed ADRs, ~40 machine-readable JSON-Schema `specs/*.yaml` files, the `policies/ai-execution/*.yaml` policy-as-code files, the Phase-0/1 research registers (GAP/RISK/CONFLICT/DUPLICATION registers), and the Claude×Codex `CONVERGENCE_MATRIX.md` cross-review artifact. This second corpus is not hearsay about AI LEGO — it is AI LEGO, verified firsthand this session, and it is considerably more mature, in the specific area of evidence/decision/authority semantics, than the HCI-30 blueprint documents acknowledge. That gap between "what V1 says AI LEGO offers" and "what AI LEGO's own repository already contains" is the central finding of this review.

## The central question: are HCI's "evidence/confidence/trust" machinery and AI LEGO's "method selection/workflow/replay" machinery genuinely separable, or is there an unavoidable shared technical core?

**Verdict: there is a real, unavoidable shared technical core, and V1 has not drawn the boundary around it correctly.** The boundary V1 draws (02, 09) is: HCI owns Person/Relationship/Trust-domain/Collaboration-decision *semantics*; AI LEGO owns Method/Workflow/Execution/Replay *mechanics*. That split is correct for the *domain-specific* content — Big Five, negotiation theory, Sun Tzu lenses, trust-domain math genuinely belong to HCI (05:211-229 gets this right, and I would not change it). But it is not the only place two systems that both produce "conclusions about uncertain things, some of them about real people, with a human required to sign off" will need to share a substrate. Concretely, the AI LEGO repository already contains, as accepted or active machine-readable schemas:

- `specs/governance/epistemic-label.schema.yaml` (ADR-004, ACCEPTED 2026-08-29): an 11-value `epistemic_type` enum — `SOURCE_FACT, EVIDENCE, ASSUMPTION, HYPOTHESIS, AI_INFERENCE, AI_SUGGESTION, HUMAN_OPINION, CALCULATED_RESULT, SIMULATED_RESULT, UNKNOWN, DECISION` — plus an orthogonal `authorship_state` axis (`HUMAN_ORIGINAL, AI_GENERATED, AI_SUGGESTED, HUMAN_EDITED, HUMAN_APPROVED, SOURCE_QUOTATION`) and a `locked` axis (`LOCKED_FACT`, `LOCKED_DECISION`) with the explicit rule "content with `locked != null` MUST NOT be modified by AI" and a `promotion_redline` that forbids `UNKNOWN -> SOURCE_FACT` direct promotion.
- `specs/evidence/evidence.schema.yaml` and `specs/evidence/claim.schema.yaml`: Evidence records (`evidence_id`, `content`, `source`, `quality_assessment` across 8 dimensions, `hierarchy_tier`, `provenance`) and Claim records (`claim_id`, `statement`, `supporting_evidence[]`, `contradicting_evidence[]`, `confidence 0-1`, `provenance`) with real cross-`$ref` links between them.
- `specs/decision/decision.schema.yaml`: a Decision record that *requires* `human_judgment_pending` and, once decided, `human_judgment.{decision_maker, decision, rationale, timestamp}` all four required; carries `minority_opinions` (dissent), `reversal_conditions[]` (an array of independently-actioned reversal criteria, itself a sibling schema), and a new `lenses_applied[]` field explicitly added because Atlas's own Quality Gate requires "high-risk Decisions show MULTIPLE lenses + dissent."
- `specs/execution/risk-tier.schema.yaml` (ADR-004): a canonical `R0-R4` risk ladder with concrete required actions per tier, and `policies/ai-execution/mandatory-gates.yaml`: a grounded rule — `risk_tier IN [R3, R4] → action: REQUIRE_HUMAN_REVIEW` — already validated against `jsonschema.Draft202012Validator`.
- `policies/ai-execution/authority.yaml`: an `A0-A4` autonomy ladder binding action categories (delete/publish/send/deploy/credential-rotation) to required human-authority levels, with `MODIFY_LOCKED_FACT` given no AI-autonomous path at all under any authority level.

Now compare that to what the HCI-30 blueprint independently re-derives, with no cross-reference to any of the above:

- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:48-76` invents a "Fact / Observation / Interpretation / Hypothesis" separation with the worked example "Alice is unreliable" must not be written as fact — this is the *same distinction*, with different label names, as `epistemic_type`'s SOURCE_FACT/EVIDENCE/HYPOTHESIS/AI_INFERENCE/HUMAN_OPINION split, minus the already-solved promotion-redline rule.
- `04_HCI30_PRODUCT_SPEC.md:116-134` invents its own decision-state enum (`PROCEED / PROCEED_WITH_CONTROLS / LIMIT_ACCESS / PAUSE / REVIEW_REQUIRED / EXIT`) and `01_SYSTEM_CONSTITUTION.md` Invariant 2 (AI is non-authoritative for high-impact final decisions) — this is the same "human final decision, dissent preserved, reversal criteria required" shape AI LEGO's `decision.schema.yaml` already implements as a validated, versioned artifact, not just prose.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:160-176` invents a fresh 4-level LOW/MEDIUM/HIGH/CRITICAL "cross-model gate by risk" table that does not map onto AI LEGO's already-accepted 5-level R0-R4 tier or its already-grounded `mandatory-gates.yaml` rule.
- `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102` invents "Model Agreement" as a metric to be computed, with no reference to the fact that AI LEGO's own cross-review process (`.ai/research/cross-review/CONVERGENCE_MATRIX.md:5`) already implements exactly this as a working classification taxonomy — `AGREE / PARTIAL_AGREEMENT / DISAGREE / UNKNOWN / REQUIRES_EVIDENCE / REQUIRES_HUMAN_DECISION` — with the literal governing quote "**AI consensus ≠ FACT** — the ceiling of both sides agreeing is `AGREE`." Note this taxonomy is *strictly richer* than the blueprint's own binary "AGREE != FACT" framing (09:98-102) — it already distinguishes disagreement from insufficient evidence from a genuine human value call, which is exactly the nuance HCI's "MODEL DISAGREEMENT" UI concept (19:47-60) needs and currently lacks.
- `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P2-02 proposes HCI build its own `MODEL_REGISTRY.md / PROMPT_REGISTRY.md / DRIFT_MONITORING.md` under `systems/hci30/ai/` — but AI LEGO's *own* gap register already independently flags the identical gap for itself: `GAP_REGISTER.yaml:320-323` — "AnalysisRun schema has no model-version field; no model-registry/drift-handling flow; full-text search for model registry/versioning/champion-challenger/concept-drift/retrain returns zero hits" — and `TEST_EVAL_STRATEGY.md:300` records the same gap against Master Plan §37. Two independent teams in the same repository, in the same architecture pass, separately discovered the same missing capability and each proposed to build it themselves.

This is not a coincidence and it is not merely "V1 agrees with itself" — it is the opposite: two documents that were *supposed* to treat each other as black boxes each independently rediscovered the need for the same primitives, which is strong evidence that those primitives are load-bearing infrastructure, not incidental overlap. The System Constitution's own stated principles — "Zero rework where avoidable" (01:17), "Vendor-neutral core" (01:71), Invariant 5 "version... prompts... policies" (01:78) — argue for extracting this, and the LEGO taxonomy document already has a home for it: `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md`'s "Intelligence LEGO" category (18:27-32) literally lists "confidence calculator" and "contradiction detector" as generic examples, and its dependency-direction diagram (18:190-202) already places Intelligence LEGO *below* Domain LEGO and *above* Cognitive LEGO in a shared stack — the document's own architecture already implies this should be shared; 09's exclusion list simply never named it.

The honest tension: 10's "Independence requirement" ("HCI must remain able to create/edit persons... when AI LEGO is unavailable") is real and must not be broken. My recommendation (see change item C1) is a small versioned kernel extraction, not a live runtime dependency — HCI can vendor/pin a specific version of the epistemic/provenance/decision-shape contract the way any of AI LEGO's own schema files already vendor a specific ADR version, and diverge if AI LEGO truly disappears, which satisfies Invariant 3 ("systems must fail independently") without accepting the split-brain risk of two independently-evolving "what counts as a fact" state machines. AI LEGO's own cross-review document names the risk category this creates if left alone: "**label/lock drift 毀 human-protection**" (CONVERGENCE_MATRIX.md:58) — drift in exactly this kind of labeling and locking machinery is called out, by AI LEGO's own authors, as one of the two or three top risks to the entire program. HCI reinventing the same labels under different names *is* that drift, just introduced from the other side.

## Which decisions/fields must be deterministic, probabilistic, LLM-assisted, or human-only

The blueprint gestures at this (01 Invariant 2, 04's decision states, 11's employment boundary) but never produces the field-by-field policy it promises (16 open decision #6 "Permission model v1", #7 "HCI Domain Policy machine-readable schema" — both still open). Given the evidence read, here is the classification this review recommends the human architect adopt, reusing AI LEGO's already-built A0-A4/R0-R4 machinery rather than inventing a parallel one:

**MUST be deterministic (rule-engine, not model output):**
- Identity-resolution *state transitions* into `MATCH_CONFIRMED` for any RESTRICTED-classified subject (06:68-76) — must require either a unique verifiable identifier match or explicit human confirmation, never an LLM's self-reported similarity confidence alone (see C6 below — this is the single largest real-world liability surface in the entire product).
- Evidence admission-state transitions (`DISCOVERED → MATCHED → VERIFIED → ACCEPTED`, 06:188-197) below `ACCEPTED`.
- Retention/deletion/legal-hold enforcement (07:211-222, 12:145-161).
- Protected-attribute exclusion enforcement at the scoring layer (11:85-97) — this must be a hard filter, not a prompt instruction to an LLM to "please don't consider race."
- The `locked` / `LOCKED_FACT` / `LOCKED_DECISION` write-protection AI LEGO already formalizes (epistemic-label.schema.yaml:99-102) — "content with `locked != null` MUST NOT be modified by AI" must apply identically to any HCI record an AI LEGO-returned analysis touches.
- Audit-event emission on every state transition above (11:137-159).

**MAY be probabilistic (a model may compute a number, but the number is advisory, not an admission gate):**
- Source-quality grading (S1-S6, 06:140-155).
- Claim-extraction candidate generation and contradiction *detection* (as opposed to contradiction *resolution*) (06:15-46).
- Evidence Confidence / Method Robustness scores (19:84-102) — provided they remain displayed *separately*, per 19's own (correct) design, and never collapsed into one number.
- Trust-domain scoring outputs, once fed only by admitted (not raw) evidence.

**MAY be LLM-assisted, always surfaced with a human-review flag before it can affect a formal record:**
- Report synthesis / narrative drafting (06's "Synthesis" pipeline stage, 19's formal report sections).
- Hypothesis generation, timeline construction, alternative-explanation generation (05, 19:135-150).
- Any AI LEGO cognitive method output (ACH, Red Team, Premortem, Decision Matrix) returned across the integration contract (10) — per 10's own correct admission gate (10:81-93), this is architecturally right and should not change.
- Cross-model convergence classification itself, using AI LEGO's already-proven `AGREE/PARTIAL_AGREEMENT/DISAGREE/REQUIRES_EVIDENCE/REQUIRES_HUMAN_DECISION` taxonomy rather than a new one.

**MUST NEVER be decided by an LLM alone, under any confidence score:**
- The final `PROCEED / PROCEED_WITH_CONTROLS / LIMIT_ACCESS / PAUSE / REVIEW_REQUIRED / EXIT` collaboration decision about a real person (04:116-127, 01 Invariant 2) — this is already V1's stated position and this review affirms it as correct; keep it verbatim.
- Any Hire/Fire/Promotion/Compensation-adjacent output (11:99-116) — already correctly forbidden; keep.
- Promotion of a claim from `UNKNOWN`/`HYPOTHESIS`/allegation status directly to `SOURCE_FACT`/`VERIFIED` (this is literally the `promotion_redline` AI LEGO already enforces machine-readably; HCI's public-intelligence "Negative evidence rules" section, 06:201-220, states the same policy in prose but has no equivalent machine-checkable gate — recommend it adopt one).
- `identity_candidates → identity_matches` confirmation for a RESTRICTED subject (same as the deterministic item above, stated from the negative side).
- Any write to a `locked` record.

## Public intelligence / retrieval-specific findings

06's public-intelligence pipeline and 21's Wave-6 threat models (`TM_PUBLIC_INTELLIGENCE.md`, `TM_AI_ANALYSIS.md`, planned, not yet written) propose to independently derive SSRF/prompt-injection/source-poisoning defenses for web-sourced evidence. AI LEGO's own `SECURITY_THREAT_MODEL.md` (Phase 2, STRIDE+LINDDUN, already drafted) has already analyzed the *general* form of exactly this threat at trust boundary TB-1 ("Untrusted External Content ↔ Policy/System Instructions", grounded in Execution Contract §35: "PDF/Web/Email/Upload/Tool Output is by default UNTRUSTED DATA") and flags it under T2/E4 ("prompt injection tampering the tool-call decision flow; if it is written into Knowledge Memory it becomes a permanently, falsely-trusted permission") as Medium-severity-single-shot / effectively-High-if-it-reaches-memory, with the residual risk explicitly recorded as unmitigated ("principle exists, no landing mechanism: no untrusted-span marking scheme, no answer to whether the marking survives being written into Knowledge Memory"). HCI's own planned public-intelligence "Continuous Monitoring" mode (06:256-263) is precisely a system that writes retrieved web content into a persistent, cited evidence store — i.e., it is precisely the scenario AI LEGO's own threat model calls out as the dangerous case. Two consequences: (1) HCI's threat model work should start from TB-1/T2/E4, not from zero, and should feed back into AI LEGO's residual-risk register rather than open a parallel, disconnected one; (2) AI LEGO's own threat model separately flags (I1, TB-5) that its shared Vector Index / Knowledge Graph has **no** cross-tenant isolation design yet — "even if ADR-003 is fully approved, this threat is only partially resolved — the RAG retrieval surface itself has not been designed" — which is a live blocker for any future embedding-based claim-similarity search HCI's public-intelligence layer would want (06's "Deduplication", "Cross-source Corroboration" steps are natural candidates for exactly this kind of vector search). This is not yet an HCI gap-analysis item (21) at all; it should be, as a P0.

## On evidence grading, method-contract machinery, and the "prompt registry" gap

05's method-contract fields (`method_id, version, category, evidence_grade, decision_weight...`, 05:194-209) map closely onto AI LEGO's already-built and already-validated `specs/cognitive/method.schema.yaml` (`id, version, family, cognitive_primitives, quality.{provenance_required, evidence_labeling_required}, risk_tier, forbidden_transition, rollback`). This is a case where I recommend HCI's method contracts literally extend AI LEGO's schema (adding `evidence_grade`, `allowed_scope` as HCI-specific additive fields, the same pattern `method.schema.yaml` itself uses for its own additive `risk_tier` field) rather than defining a structurally parallel-but-incompatible contract shape, for the same reasons as C1.

The absence of a real prompt-versioning/registry story is a genuine, mutually-acknowledged gap on both sides (C2) — this is not a case of AI LEGO having already solved it and HCI needing to catch up; neither side has built it. Given Invariant 5 explicitly requires versioning "prompts" (01:78) and Wave 11 (22) requires "scientific calibration" with "outcome labels," this is a real P0-adjacent gap that should be built exactly once, in `shared/platform`, consumed by both products, rather than allowed to bifurcate into `systems/hci30/ai/PROMPT_REGISTRY.md` and whatever AI LEGO eventually builds for its own `AnalysisRun` model-version gap.

## Summary judgment

V1's AI-facing philosophy — evidence before inference, human final authority, no universal score, confidence decomposed into separate axes, AI LEGO results pass through an HCI admission gate before becoming fact — is sound and, where I checked it against AI LEGO's actual, already-built machinery, independently corroborated rather than contradicted. The failure mode is not conceptual; it is boundary-drawing: V1 drew the HCI/AI-LEGO line correctly for domain-specific *methods* (05, 09's duplication list) but never checked its own domain model (07), decision model (04), and integration contract (10) against AI LEGO's already-shipped epistemic/authority/decision substrate, and as a result independently reinvented a materially similar but non-identical version of it under different names, with no forbidden-transition/promotion-redline machinery of its own. That is fixable at the V1→V2 boundary at low cost (a small kernel extraction plus contract tests) and expensive to fix later (bitemporal backfill across years of production evidence records, per 21's own P0-02). I recommend the human architect treat this as the single most important cross-cutting finding in this lens.


---

## Change Items (9)

### C1 — Extract a shared Epistemic/Provenance/Decision-Authority kernel instead of letting HCI re-derive it independently

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:48-76 defines HCI's own Fact/Observation/Interpretation/Hypothesis split; 04_HCI30_PRODUCT_SPEC.md:116-134 defines HCI's own decision-state enum and human-final-decision rule; 09/02's duplication-exclusion lists (09:104-125, 02:110-131) name Red Team/ACH/Premortem/root-cause/replay/handoff as things HCI must not rebuild, but never mention epistemic labeling, evidence-record shape, decision-record shape, or authority/locking semantics. |
| **Problem** | AI LEGO already has ACCEPTED, machine-validated schemas covering the same conceptual ground: an 11-value epistemic_type enum with promotion redlines, an authorship_state axis, a locked axis, and a Decision record requiring human_judgment/minority_opinions/reversal_conditions/lenses_applied. HCI's independently-invented Fact/Observation/Interpretation/Hypothesis model and decision-state enum are a different, non-cross-referenced encoding of the same distinctions, with no machine-checkable forbidden-transition rule of its own. |
| **Evidence** | agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml:37-63 (epistemic_type enum + promotion_redline forbidding UNKNOWN->SOURCE_FACT direct); specs/decision/decision.schema.yaml:256-475 (human_judgment_pending required, human_judgment 4 required fields, minority_opinions, reversal_conditions, lenses_applied); HCI_AI_LEGO_Blueprint_v1/07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:48-76; HCI_AI_LEGO_Blueprint_v1/04_HCI30_PRODUCT_SPEC.md:116-134; .ai/research/cross-review/CONVERGENCE_MATRIX.md:58 ('label/lock drift 毀 human-protection' flagged by AI LEGO's own authors as a top risk). |
| **Risk if unchanged** |  |
| **Alternative A** | Full duplication (current V1 path): HCI builds its own Fact/Observation/Interpretation/Hypothesis + evidence provenance + Decision object independently of AI LEGO. Pro: zero cross-team coordination, ships without any AI LEGO Wave dependency. Con: split-brain governance — two independently-versioned SSOTs for 'what is a fact', with no guarantee they agree when a case package crosses the integration contract (10); doubles the 30-year maintenance burden AI LEGO's own cross-review flags as a top risk category. |
| **Alternative B** | Extract a small versioned Epistemic/Provenance/Decision kernel into shared/platform, vendored (pinned, not live) by both products; each extends it with domain-specific fields. Preserves independent-operation invariant (kernel is a versioned contract, not a live dependency) while eliminating drift risk. This is the recommended option. |
| **Alternative C** | Keep V1's current full separation, but add a CI-enforced contract test (per 13's own 'architecture tests' pattern) asserting HCI's Fact/Observation/Interpretation/Hypothesis states have a documented, lossless mapping onto AI LEGO's epistemic_type enum, so drift is caught at build time rather than discovered in production. Cheapest option; does not eliminate duplication, only detects drift. |
| **Recommended** | Extract a small, versioned, vendor-neutral 'Epistemic & Decision-Authority Kernel' (epistemic_type/authorship_state/locked + minimal Evidence/Claim/Decision record shapes) into shared/platform or shared/contracts. HCI vendors/pins a specific version (satisfying the 'HCI works without AI LEGO' independence invariant, 10:13-27) and extends it with TrustDomain/Person/Relationship-specific fields; AI LEGO extends it with method/workflow-specific fields. Add a CI contract test asserting HCI's admission states map losslessly onto the kernel's epistemic_type enum. |
| **Why** | The System Constitution's own principles (Zero rework, Vendor-neutral core, Invariant 5 'version... prompts... policies', 01:17,71,78) argue against two independently-evolving 'what counts as a fact' state machines. Two independent teams working from different angles (HCI's product-safety angle, AI LEGO's execution-safety angle) each rediscovering the same primitive is convergent evidence the primitive is load-bearing shared infrastructure, not incidental overlap. |
| **Blast radius** | Touches HCI's core domain model (07), decision model (04), and the integration contract (10) — all P0/foundational documents per 21's own maturity ranking, so the earlier this is decided the cheaper it is. |
| **Migration impact** | If deferred past V1->V2, retrofitting requires reclassifying/backfilling every historical Evidence/Claim/Assessment record against a taxonomy that has already diverged in production, compounded by 21's P0-02 bitemporal requirement ('what did HCI know on date X' must still resolve correctly through the migration). |
| **Rollback** | Kernel extraction done early is additive and backward-compatible: define the shared enum as a superset of HCI's four current states with a translation table; nothing is removed, so no rollback path is needed if done before production data accumulates. |
| **30-year consequence** | Without extraction, by year 5-10 it becomes plausible that an AI LEGO cross-model run classifies content as HYPOTHESIS while HCI's independently-evolved pipeline classifies the same underlying claim as EVIDENCE or ACCEPTED for the same person, because two teams years apart maintained two unreconciled 'what is a fact' state machines — a direct false-allegation/defamation exposure, which is explicitly one of the underestimated-risk categories this review was asked to hunt for. |
| **Confidence** | High |
| **Requires human decision** | YES |

### C2 — Model/Prompt Registry and drift monitoring should be built once, shared — not separately by HCI

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21_HCI_TOP_TIER_GAP_ANALYSIS.md P2-02 (lines ~344-358) proposes systems/hci30/ai/{MODEL_REGISTRY.md, PROMPT_REGISTRY.md, EVAL_DATASET_STANDARD.md, RETRIEVAL_SECURITY.md, MODEL_CHANGE_GATE.md, DRIFT_MONITORING.md} as an HCI-owned deliverable. |
| **Problem** | AI LEGO's own research registers independently flag the identical gap for itself, with no cross-reference to HCI's plan or vice versa: two teams about to build the same capability twice, under different names, in different directories. |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/21_HCI_TOP_TIER_GAP_ANALYSIS.md P2-02 path list; agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/.ai/research/phase-1/GAP_REGISTER.yaml:320-323 ('AnalysisRun schema 無 model 版本欄位，無 model registry/drift 處理流程... 全文搜尋 model registry/model versioning/champion-challenger/concept drift/retrain 皆 0 命中'); docs/architecture/TEST_EVAL_STRATEGY.md:300 (same gap recorded against Master Plan §37 AnalysisRun). |
| **Risk if unchanged** | Two divergent model/prompt version-tracking systems, each with its own drift-detection thresholds, doubling audit burden and creating a real scenario where an enterprise customer asks 'which model version produced this HCI report' and the answer depends on which of two uncoordinated registries is queried. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Build ONE model/prompt registry + drift-monitoring component in shared/platform, consumed by both HCI and AI LEGO's AnalysisRun/method-execution paths, rather than allowing systems/hci30/ai/ and AI LEGO's own eventual fix for its GAP_REGISTER item to diverge. |
| **Why** | 01's Invariant 4 (no hidden vendor lock-in to a single LLM provider) and Invariant 5 (version prompts) both point at this being platform-level infrastructure, not product-specific; 17's shared/platform directory already exists as the natural home. |
| **Blast radius** | Affects only the P2-tier gap-analysis roadmap item and shared/platform layout; no core domain model impact, so low urgency to resolve immediately but should be flagged before either team starts building. |
| **Migration impact** | — |
| **Rollback** | Low risk either way — this is additive infrastructure with no existing production data to migrate. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### C3 — HCI's ad hoc LOW/MEDIUM/HIGH/CRITICAL cross-model gate table should map onto AI LEGO's already-accepted R0-R4 risk tier and mandatory-gates policy, not compete with it

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:161-176 defines a 4-level LOW/MEDIUM/HIGH/CRITICAL 'Cross-model gate by risk' ladder (single model / planner+verifier / independent cross-model review / model A+B+rule engine+human review). |
| **Problem** | AI LEGO already has an ACCEPTED 5-level R0-R4 risk-tier schema with concrete required actions per tier, and a grounded policy rule (risk_tier IN [R3,R4] -> REQUIRE_HUMAN_REVIEW) already validated against a JSON Schema validator. HCI's table does not reference or map onto it, creating two incompatible risk vocabularies exactly at the point where the two products integrate. |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:160-176; agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/risk-tier.schema.yaml:38-127 (R0-R4 with per-tier required_actions); policies/ai-execution/mandatory-gates.yaml grounded_rules (rule MGATE-R3-R4-HUMAN-REVIEW, risk_tier IN [R3,R4] -> REQUIRE_HUMAN_REVIEW). |
| **Risk if unchanged** | An HCI case marked 'HIGH' collaboration risk could silently map to an AI LEGO execution that AI LEGO's own policy considers R1 (no mandatory human review), or vice versa, defeating the cross-model gate's entire purpose. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Redefine 10's table as an explicit mapping FROM HCI's own domain-specific collaboration-risk classification (which legitimately differs from AI LEGO's code/infra execution-risk concept) ONTO AI LEGO's R0-R4 tier when a case package crosses the integration boundary, rather than as an independent second execution-risk taxonomy. |
| **Why** | Two different risk ladders at an integration boundary is exactly the 'contract vacuum' pattern AI LEGO's own cross-review flags as a top risk (filename/ID/label drift ruining replay and human-protection); reusing the accepted tier avoids introducing a third unreconciled vocabulary the way policies/ai-execution/ itself explicitly tries to avoid (see authority.yaml's own OQ-AUTHPOL-3 discussion of avoiding unreconciled parallel vocabularies). |
| **Blast radius** | Confined to the Integration Contract document (10) and its eventual OpenAPI/AsyncAPI implementation; does not touch HCI's core domain model. |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### C4 — Reuse AI LEGO's already-proven AGREE/PARTIAL_AGREEMENT/DISAGREE/REQUIRES_EVIDENCE/REQUIRES_HUMAN_DECISION taxonomy for 'Model Agreement' instead of inventing a new one, and resolve the CONVERGENCE_MATRIX naming collision

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102 introduces 'Model Agreement' as a percentage metric to be computed; 09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:86-96 names 'CONVERGENCE_MATRIX' as a core AI LEGO feature combining Model A + Model B outputs, governed only by the principle 'AGREE != FACT'. |
| **Problem** | AI LEGO already has a working, richer implementation of exactly this: a 6-value classification (AGREE / PARTIAL_AGREEMENT / DISAGREE / UNKNOWN / REQUIRES_EVIDENCE / REQUIRES_HUMAN_DECISION), proven in production use on the mother-document cross-review itself, with the identical governing principle stated more precisely ('AI consensus is not FACT — the ceiling of agreement is AGREE'). Separately, the literal term 'CONVERGENCE_MATRIX' is already in use in this same repository for a specific artifact (a one-time Claude x Codex documentation cross-review), which is a different meaning from the runtime API concept 09/10 describe — a naming collision risk for anyone reading both. |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:84-102; HCI_AI_LEGO_Blueprint_v1/09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:86-102; agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/.ai/research/cross-review/CONVERGENCE_MATRIX.md:1-9 (classification rules and the literal 'AI consensus ≠ FACT' quote); grep of the three AI LEGO mother documents found zero occurrences of 'AGREE'/'convergence' as a formalized runtime concept, meaning the blueprint's runtime claim is currently more aspirational than AI LEGO's own documents support, while the actual working precedent for the concept exists elsewhere in the same repo under a name that already means something else. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Adopt the richer 6-value classification (not a binary AGREE/DISAGREE or a percentage) as HCI's 'Model Agreement' concept in 19, and rename the runtime execution-result object 09/10 describe to avoid colliding with the existing CONVERGENCE_MATRIX.md artifact name (e.g. 'convergence_result' or 'model_agreement_classification'). |
| **Why** | A richer, already-battle-tested taxonomy is available for reuse at zero additional design cost, and it already distinguishes disagreement from insufficient evidence from a genuine human value call — precisely the nuance HCI's own 'MODEL DISAGREEMENT' UI pattern (19:47-60) needs and currently lacks. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### C5 — Publish an explicit, field-by-field deterministic / probabilistic / LLM-assisted / human-only decision policy

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md lists 'Confidence algorithm v1' (#3) and 'Permission model v1' (#6) and 'HCI Domain Policy machine-readable schema' (#7) as still-open; 01's Invariant 2 and 11's employment boundary state general principles but no field-level classification exists anywhere in the 24 documents. |
| **Problem** | Without an explicit, enumerated policy, individual engineers/AI agents implementing HCI will each make ad hoc calls about which fields an LLM may set directly, which is exactly the kind of silently-invented behavior 16's own closing line warns against ('When ambiguity appears, create an ADR rather than silently inventing behavior'). |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md open decisions #3,6,7; HCI_AI_LEGO_Blueprint_v1/01_SYSTEM_CONSTITUTION.md:39-56 (Invariant 2, general only); no field-level enumeration found anywhere in 00-23. |
| **Risk if unchanged** | Individual implementers each guess where the deterministic/probabilistic/human-only line falls, producing inconsistent safety behavior across modules built at different times by different teams or AI agents — precisely the 'silently invented behavior' 16 itself warns against. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add this as the concrete content of open decision #7 (HCI Domain Policy), enumerating per-field/per-transition classification into: MUST-be-deterministic (identity MATCH_CONFIRMED for RESTRICTED subjects, evidence admission-state transitions, retention/deletion enforcement, protected-attribute filtering, all locked-record writes), MAY-be-probabilistic (source-quality grading, confidence scores kept separate per 19), MAY-be-LLM-assisted-with-human-review-flag (synthesis, hypothesis generation, AI LEGO cognitive-method outputs), MUST-NEVER-be-LLM-alone (final PROCEED/PAUSE/EXIT decision, any employment-adjacent output, UNKNOWN/HYPOTHESIS->SOURCE_FACT promotion, any locked-record write). Reuse AI LEGO's A0-A4/R0-R4 machinery to enforce this rather than inventing a parallel gating mechanism. |
| **Why** | This is exactly the kind of enforceable-not-advisory safety rule 21's P0-05 already calls for ('safety is enforceable, not advisory prose') but currently has no concrete content. |
| **Blast radius** | Affects every HCI intelligence/public-intelligence/decision module; foundational, should land before Wave 5 (Intelligence math v1) per 22's own dependency order. |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | YES |

### C6 — Identity-resolution MATCH_CONFIRMED procedure and threshold ownership is undefined — this is the largest real-world liability surface in the product

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 06_HCI30_PUBLIC_INTELLIGENCE.md:47-76 defines identity states (MATCH_CONFIRMED, MATCH_HIGH_CONFIDENCE, MATCH_POSSIBLE, MATCH_AMBIGUOUS, MATCH_REJECTED) and says 'Ambiguous identity must not enter formal evidence' but never specifies WHO or WHAT decides a match is CONFIRMED, or with what threshold; 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md #9 lists 'Identity-resolution thresholds' as still open. |
| **Problem** | A false-positive person match — attaching a stranger's disputes, legal matters, or criticism to the wrong real individual who happens to share a name/employer/location — is the single most direct path from this product to a defamation claim or a materially wrong high-impact collaboration decision, and the review brief explicitly asked me to hunt for underestimated risks in exactly this category (identity resolution errors, false allegations). |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/06_HCI30_PUBLIC_INTELLIGENCE.md:47-78; HCI_AI_LEGO_Blueprint_v1/16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md open decision #9; no procedure/threshold-owner language found anywhere in 00-23. |
| **Risk if unchanged** | A real person is defamed by evidence that actually belongs to a different person with a similar name/profile; this is not a hypothetical failure mode for OSINT-style tools, it is a well-documented recurring one in the field, and 06 currently has no machine-enforced defense against it. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Mandate that MATCH_CONFIRMED for any RESTRICTED-classified subject requires EITHER a deterministic unique-identifier match (verified email, employer-issued ID, official registry number) OR explicit human confirmation with the specific corroborating fields shown — never an LLM's self-reported similarity/confidence score alone, regardless of how high. Encode this as a hard admission gate (deterministic, per C5), not a prompt instruction. |
| **Why** | This is the single highest-severity, most underestimated risk surfaced in this review: it directly produces the 'false allegations against the wrong person' failure mode the review brief calls out by name, and it is currently an open decision with no default behavior specified, meaning the current implicit default is whatever an implementer's judgment supplies. |
| **Blast radius** | Public Intelligence module (06), all downstream Evidence/Claim admission (07), and by extension every formal report (19) — a foundational, P0-adjacent gate. |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | An identity-resolution false positive that becomes a locked, cited HCI Evidence record about the wrong person is exactly the kind of error the bitemporal/immutable-history design (21 P0-02, 01 Invariant 6) makes durable and hard to fully erase — the correction-lineage machinery must exist BEFORE the first false match happens, not be retrofitted after. |
| **Confidence** | High |
| **Requires human decision** | YES |

### C7 — Build HCI's Public Intelligence threat model as a consumer of AI LEGO's already-drafted untrusted-content trust boundary, not from zero

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21_HCI_TOP_TIER_GAP_ANALYSIS.md Wave 6 (P0-08) plans TM_PUBLIC_INTELLIGENCE.md and TM_AI_ANALYSIS.md as new, HCI-authored threat models covering SSRF, prompt injection, source poisoning, synthetic evidence. |
| **Problem** | AI LEGO already has a drafted STRIDE+LINDDUN threat model that analyzes the general form of this exact threat — 'Untrusted External Content <-> Policy/System Instructions' — and records it as an unresolved, still-open residual risk ('principle exists, no landing mechanism defined; unclear whether the untrusted marking survives being written into persistent memory'). |
| **Evidence** | agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SECURITY_THREAT_MODEL.md:86 (TB-1), :105 (T2), :118 (E4) citing Execution Contract §35 'Policy/System Instructions is UNTRUSTED DATA by default'; HCI_AI_LEGO_Blueprint_v1/21_HCI_TOP_TIER_GAP_ANALYSIS.md P0-08. |
| **Risk if unchanged** | Two independently-scoped threat models for the same underlying trust boundary, likely with inconsistent mitigations, in a domain (untrusted web content feeding AI decisions) where inconsistency directly enables the exact prompt-injection/source-poisoning attacks both models exist to prevent. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | HCI's TM_PUBLIC_INTELLIGENCE.md/TM_AI_ANALYSIS.md should explicitly build on TB-1/T2/E4 as the general case and feed HCI-specific findings back into AI LEGO's own residual-risk register, rather than independently re-deriving SSRF/prompt-injection defenses in isolation; HCI's public-intelligence retrieval should consume a shared 'research.web.search' capability (already envisioned generically in 18:129-130) that inherits this contract. |
| **Why** | HCI's own planned 'Continuous Monitoring' research mode (06:256-263) is precisely the dangerous scenario AI LEGO's threat model already flags — content retrieved from the untrusted web being written into a persistent, cited store — so building the threat model twice, independently, wastes effort on a problem that already has a documented starting analysis. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### C8 — Vector/embedding index tenant isolation for future RAG-based public-intelligence retrieval is an unaddressed P0 gap

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md's architecture tests (22-31) only test row-level tenant_id/RLS isolation; 21's gap analysis does not mention vector/embedding index isolation anywhere. |
| **Problem** | HCI's Public Intelligence pipeline's 'Deduplication' and 'Cross-source Corroboration' steps (06:15-46) are natural candidates for embedding-based similarity search, and AI LEGO's own threat model already flags this exact gap as unresolved for itself: shared Vector Index / Knowledge Graph has no tenant-isolation design, and this is explicitly called out as only partially fixed even if the current tenant-isolation ADR is fully approved. |
| **Evidence** | agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SECURITY_THREAT_MODEL.md:90,109 (TB-5, I1: 'multi-tenant RAG retrieval scope misconfigured -> Tenant A's query may retrieve Tenant B's confidential fragment... even if ADR-003 is fully approved, this threat is only partially resolved -- the RAG retrieval surface itself has not been designed'); HCI_AI_LEGO_Blueprint_v1/13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:22-31 (row-level tests only); HCI_AI_LEGO_Blueprint_v1/21_HCI_TOP_TIER_GAP_ANALYSIS.md (no matching P0 item). |
| **Risk if unchanged** | A future HCI feature (semantic dedup/corroboration across public-intelligence sources) ships on top of a shared vector index with row-level-only isolation, silently leaking one tenant's confidential research into another tenant's similarity-search results — a severe, hard-to-detect cross-tenant confidentiality breach. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a P0 item to 21's gap analysis: no embedding/vector-index-based retrieval or claim-similarity search may be built for HCI's public-intelligence layer until tenant isolation at the vector-index layer has an approved design, not just row-level RLS. |
| **Why** | This is a genuinely underestimated risk of exactly the kind the review brief asked me to actively hunt for (cross-tenant confidential data leakage via a component neither document currently tracks), and AI LEGO's own security work already independently confirms it is real and currently unmitigated. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### C9 — Enforce the self-reflection -> trust-domain prohibition machine-readably, using AI LEGO's already-proven forbidden_transition pattern

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 05_HCI30_INTELLIGENCE_METHODS.md:174-190 states in prose that self-reflection frameworks (MBTI, Enneagram, 紫微, 八字) are 'Forbidden: enterprise trust scoring, automatic risk decisions, protected-class inference' with no enforcement mechanism specified. |
| **Problem** | A prose prohibition has no way to prevent a future engineer or AI agent from accidentally wiring a self-reflection-derived field into a TrustDomain calculation months or years later, especially once method contracts multiply across editions/verticals (08). |
| **Evidence** | HCI_AI_LEGO_Blueprint_v1/05_HCI30_INTELLIGENCE_METHODS.md:174-190; agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/method.schema.yaml:313-327 (forbidden_transition field, already schema-validated, e.g. 'CauseHypothesisSet -> FinalCausalFact'); specs/governance/epistemic-label.schema.yaml:57-69 (promotion_redline, the identical pattern applied to epistemic promotion). |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Require every HCI self-reflection Method Contract to declare a machine-checkable forbidden_transition entry (e.g. 'SelfReflectionResult -> TrustDomainScore'), using the identical field AI LEGO's method.schema.yaml already implements and validates, rather than relying on documentation alone. |
| **Why** | This is a low-cost reuse of an already-proven mechanism that converts a currently-unenforceable policy into an enforceable one, directly satisfying 21's own P0-05 standard ('safety is enforceable, not advisory prose'). |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

---

## Open Assumptions Flagged by This Reviewer

- The AI LEGO specs/*.yaml files I read (evidence.schema.yaml, claim.schema.yaml, epistemic-label.schema.yaml, decision.schema.yaml, risk-tier.schema.yaml, method.schema.yaml, authority.yaml, mandatory-gates.yaml) are accurately described by their own 'status: ACTIVE' / 'decided_by: ADR-00X ACCEPTED' headers as currently accepted, not merely drafted-and-pending; I did not independently verify ADR acceptance status beyond what each schema file's own header claims.
- I assumed the HCI-30 blueprint authors had not seen the AI LEGO specs/ directory's current state when writing 07/09/10/16/19/21, based on the complete absence of any cross-reference between the two document sets; if they had in fact reviewed it and consciously chose independence, the recommendation in C1 would need to weigh that explicit prior decision rather than treat the overlap as an oversight.
- I treated the Claude x Codex CONVERGENCE_MATRIX.md cross-review artifact as evidence that the AGREE/PARTIAL_AGREEMENT/DISAGREE taxonomy works in practice; this was proven for a documentation cross-review use case, not yet for a runtime multi-model HCI person-assessment use case, so some adaptation risk in C4's recommendation remains unverified.
- No code implementation of either HCI-30 or AI LEGO's runtime systems exists yet (confirmed via SECURITY_THREAT_MODEL.md:21, 'three mother documents currently have no code, no API, no deployment'), so all findings in this review are architecture-document-level, not implementation-verified.

---

## Open Risks Flagged by This Reviewer

- Identity-resolution false-positive matching (C6) is, in my assessment, the highest-severity unresolved risk in the entire HCI-30 product concept and currently has no default enforced behavior — this should be escalated for explicit human decision before any Wave 4 (Public Intelligence) implementation begins.
- If C1 (shared epistemic/decision kernel) is not decided before HCI's domain model (Wave 1, per 22) and AI LEGO's own specs/ Wave-3+ work both continue independently, the cost of reconciling them grows every week both teams keep building on their current independent tracks.
- AI LEGO's own threat model records real, currently-unmitigated risks (TB-1 prompt injection into persistent memory, I1 shared vector index cross-tenant leakage, TB-2/S2 approval-session spoofing with no identity-strength requirement) that any future HCI integration will inherit as-is; these are AI LEGO-side risks outside this review's direct scope but materially affect HCI's own risk posture the moment the integration contract (10) goes live, and should be tracked jointly.
- Neither document set specifies who owns model/prompt version governance organizationally (C2) — this is a coordination risk independent of the technical architecture question, and left unresolved it will likely resolve itself by whichever team ships first, not by deliberate design.
