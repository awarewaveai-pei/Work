# 09 — AI LEGO Cognitive Engineering OS Boundary

## Product identity

AI LEGO is a general cognitive engineering operating system with: human final decision, replaceable AI engines, evidence-centric execution, reproducible computation, LEGO-style workflows, 30-year target life.

## Existing mother documents

### Global Master Plan
Owns: Product, Architecture, Security, Data, Global jurisdiction, Governance.

### Cognitive Method Atlas
Owns: 289 cognitive methods/tools, method contracts, method selection rules, quality gates. Examples: brainstorming, root cause, red team, decision matrix.

### Execution Contract
Owns: AI execution lifecycle, authority, change control, handoff protocol.

## Core features

### Scoped Authority conflict chain

```text
Law
→ Security / Privacy
→ Machine-readable Contract
→ ADR
→ Master Plan / Atlas
→ Recipe
```

For HCI integration, add HCI Domain Policy before Recipe where relevant.

### Method Atlas

AI does not choose methods by memory alone. Each method has a contract and gate.

### Evidence / Replay / Rollback

Each execution preserves: Method Atlas version/hash, workflow version, model details, relevant policy versions.

**Changed in V2 — replay has a defined failure state**: `REPLAY_UNAVAILABLE` is a distinct terminal state from a successful replay, used when the referenced AI model has since been retired or deprecated by the vendor — preserving a reference to a model is not the same as being able to reproduce its output, and model retirement on 12-24 month vendor cycles is a certainty over this system's stated 30-year horizon, not an edge case. The existing "never silently substitute forbidden models" rule (already correctly stated for live execution) is explicitly restated as applying to replay as well — a historical decision must never be silently reinterpreted by a different model than the one that actually produced it. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-12.

### Global jurisdiction

Handles: cross-border data protection, AI regulation, sanctions/trade constraints, localization, jurisdiction conflicts.

> 🔴 **DECISION PENDING (`HD-17`, no urgency — decide when convenient)** — this module is delegated cross-border/sanctions/jurisdiction handling, but `02_PRODUCT_BOUNDARIES.md` simultaneously forbids AI LEGO from owning HCI Person/Relationship data — leaving the data that would actually need sanctions screening (a Person under HCI research who turns out to be a sanctioned individual or entity) inside HCI, unscreened, with no chapter assigning ownership of this seam. This is a real, if narrow, regulatory exposure with no assigned owner. No forced recommendation — one direction worth weighing: a lightweight sanctions/watchlist screening step owned by HCI itself, inside `06_HCI30_PUBLIC_INTELLIGENCE.md`'s identity-resolution stage for Deep Due Diligence modes specifically, independent of this jurisdiction module. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-17, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-15.

### Cross-model validation

Example: Model A planning + Model B independent read-only review + `CONVERGENCE_MATRIX`.

Critical invariant:

```text
AGREE != FACT
```

**KEEP, confirmed as genuinely well-designed**: this invariant is unusually alert to the danger of mistaking model agreement for evidence quality, and correctly keeps "Model Agreement" and "Evidence Confidence" as separate displayed numbers (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`). The one gap — Model Agreement not being wired to source-independence — is closed in `06_HCI30_PUBLIC_INTELLIGENCE.md` §Source Independence (RT-11).

## Shared Kernel *(new section in V2 — resolves the independence-verdict qualification from `02_PRODUCT_BOUNDARIES.md`)*

> 🔴 **DECISION PENDING (`HD-09`)** — this is the central "should HCI-30 and AI LEGO share anything" question. The independence-verdict synthesis concluded the top-level domain split should stay independent while this specific Foundation-layer primitive should not — but that conclusion is a scoped judgment call the operator should ratify explicitly, given how many downstream chapters in this document (`02`, `07`, `10`, `17`, `18`) already assume one answer or the other. **Recommended (below)**: extract; **Alternative**: accept duplicate, independently-evolving governance for the concepts below (full duplication, V1's original path — zero cross-team coordination cost, but a split-brain SSOT for "what is a fact" that doubles the 30-year maintenance burden AI LEGO's own cross-review already flags as a top risk category). A lighter middle option also exists: keep full separation but add a CI-enforced contract test asserting HCI's states map losslessly onto AI LEGO's `epistemic_type` enum, catching drift without eliminating duplication. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-09.

HCI-30 and AI LEGO remain independent peer products at the domain layer regardless of this decision (confirmed, `02_PRODUCT_BOUNDARIES.md`) — what's pending is only whether the following becomes a small, versioned, vendor-neutral Foundation-layer kernel, **vendored/pinned** (not run as a live shared service) by both products:

```text
1. Canonical thin-reference types (EntityRef, PersonRef, OrganizationRef,
   EvidenceRef, TenantContext, ActorRef, SourceRef) — see 18_LEGO_CONTRACT_
   AND_COMPONENT_TAXONOMY.md, which already specified this exact mechanism
   but it was never actually built; AI LEGO's evidence.schema.yaml is
   currently a full record, not the stub this was meant to be.
2. Epistemic status / provenance labeling (fact vs. assumption vs.
   AI-inference vs. human-opinion) — reuse AI LEGO's ACCEPTED, ADR-004-
   governed 11-value epistemic_type enum with promotion redlines, rather
   than HCI's own half-built 4-level Fact/Observation/Interpretation/
   Hypothesis ladder (07 §Fact Model).
3. Risk-tier / human-authority gating ladder — reuse AI LEGO's already-
   accepted R0-R4 risk tier and mandatory-gates.yaml policy-as-code,
   rather than the ad hoc LOW/MEDIUM/HIGH/CRITICAL table in 10 §Cross-
   Model Gate.
4. Tenant / entitlement / billing substrate — explicitly Foundation LEGO
   per 18's own taxonomy; ADR-0009 adopts AI LEGO ADR-003 Tenant as the
   platform primitive, while portal code remains an adapter with an open
   mapping/migration/negative-test gate.
```

**Why "vendored/pinned, not live"**: this preserves "HCI works without AI LEGO" and "AI LEGO works without HCI" (§Independence Requirement, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`) by construction — each product depends on a specific version of the kernel's contract, not on the other product's runtime being reachable. This is explicitly **not** a "Shared God Platform": it is the same small, deliberately-scoped reference layer `18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md` already specified, actually built this time, plus three genuinely load-bearing extractions that the independent review found each product had begun independently re-deriving. Everything else — Person/Relationship/TrustDomain domain logic, Method/Workflow/ExecutionRun orchestration logic, the two Evidence *ledgers themselves* (only their shape vocabulary is shared, not their storage or ownership) — stays fully separate.

Extract this kernel into `shared/platform` or `shared/contracts` (`17_REPOSITORY_LAYOUT_AND_PATHS.md`) **before** the Wave-1 HCI domain-model freeze and before further independent spec work accumulates on the AI LEGO side — the reconciliation cost grows every week both tracks continue independently, and this is currently the cheapest it will ever be. Full reasoning: `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C1, C2, C3, C4, `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-01/02/03, and the independence-verdict synthesis referenced in `02_PRODUCT_BOUNDARIES.md`.

## Model / Prompt Registry *(new note in V2)*

Build **one** shared model/prompt registry + drift-monitoring component, consumed by both HCI and AI LEGO's execution paths — not two independently-built versions. AI LEGO's own gap register already flags this as an unresolved gap for itself with no cross-reference to HCI's parallel plan (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P2-02). Low urgency (no core domain-model impact), but should be decided before either team starts building the registry independently. Full reasoning: `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C2.

## AI LEGO must not own

HCI Person records, HCI relationships, HCI trust scores, HCI public claims, HCI cooperation decisions.

## HCI must not duplicate

Where AI LEGO already provides a general capability, HCI should integrate rather than reimplement: Red Team, ACH, Premortem, generic Decision Matrix, generic Root Cause, workflow replay, cross-model convergence, generic handoff, model routing, method selection framework, **and (new in V2) forbidden-transition enforcement for the self-reflection → formal-trust-domain boundary** — AI LEGO's already-proven `forbidden_transition` pattern should enforce the prohibition in `05_HCI30_INTELLIGENCE_METHODS.md` (self-reflection frameworks must never feed formal enterprise trust scoring) machine-readably, converting a currently-unenforceable policy sentence into an enforced gate — directly satisfying `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-05's own standard ("safety is enforceable, not advisory prose"). Full reasoning: `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C9.
