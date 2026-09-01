# 10 — HCI-30 × AI LEGO Integration Contract

## Principle

Optional integration between independent peer systems.

```text
HCI-30 <---- contract/API/event ----> AI LEGO Cognitive Engineering OS
```

Neither product is a submodule of the other.

## Independence requirement

HCI must remain able to: create/edit persons, create relationships, record interactions, admit evidence, view timelines, create manual assessments, create decisions, view historical data — when AI LEGO is unavailable.

AI LEGO must remain fully usable for non-HCI cognitive work.

## Allowed integration use cases

HCI may request: deep partner analysis, ACH, Red Team, Premortem, Stakeholder Analysis, Decision Matrix, independent cross-model review, structured alternative-explanation generation.

## Request package

HCI should send a bounded case package, not raw DB access.

```text
case_id                     -- now backed by the Case aggregate, see 07 §Case Aggregate
tenant_context               -- now cryptographically verified, see §Usage Metering below
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

AI LEGO returns: `execution_run_id`, `methods_used`, `method_versions`, `model_runs`, `convergence_summary`, `analysis_candidates`, `alternative_hypotheses`, `contradictions`, `uncertainties`, `human_review_flags`, `replay_reference`.

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
Answers: why do we believe something about the person or collaboration?

### AI LEGO Execution Evidence
Answers: how did the cognitive run produce this result?

Do not merge these semantics. HCI assessment may store references to AI LEGO run IDs.

**Enforcement note (new in V2)**: this boundary is not yet tamper-evident in schema — AI LEGO's `evidence.schema.yaml`/`claim.schema.yaml` are full records under the same bare names HCI uses for its own domain entities. Cross this boundary only via the `EvidenceRef` thin reference from the Shared Kernel (`09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel), never a full record, so "Evidence" cannot silently mean two different, differently-owned things depending on which side of the adapter you're standing on.

## Integration API contract

Recommended high-level endpoint style:

```text
POST /cognitive/v1/workflows/execute
GET  /cognitive/v1/runs/{run_id}
POST /cognitive/v1/runs/{run_id}/review
```

HCI-specific integration layer: `Projects/internal/hci30/integrations/cognitive-os/` — contains only adapter, request mapper, result mapper, policy mapper, events, contract tests. Must not contain HCI core logic or Cognitive OS core logic.

## Transport — decided in V2

**Changed in V2 — sync request + async callback, made explicit**: V1 left the transport implicit (the endpoint list above actually already shows this shape — a submit endpoint plus a poll/webhook endpoint — without naming it as a deliberate choice). This is now explicit: submit → `202 Accepted` → `cognitive.run.completed` webhook or poll `GET /cognitive/v1/runs/{run_id}`. **Pure synchronous REST is rejected as the sole transport** (cross-model/CRITICAL-risk runs can legitimately take minutes; blocking HTTP couples HCI's own request-thread availability to AI LEGO's completion time, violating the Independence Requirement above). **Full event-driven (message bus) is deferred**, not adopted — it requires standing up a broker that doesn't exist anywhere in the current infrastructure, and the broker itself becomes a new shared-fate dependency with no HA on the verified single-box baseline; revisit only if genuine multi-consumer fan-out becomes real. See `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §3b for the full 3-option comparison. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-12.

## Events

Possible HCI events: `hci.person.created`, `hci.evidence.admitted`, `hci.assessment.requested`, `hci.decision.requested`.

Possible Cognitive events: `cognitive.run.started`, `cognitive.run.completed`, `cognitive.run.failed`, `cognitive.human_review_required`, `cognitive.convergence.completed`.

## Cross-model gate by risk

**Changed in V2 — reuses AI LEGO's existing risk-tier ladder rather than a competing one**: V1's freshly-invented LOW/MEDIUM/HIGH/CRITICAL table is replaced by a direct reference to AI LEGO's already-ACCEPTED R0-R4 risk tier and `mandatory-gates.yaml` policy-as-code (see `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel). Two risk ladders at this exact integration boundary is the "contract vacuum" pattern AI LEGO's own cross-review already flags as a top risk category (filename/ID/label drift breaking replay). Full reasoning: `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C3.

**Additional gate requirement (new in V2)**: V1's `LOW` tier definition ("single model + deterministic checks") had no human-review requirement and no definition anywhere of what "deterministic checks" means. A hallucinated claim generated during a nominally-LOW-risk request could enter the evidence base unreviewed and later silently contribute to a HIGH-risk decision, because only newly-added evidence gets reviewed at a case's *current* risk tier, not its eventual one. Require at minimum a lightweight human spot-check for any AI-generated claim before it can be admitted as an Assessment Candidate regardless of case risk tier, plus a periodic re-audit of accumulated LOW-risk-cleared claims when a case's risk tier is later elevated. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-09.

> 🔴 **DECISION PENDING (`HD-08`)** — without an explicit, ratified, field-by-field policy, individual implementers will each make ad hoc calls about which fields an LLM may set directly — exactly what `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`'s own closing line warns against ("create an ADR rather than silently inventing behavior"). **Recommended enumeration** (adapted from the AI/Intelligence reviewer's proposal, reusing AI LEGO's A0-A4/R0-R4 gating machinery rather than a parallel one):
>
> ```text
> MUST be deterministic:       identity MATCH_CONFIRMED for RESTRICTED subjects (see 06),
>                               evidence admission-state transitions, retention/deletion
>                               enforcement, protected-attribute filtering, all locked-
>                               record writes
> MAY be probabilistic:        source-quality grading, confidence scores (kept separate
>                               per 19)
> MAY be LLM-assisted +
>   human-review flag:         synthesis, hypothesis generation, AI LEGO cognitive-
>                               method outputs
> MUST NEVER be LLM alone:     final PROCEED/PAUSE/EXIT decision, any employment-adjacent
>                               output, UNKNOWN/HYPOTHESIS -> SOURCE_FACT promotion, any
>                               locked-record write
> ```
>
> Ratify this enumeration (adjust as needed) before Wave 0 closes — it is referenced as already-adopted policy throughout `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-05, so downstream chapters assume an answer here. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-08, `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C5.

## Confidence separation

HCI should display separately: Evidence Confidence, Model Agreement, Method Robustness, Decision Confidence. Do not collapse them into one number.

**Changed in V2 — reuses AI LEGO's existing agreement taxonomy**: reuse AI LEGO's already-proven `AGREE`/`PARTIAL_AGREEMENT`/`DISAGREE`/`REQUIRES_EVIDENCE`/`REQUIRES_HUMAN_DECISION` taxonomy for "Model Agreement" instead of inventing a new one — it already distinguishes genuine disagreement from insufficient evidence from a case requiring human adjudication, at zero additional design cost. Full reasoning: `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C4. See also `06_HCI30_PUBLIC_INTELLIGENCE.md` §Source Independence for wiring source-independence into this metric.

## Usage Metering *(new section in V2)*

> 🔴 **DECISION PENDING (`HD-22`)** — should each Cognitive OS execution invoked on behalf of an HCI tenant be metered and billed against that tenant's own verified Cognitive OS subscription/entitlement, verified via a signed/authenticated tenant credential rather than a trusted-by-convention `tenant_context` string? **Recommended: yes** — this is cheap now (one contract clause) and forecloses a foreseeable commercial-independence leak later: without it, HCI customers who don't also subscribe to Cognitive OS would get free/unmetered usage riding on someone else's plan, and the two products' otherwise-clean domain separation would develop a commercial coupling through the billing layer by default. The alternative — deciding AI LEGO calls are simply included free in any HCI paid tier — is a legitimate choice too, but forecloses AI LEGO's independent monetization and should only be chosen deliberately. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-22, `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md` G-04, `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §AI LEGO Usage Metering.

## Compatibility

Integration contracts should declare versions:

```text
HCI 2.7
requires:
Cognitive Runtime >= 5.1 < 6
Method Atlas >= 3.4
Execution Contract v4
```

Deployment should fail closed if incompatible.
