# Search & Content Intelligence Domain Architecture

**Status:** PROPOSED — COMPREHENSIVE MASTER REVISION (v3)；**規範性版本**見 `docs/adr/ADR-021-search-content-boundary-and-ownership.md`（ACCEPTED 2026-09-02）與同目錄 11 份規格文件；本文件為敘事正本，已知修正見文末「Errata（2026-09-02）」附錄  
**Architecture Review Baseline:** `awarewaveai-pei/Work@4b26e83612caad72698271545ee1952058cc32dd`  
**Revision Basis:** Full critical review against AI-LEGO specs / ADRs + complete domain operating architecture  
**Document Type:** Domain / Vertical Architecture  
**Target Platform:** AI LEGO Cognitive Engineering OS  
**Primary Domain:** SEO / GEO / AEO / LLMO / Entity SEO / Local SEO / SXO / CRO / ASO / Content Strategy  
**Purpose:** Serve as the master architecture and operating blueprint for the Search & Content Intelligence vertical: define platform reuse, domain ownership, end-to-end execution methods, quality gates, publishing, measurement, and learning without creating parallel AI-LEGO core systems.

**Master Document Rule:** This document is the conceptual SSOT for the complete Search & Content vertical. Child specs may deepen machine-readable contracts, provider adapters, tests, and implementation details, but MUST NOT be required to fill a missing core domain workflow that should have been defined here.

---

# 1. Executive Summary

This document defines a **Search & Content Intelligence OS** as a vertical application built on top of the **AI LEGO Cognitive Engineering OS**.

The intended relationship is:

```text
Agency OS
│
├── AI LEGO Cognitive Engineering OS
│   ├── Knowledge / Evidence / Provenance
│   ├── Cognitive Methods
│   ├── Workflow / Execution
│   ├── Trusted Compute
│   ├── Governance / Policy
│   ├── Audit / Replay / Rollback
│   └── Artifact / Human Review
│
└── Search & Content Intelligence OS
    ├── Search Intelligence
    ├── Content Strategy
    ├── Content Brief
    ├── Content Production
    ├── Content QA
    ├── Publishing
    └── Measurement / Optimization
```

The Search & Content Intelligence OS **must not create a second RAG system, second evidence model, second workflow runtime, or second artifact system**.

Instead, it extends AI LEGO with domain-specific semantics for:

- SEO
- GEO
- AEO
- LLMO
- Entity SEO
- Local SEO
- SXO
- CRO
- ASO
- Content Strategy
- Search Intelligence
- AI visibility
- Content publishing
- Content performance feedback

The core principle is:

> **AI LEGO provides the horizontal platform / contract substrate and target execution runtime. Search & Content Intelligence provides the vertical domain logic.**  <!-- Errata E-01 (SCV3-M-01) -->

---

# 2. Architectural Positioning

## 2.1 AI LEGO is the Horizontal Platform

AI LEGO should remain responsible for reusable platform primitives:

```text
Source
Evidence
Claim
Knowledge
Entity
Relation
Artifact
Workflow
Execution
Policy
Decision
Experiment
Outcome
HumanContribution
Annotation
```

It should also continue to own:

- Ingestion
- Normalization
- Provenance
- Citation traceability
- Retrieval
- Vector search
- Graph relationships
- Workflow IR
- Capability execution
- Method execution
- Model routing
- Human approval
- Quality gates
- Audit
- Versioning
- Replay
- Rollback
- Security
- Privacy
- Jurisdiction
- Policy
- Trusted compute

---

## 2.2 Search & Content Intelligence is a Vertical

The Search & Content vertical should own domain-specific concepts such as:

```text
Search Query
Search Surface
SERP Snapshot
AI Answer Snapshot
Search Observation
Topic Cluster
Content Brief
Content Publication
Content Performance
Refresh Context / Decision
```

Its responsibilities are:

```text
Research what users search
↓
Understand search / AI-answer environments
↓
Determine what content should exist
↓
Build evidence-grounded briefs
↓
Generate and review content
↓
Publish safely
↓
Measure search / AI visibility / conversion
↓
Learn and refresh
```

---

# 3. System Boundary

## 3.1 Reuse from AI LEGO

The following MUST be reused rather than rebuilt.

| Capability / Object | Owner |
|---|---|
| Source | AI LEGO Core — canonical concept; machine-readable record contract is a baseline dependency |
| Evidence | AI LEGO Core |
| Claim | AI LEGO Core |
| Entity | AI LEGO Core |
| Knowledge | AI LEGO Knowledge Engine |
| Provenance | AI LEGO Knowledge Engine |
| Artifact | AI LEGO Core — canonical concept; machine-readable record contract is a baseline dependency |
| Workflow | AI LEGO Platform |
| Execution | AI LEGO Platform |
| Policy | AI LEGO Platform |
| Human Review | AI LEGO Platform |
| Experiment | AI LEGO / Compute — reuse target; machine-readable contract maturity must be verified before implementation |
| Outcome | AI LEGO Core — reuse target; machine-readable contract maturity must be verified before implementation |
| Vector Retrieval | AI LEGO Knowledge Engine |
| Graph Retrieval | AI LEGO Knowledge Engine |
| Full-text Retrieval | AI LEGO Knowledge Engine |
| Audit | AI LEGO Platform |
| Versioning | AI LEGO Platform |
| Replay / Rollback | AI LEGO Platform |
| Model Routing | AI LEGO AI Gateway |
| Trusted Compute | AI LEGO Compute Plane |

---

## 3.2 New Search / Content Vertical Responsibilities

The following should be added as domain-specific components.

```text
Search & Content Domain Pack
Search-domain Authority / Freshness Policy
Search Intelligence
Content Strategy Engine
Content Brief Engine
SEO / GEO Quality Gates
Publishing Adapters
Search / AI Visibility Measurement
Content Learning / Refresh Loop
```

## 3.3 Baseline Maturity Rule

This architecture distinguishes between a concept being defined and a runtime being available.

Every AI-LEGO dependency MUST be labeled using one of the following maturity states before implementation:

```text
NARRATIVE_DEFINED
ACTIVE_SCHEMA
ACTIVE_POLICY
CONTRACT_INSTANCE_AVAILABLE
VALIDATED_RECIPE_AVAILABLE
RUNTIME_IMPLEMENTED
ADAPTER_IMPLEMENTED
E2E_VERIFIED
```

At the review baseline, Evidence, Claim, Evidence Graph, Sentence Provenance, Decision, Workflow IR, Event Ledger, Gate, Authority, Method schema, Recipe schema, Capability Contract schema, and Repository Contract have machine-readable definitions.

However, the canonical Source record and canonical Artifact record are architectural dependencies whose machine-readable record contracts are not yet available at this baseline. SearchContent MUST NOT fill those core gaps by creating competing vertical-owned Source or Artifact models.

## 3.4 Mandatory Integration Rule

```text
Architecture-defined ≠ Schema-defined ≠ Runtime-implemented.
```

SearchContent documentation MUST NOT describe a proposed Method, Capability, Recipe, adapter, or policy as an existing runtime ability until the corresponding AI-LEGO contract / registry / implementation state exists.

---

# 4. Core Design Principles

## 4.1 No Parallel Knowledge Base

Forbidden architecture:

```text
AI LEGO Knowledge
+
SEO Knowledge DB
+
GEO Vector DB
+
Brand RAG
+
Content RAG
```

Preferred architecture:

```text
                 AI LEGO Knowledge Engine
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
Official Sources    Industry Research   Brand Knowledge
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ↓
                  Evidence Graph
                         ↓
                Domain Retrieval Policies
```

Different domains may use different retrieval policies, but they MUST share the same canonical knowledge/evidence substrate.

---

## 4.2 Evidence Before Generation

Content generation should never be the first step.

Correct sequence:

```text
Topic / Business Goal
↓
Research
↓
Evidence Pack
↓
Content Strategy
↓
Content Brief
↓
Outline
↓
Draft
↓
Quality Review
↓
Human Review
↓
Publish
↓
Measure
↓
Learn
```

---

## 4.3 Domain Logic Must Not Pollute the Platform Kernel

Search-specific concepts should remain in the Search & Content bounded context unless they are proven to be shared platform primitives.

For example:

```text
SearchQuery
ContentBrief
SearchSnapshot
ContentPerformance
```

should NOT be added to the global shared kernel unless another unrelated vertical demonstrates that it needs exactly the same invariant.

---

# 5. Proposed Bounded Context

Suggested logical name:

```text
SearchContent
```

Suggested responsibility:

> Convert search-market observations, trusted evidence, business goals, and brand knowledge into measurable content decisions and published artifacts.

The bounded context includes:

```text
Search Intelligence
Content Strategy
Content Planning
Content Production
Content Quality
Publishing
Measurement
Refresh / Optimization
```

---

# 6. Search & Content Domain Pack

Add a domain pack:

```text
/cognitive/domain-packs/search-content/        # Errata E-04 (SCV3-M-03): superseded by ADR-021 §D8 — no domain-packs tree; contracts land in methods/contracts, capabilities/contracts
    /seo/
    /geo/
    /aeo/
    /llmo/
    /entity-seo/
    /local-seo/
    /sxo/
    /cro/
    /aso/
    /content-strategy/
```

The domain pack answers:

> What does correct reasoning look like in Search / AI Search / Content?

It does NOT define generic reasoning primitives.

Generic reasoning remains in AI LEGO Cognitive Method Atlas.

---

# 7. Search-domain Evidence Authority Policy

AI LEGO already owns the canonical Evidence model, including evidence-quality dimensions such as source authority, recency, directness, geography, and a domain-specific evidence hierarchy.

Search & Content therefore MUST NOT introduce a parallel authoritative Evidence record or a second universal source-quality truth model.

Instead, this vertical adds a **Search-domain Authority Assessment Policy** that interprets canonical Source / Evidence records for a specific claim scope.

## 7.1 Core Principle

Authority is not globally determined by publisher alone.

The correct model is:

```text
Source Class
× Claim Scope
× Platform
× Jurisdiction / Market
× Evidence Directness
× Freshness
→ Authority Assessment
```

For example, official Google documentation should normally dominate when the question is:

```text
"What does Google officially require?"
```

It does not automatically dominate peer-reviewed or empirical research when the question is:

```text
"What intervention empirically improves conversion?"
```

Therefore:

> **Official authority is strongest for claims about the authority's own rules, requirements, specifications, or stated behavior; it is not a universal proxy for empirical truth.**

---

## 7.2 Domain Evidence Classes

A useful default classification remains:

```text
P0 = Official Platform / Standard / Regulator for in-scope official claims
P1 = Peer-reviewed / Academic / Standards Research
P2 = High-quality Research-oriented Industry Source
P3 = General Industry Practice / Commentary
```

But the ordering is applied through a claim-scope-aware policy rather than as an unconditional global truth ordering.

---

## 7.3 Proposed Authority Assessment

```yaml
authority_assessment:
  id: AA-001

  source_ref: SRC-001
  evidence_ref: E-001

  claim_scope:
    domain: seo
    platform: GOOGLE_SEARCH
    assertion_type: OFFICIAL_PLATFORM_REQUIREMENT
    market: GLOBAL

  policy:
    id: search-content-authority-v1
    version: 1.0.0

  assessed_tier: P0
  weight: 1.30

  rationale:
  evaluated_at:

  provenance:
```

This record is an **assessment snapshot**, not the canonical Source or Evidence truth record.

---

## 7.4 Ownership Rule

```text
AI LEGO Evidence owns:
- source_authority quality dimension
- recency quality dimension
- directness
- geography
- domain-specific hierarchy slot

SearchContent owns:
- search-domain authority classification policy
- claim-scope interpretation
- platform-specific weighting
- assessment snapshots
- reranking use of the assessment
```

SearchContent MUST NOT redefine the canonical Evidence schema merely to add P0/P1/P2/P3.

# 8. Search-domain Freshness Policy

Search / SEO / GEO knowledge can become stale rapidly, but freshness must not become a second Source lifecycle owned by SearchContent.

The vertical should follow the same architectural pattern used elsewhere in AI-LEGO: the canonical object retains its metadata, while an operational policy defines review cadence, degradation, and retrieval behavior.

## 8.1 Freshness Assessment

```yaml
search_freshness_assessment:
  id: SFA-001

  source_ref: SRC-001
  evidence_ref: E-001

  policy:
    id: search-content-freshness-v1
    version: 1.0.0

  evaluated_at:
  last_verified_at:
  next_review_at:

  state: CURRENT

  rationale:
  provenance:
```

Allowed domain states may include:

```text
CURRENT
REVIEW_DUE
STALE
SUPERSEDED
RETRACTED
UNKNOWN
```

---

## 8.2 Canonical vs Derived Fields

Where canonical source metadata exists, SearchContent should reference rather than copy it:

```text
published_at
updated_at
retrieved_at
```

SearchContent-specific review fields may include:

```text
last_verified_at
next_review_at
policy_version
freshness_state
```

A frozen copy inside a retrieval or evidence pack MUST be labeled as a **snapshot at evaluation time**, not as the canonical value.

---

## 8.3 Freshness Use

Freshness may influence:

- retrieval filtering
- reranking
- quality gates
- change detection
- content refresh candidate generation

Freshness does not by itself determine truth.

# 9. Search Evidence Retrieval & Reranking

## 9.1 Retrieval Architecture

SearchContent MUST reuse the AI LEGO Knowledge / Repository substrate.

Possible retrieval inputs include:

```text
Vector Search
+
Full-text Search
+
Entity / Graph Search
+
SQL / Metadata Filters
+
Live Web Search for freshness
```

SearchContent MUST NOT own a separate vector database, graph store, full-text index, or canonical knowledge repository.

---

## 9.2 Search-domain Reranking Dimensions

Recommended dimensions include:

```text
Semantic Relevance
Authority Assessment
Freshness Assessment
Platform Relevance
Query Intent Relevance
Evidence Directness
Geographic Relevance
Language Relevance
Contradiction / Staleness Penalties
```

A conceptual score may be represented as:

```text
Final Score = f(
  semantic relevance,
  authority,
  freshness,
  platform relevance,
  intent relevance,
  directness,
  geography,
  language,
  penalties
)
```

The exact mathematical composition is **NOT a fixed architectural invariant**.

It MUST be policy-versioned and empirically evaluated.

A production reranking policy should define at minimum:

```text
normalization
missing-value behavior
weight ranges
zero/negative behavior
tie-breaking
policy version
calibration dataset
offline evaluation metrics
online quality metrics
rollback criteria
```

The architecture requires the dimensions and traceability; it does not hard-code one multiplication formula forever.

# 10. Contradiction / Conflict Analysis

AI LEGO already provides canonical Claim and Evidence relationships, including supporting and contradicting evidence and graph-native relationships.

SearchContent therefore should implement contradiction handling as a **derived cognitive analysis**, not as a second canonical truth store.

## 10.1 Processing Flow

```text
Candidate Claims
↓
Supporting / Contradicting Evidence
↓
Authority Assessment
↓
Freshness Assessment
↓
Scope Compatibility Check
↓
Conflict Classification
↓
Derived Analysis Result
```

---

## 10.2 Proposed Derived Result

```yaml
search_conflict_analysis:
  id: SCA-001

  claim_refs:
    - C-001
    - C-002

  scope:
    platform: GOOGLE_SEARCH
    assertion_type: OFFICIAL_PLATFORM_REQUIREMENT

  resolution:
    officially_stated_position: C-002
    empirical_position: null
    unresolved: false

  confidence: high

  evidence_refs: []
  authority_assessment_refs: []

  generated_by_execution:
  provenance:
```

The term `officially_stated_position` is preferred over `official_position` because an official statement is authoritative about the authority's stated rule or requirement, but is not automatically equivalent to empirical truth across all claim types.

The result should normally be represented as a typed method result and/or Artifact, while the underlying Claims and Evidence remain canonical AI-LEGO records.

# 11. Search Intelligence Layer

This is one of the main new bounded-context capabilities.

## 11.1 Core Objects

```text
SearchQuery
SearchSurface
SearchSnapshot
SearchObservation
CompetitorObservation
AIAnswerObservation
CitationObservation
EntityObservation
RankingObservation
```

---

## 11.2 Search Surfaces

Initial supported surfaces may include:

```text
Google Search
Google AI Overviews
Google AI Mode
Bing
Microsoft Copilot
ChatGPT Search
Perplexity
YouTube
Google Play
Apple App Store
```

These should be adapters, not hard-coded platform-core logic.

---

## 11.3 SearchQuery

```yaml
search_query:
  id: SQ-001
  query: "how to optimize brand for chatgpt"
  locale: en-US
  market: US

  intent:
    primary: informational
    secondary:
      - commercial_research

  topics:
    - GEO
    - LLMO
    - BRAND_ENTITY

  created_at:
```

---

## 11.4 SearchSnapshot

```yaml
search_snapshot:
  id: SS-001

  query_id: SQ-001

  surface:
    provider: GOOGLE
    product: AI_OVERVIEW

  location:
    country: US

  language: en

  captured_at:

  result_hash:

  observations: []
```

Snapshots must be immutable.

New observations create new snapshots.

---

# 12. Search Observation Model

Examples:

```text
Organic Result
AI Citation
AI Mention
Featured Snippet
Knowledge Panel
Local Pack
Video Result
People Also Ask
App Result
Shopping Result
```

Suggested schema:

```yaml
search_observation:
  id: OBS-001

  snapshot_id: SS-001

  type: AI_CITATION

  entity:
    type: DOMAIN
    value: example.com

  position: null

  source_url:

  citation_context:

  confidence:

  extracted_at:
```

---

# 13. Competitor Intelligence

Search intelligence should model competitors as observable entities.

Possible dimensions:

```text
Query Coverage
Topic Coverage
Ranking Coverage
AI Citation Frequency
AI Mention Frequency
Backlink / Authority signals
Entity Coverage
Structured Data
Content Depth
Content Freshness
Internal Linking
Conversion Experience
```

Competitor data remains observations/evidence.

AI-generated interpretation remains inference.

---

# 14. Content Strategy Engine

The Content Strategy Engine determines whether content should exist before writing begins.

## 14.1 Strategy Flow

```text
Business Goal
↓
Audience / Market
↓
Query / Question Discovery
↓
Intent Analysis
↓
Topic Clustering
↓
Existing URL Mapping
↓
Content Gap
↓
Cannibalization Check
↓
Entity Coverage
↓
Business Value
↓
Search Opportunity
↓
Priority
↓
Content Roadmap
```

---

## 14.2 TopicCluster

```yaml
topic_cluster:
  id: TC-001

  name: "ChatGPT Brand Visibility"

  parent_topic:
    id: TOP-GEO

  queries:
    - SQ-001
    - SQ-002

  entities:
    - ChatGPT
    - OpenAI
    - Brand Entity

  intent_distribution:
    informational: 0.70
    commercial_research: 0.30

  existing_urls: []

  opportunity:
    score:
    rationale:

  status:
    candidate
```

---

# 15. URL / Topic Mapping

The system should maintain:

```text
Topic
↕
Query
↕
URL
↕
Artifact
↕
Search Performance
```

This supports:

- Cannibalization detection
- Duplicate topic detection
- Merge recommendations
- Refresh recommendations
- Internal link planning
- Content gap analysis

---

# 16. Content Priority Model

Content prioritization is a decision problem, not merely a scoring helper.

Possible criteria include:

```text
Business Value
Search Demand
AI Visibility Opportunity
Topical Authority Value
Competitive Gap
Conversion Potential
Content Cost
Evidence Availability
Freshness Requirement
Strategic Importance
```

A simple score such as:

```text
Opportunity × Business Value × Strategic Fit × Evidence Confidence ÷ Estimated Cost
```

may be useful as an illustrative heuristic, but MUST NOT become an undocumented hard-coded decision engine.

The preferred architecture is:

```text
Content Prioritization Method
+
Versioned Criteria / Weights
+
Optional Trusted Compute
+
Canonical AI-LEGO Decision
↓
Prioritized Content Decision
```

This preserves:

- human judgment
- criteria traceability
- assumptions
- evidence snapshots
- confidence
- reversal conditions
- outcome tracking

The exact prioritization model should be configurable, versioned, evaluated, and auditable.

# 17. Content Brief as a Contract

A Content Brief should be a typed object, not free-form prose.

## 17.1 Proposed ContentBrief

```yaml
content_brief:
  id: CB-001
  version: 1.0.0

  objective:
    business_goal:
    audience:
    conversion_goal:

  search:
    primary_query:
    secondary_queries: []
    search_intent:
    target_surfaces: []

  content:
    content_type:
    required_sections: []
    required_questions: []
    required_entities: []
    required_comparisons: []

  evidence:
    evidence_pack_id:
    required_source_tiers: null   # Errata E-02 (SCV3-H-02): superseded by CONTENT_BRIEF_CONTRACT.md FINDING-CB-01 — policy refs + per-claim evidence requirements
      # (was: - P0)
      # (was: - P1)

  linking:
    required_internal_links: []
    recommended_external_citations: []

  seo:
    canonical_target:
    schema_recommendation:
    title_constraints:
    meta_description_constraints:

  geo:
    citation_friendly_requirements: []
    answerability_requirements: []

  brand:
    voice_profile:
    prohibited_claims: []
    required_positioning: []

  qa:
    required_gates: []

  status:
    draft
```

---

# 18. Evidence Pack

The Writing Engine should receive a structured, reproducible retrieval snapshot rather than random snippets.

However, the Evidence Pack MUST NOT become a second Evidence truth model.

## 18.1 Correct Role

The Evidence Pack is:

> **a frozen retrieval / assessment snapshot for one task, brief, or execution.**

It is not the canonical owner of Source authority, Evidence quality, or freshness.

---

## 18.2 Proposed Evidence Pack

```yaml
evidence_pack:
  id: EP-001
  version: 1.0.0

  topic:
  query_context:

  refs:
    - evidence_ref: E-001
      claim_ref: C-001
      source_ref: SRC-001

      retrieval:
        semantic_score:
        rerank_score:
        rank:

      authority_assessment_ref: AA-001
      freshness_assessment_ref: SFA-001

  conflicts: []
  unknowns: []
  assumptions: []

  assessment_snapshot:
    authority_policy_id:
    authority_policy_version:
    freshness_policy_id:
    freshness_policy_version:
    evaluated_at:

  knowledge_snapshot:
  generated_by_execution:
  provenance:
```

If authority or freshness values are denormalized into the pack for reproducibility, they MUST be explicitly labeled as snapshot values and MUST retain the originating policy version / assessment reference.

---

## 18.3 Required Property

A Content Brief or Draft generated from an Evidence Pack must be able to trace important claims back through:

```text
Artifact / Brief
→ Evidence Pack
→ Claim / Evidence
→ Source
→ Provenance locator
```

The pack itself never replaces that chain.

# 19. Content Production Pipeline

Recommended workflow:

```text
Content Brief
↓
Evidence Pack
↓
Outline
↓
Outline QA
↓
Draft
↓
Citation Binding
↓
SEO Review
↓
GEO / AEO Review
↓
Entity Review
↓
Brand Review
↓
Conversion Review
↓
Human Review
↓
Artifact
```

Generation is only one stage in the workflow.

---

# 20. Writing Engine Boundary

The Writing Engine may do:

- Drafting
- Rewriting
- Summarization
- Formatting
- Section generation
- FAQ generation
- Comparison tables
- Titles
- Meta descriptions
- CTA variants

The Writing Engine must NOT independently decide:

- Which claims are true
- Which sources outrank others
- Which content should exist
- Which content should be published
- Whether a legal/platform statement is official
- Whether a recommendation is sufficiently evidenced

Those decisions belong to evidence, strategy, policy, and quality layers.

---


# 21. Complete Domain Execution Contract

The master architecture MUST be complete enough that an implementer can understand how every major Search & Content discipline operates without relying on a future document to supply missing conceptual steps.

A child document MAY add:

```text
field-level JSON/YAML schemas
API contracts
provider-specific mappings
test fixtures
benchmark datasets
implementation details
runbooks
```

A child document MUST NOT be required merely to discover:

```text
what the domain is trying to achieve
what inputs it requires
what reasoning sequence it follows
what typed outputs it produces
what quality gates apply
what metrics determine success
how observations feed back into decisions
```

This document therefore defines a common operating contract for:

```text
SEO
GEO
AEO
LLMO
Entity SEO
Local SEO
Content Strategy
SXO / CRO
ASO
Publishing
Measurement
Content Lifecycle / Refresh
```

---

## 21.1 Common Domain Method Shape

Every operational method in this vertical SHOULD be reducible to:

```yaml
domain_method:
  id:
  version:

  objective:

  inputs: []

  evidence_requirements: []

  procedure: []

  outputs: []

  quality_gates: []

  metrics: []

  failure_modes: []

  refresh_triggers: []

  provenance_requirements: []

  maturity:
```

The method itself is domain logic.

Execution still flows through AI-LEGO:

```text
Domain Method
↓
Method Contract / Capability Contract
↓
Recipe
↓
Workflow IR
↓
Execution
↓
Gate Results
↓
Artifact / Decision / Observation
↓
Event Ledger
```

---

## 21.2 Evidence Classification Rule

Search-content knowledge MUST distinguish:

```text
OFFICIAL_RULE
OFFICIAL_GUIDANCE
STANDARD
REGULATORY_REQUIREMENT
PEER_REVIEWED_RESEARCH
EMPIRICAL_INDUSTRY_RESEARCH
DOMAIN_HEURISTIC
EXPERIMENTAL_PRACTICE
INTERNAL_OBSERVATION
MODEL_INFERENCE
```

A method MUST NOT silently convert:

```text
DOMAIN_HEURISTIC
or
EXPERIMENTAL_PRACTICE
```

into:

```text
OFFICIAL_RULE
```

This is especially important for:

```text
GEO
AEO
LLMO
AI visibility
AI citation optimization
```

where the ecosystem changes quickly and many industry recommendations are not official ranking requirements.

---

## 21.3 Standard Operating Envelope

Every domain execution SHOULD capture:

```yaml
execution_context:
  tenant_ref:
  workspace_ref:
  project_ref:

  market:
  locale:
  language:

  target_surfaces: []

  target_entities: []
  target_queries: []

  source_snapshot:
  search_snapshot_refs: []
  evidence_pack_ref:

  method_versions: []
  policy_versions: []

  executed_at:
  execution_ref:
```

This allows replay, comparison, audit, and refresh.

---

## 21.4 Completeness Matrix

| Domain | Research | Analysis | Decision | Production | QA | Publish | Measure | Refresh |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| AEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LLMO | ✓ | ✓ | ✓ | partial | ✓ | n/a / indirect | ✓ | ✓ |
| Entity SEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Local SEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Content Strategy | ✓ | ✓ | ✓ | planning | ✓ | n/a | ✓ | ✓ |
| SXO / CRO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ASO | ✓ | ✓ | ✓ | ✓ | ✓ | store publish | ✓ | ✓ |
| Publishing | n/a | validation | ✓ | deployment | ✓ | ✓ | ✓ | rollback |
| Measurement | collect | analyze | ✓ | n/a | data QA | n/a | ✓ | ✓ |

---

# 22. SEO Operating Architecture

SEO in this system is not a single score or a writing prompt.

It is a decision and validation discipline covering:

```text
Demand / Query Understanding
Search Intent
SERP / Surface Observation
Technical Discoverability
Indexability
Information Architecture
Content Relevance
Entity Coverage
Internal Linking
Structured Data
Canonicalization
Duplication / Cannibalization
Page Experience
Authority / External Signals
Freshness
Performance
```

---

## 22.1 SEO Objectives

SEO methods optimize for measurable outcomes such as:

```text
eligible discovery
crawlability
indexability
query relevance
qualified impressions
qualified clicks
organic visibility
topic coverage
entity clarity
conversion-supporting traffic
durable content performance
```

SEO MUST NOT be reduced to:

```text
keyword density
word count
one proprietary SEO score
```

---

## 22.2 SEO Inputs

Core inputs:

```text
Business Goal
Audience
Market / Locale
Query Set
Search Intent
Search Snapshots
Existing URLs
Site Crawl
Indexability Signals
Internal Link Graph
Structured Data
Content Inventory
Entity Graph
Competitor Observations
Performance Data
Evidence Pack
```

Optional provider data:

```text
Search Console
Bing Webmaster
Analytics
rank tracking
crawl logs
server logs
backlink / authority datasets
```

---

## 22.3 SEO End-to-End Method

```text
Business Goal
↓
Query / Demand Discovery
↓
Intent Classification
↓
SERP / Search Surface Analysis
↓
Existing URL Mapping
↓
Technical Eligibility Check
↓
Content / Entity Gap Analysis
↓
Cannibalization / Duplication Analysis
↓
Opportunity Decision
↓
Content Brief or Technical Change Plan
↓
Production / Implementation
↓
SEO Quality Gates
↓
Publish
↓
Index / Crawl Verification
↓
Search Performance Measurement
↓
Refresh / Merge / Redirect / Remove Decision
```

---

## 22.4 Query Discovery Method

Proposed method:

```text
seo.query_discovery
```

Inputs:

```text
seed topics
brand/product/service entities
site content
first-party search data
search suggestions / observed questions
competitor observations
business goals
```

Procedure:

```text
collect candidate queries
↓
normalize language / locale
↓
deduplicate
↓
group lexical variants
↓
identify entity / topic
↓
classify intent
↓
estimate strategic relevance
↓
link evidence / observation source
```

Outputs:

```yaml
query_set:
  queries:
    - query:
      locale:
      topic:
      entities:
      intent:
      source_refs:
      strategic_relevance:
```

---

## 22.5 Search Intent Analysis

Proposed method:

```text
seo.search_intent_analysis
```

Intent dimensions SHOULD include:

```text
informational
navigational
commercial_research
transactional
local
support / troubleshooting
comparison
brand / entity
mixed
```

The method SHOULD also infer expected:

```text
content type
content format
depth
freshness
locality
transaction readiness
```

Example output:

```yaml
intent_analysis:
  primary_intent:
  secondary_intents: []
  expected_content_types: []
  expected_formats: []
  mixed_intent: false
  confidence:
  observation_refs: []
```

---

## 22.6 SERP / Surface Analysis

Proposed method:

```text
seo.search_surface_analysis
```

Analyze observed search results rather than assuming a universal layout.

Possible observed features:

```text
organic results
AI-generated answer
featured answer
people-also-ask style questions
knowledge panels
local packs
video
images
shopping
forums / discussions
apps
news
```

Output:

```text
dominant result types
dominant content archetypes
recurring entities
recurring subtopics
freshness pattern
authority/source pattern
intent mixture
content gaps
```

---

## 22.7 Technical SEO Method Family

Methods MAY include:

```text
seo.crawlability_analysis
seo.indexability_analysis
seo.canonical_analysis
seo.redirect_analysis
seo.sitemap_analysis
seo.robots_analysis
seo.hreflang_analysis
seo.rendering_analysis
seo.status_code_analysis
seo.duplicate_url_analysis
seo.faceted_navigation_analysis
seo.pagination_analysis
```

Technical recommendations MUST be grounded in:

```text
observed site behavior
platform configuration
official platform documentation where platform-specific
```

---

## 22.8 Information Architecture & Internal Linking

Proposed methods:

```text
seo.information_architecture_analysis
seo.internal_link_analysis
seo.orphan_page_analysis
seo.anchor_context_analysis
```

Model:

```text
Topic
↕
Entity
↕
URL
↕
Internal Link
↕
User Journey
```

The system SHOULD detect:

```text
orphan URLs
weakly connected topic clusters
over-concentrated link hubs
contextually irrelevant links
missing parent/child relationships
broken links
redirect chains
```

---

## 22.9 Cannibalization & Duplication

Proposed method:

```text
seo.cannibalization_analysis
```

Inputs:

```text
query-to-URL observations
content similarity
intent similarity
search performance
canonical targets
internal links
```

Possible outputs:

```text
NO_CONFLICT
INTENT_OVERLAP
TOPIC_OVERLAP
TRUE_CANNIBALIZATION
DUPLICATE_CONTENT
NEEDS_INVESTIGATION
```

Recommended actions feed the canonical Decision object:

```text
KEEP
MERGE
REWRITE
REPOSITION
REDIRECT
CANONICALIZE
NOINDEX
REMOVE
INVESTIGATE
```

---

## 22.10 Structured Data

Proposed method:

```text
seo.structured_data_analysis
```

The method MUST distinguish:

```text
schema vocabulary validity
platform eligibility requirements
actual page-content consistency
rich-result / feature eligibility
```

It MUST NOT recommend structured data solely because a vocabulary exists.

Official platform eligibility claims require official evidence.

---

## 22.11 SEO Outputs

Typed outputs MAY include:

```text
SEOAudit
TechnicalChangePlan
QuerySet
IntentAnalysis
SearchSurfaceAnalysis
URLTopicMap
CannibalizationAnalysis
InternalLinkPlan
StructuredDataRecommendation
SEOContentRequirements
SEORefreshRecommendation
```

---

## 22.12 SEO Metrics

Primary:

```text
impressions
clicks
CTR
average position / visibility metric
indexed eligible URLs
query coverage
qualified organic sessions
conversions
revenue / goal completion
```

Diagnostic:

```text
crawl errors
indexability failures
canonical inconsistencies
internal-link depth
orphan URLs
content decay
query-to-URL instability
```

---

# 23. GEO Operating Architecture

GEO here means optimization for generative answer environments.

It MUST be treated as:

```text
evidence-informed domain methodology
```

not automatically as:

```text
official search-engine ranking policy
```

unless an Evidence Pack contains official platform guidance supporting a specific claim.

---

## 23.1 GEO Objectives

```text
clear answerability
accurate entity representation
claim-level evidence support
citation readiness
source transparency
passage-level comprehensibility
coverage of relevant questions
AI answer visibility
brand / entity inclusion where legitimately relevant
```

---

## 23.2 GEO Inputs

```text
Target Question Set
Target Entities
Content Artifact
Evidence Pack
Source Authority Assessments
Search / AI Answer Snapshots
Competitor / Citation Observations
Brand Knowledge
Locale / Market
```

---

## 23.3 GEO End-to-End Method

```text
Question / Query Set
↓
AI Answer Environment Observation
↓
Entity & Source Analysis
↓
Evidence Retrieval
↓
Answerability Analysis
↓
Citation Readiness Analysis
↓
Entity Clarity Analysis
↓
Coverage / Passage Analysis
↓
Content Requirements
↓
Production / Revision
↓
GEO Quality Gates
↓
Publish
↓
AI Visibility Observation
↓
Refresh
```

---

## 23.4 Answerability Analysis

Proposed method:

```text
geo.answerability_analysis
```

Check whether a passage:

```text
directly addresses a target question
contains the required entity
states the answer unambiguously
separates fact from opinion/inference
contains enough context to stand alone
avoids unsupported certainty
links important claims to evidence
```

Output:

```yaml
answerability_analysis:
  question_ref:
  direct_answer_present:
  answer_span_ref:
  entity_ambiguity:
  missing_context: []
  unsupported_claim_refs: []
  answerability_score:
  remediation: []
```

---

## 23.5 Citation Readiness

Proposed method:

```text
geo.citation_readiness_analysis
```

Dimensions:

```text
claim specificity
source traceability
source authority for claim scope
source freshness
directness
sentence-level provenance
contradicting evidence disclosure
stable citation target
```

Citation readiness does NOT mean:

```text
guaranteed citation by an AI system
```

It means:

```text
the content is structurally and evidentially suitable for citation.
```

---

## 23.6 Passage Independence

Proposed method:

```text
geo.passage_independence_analysis
```

A candidate passage SHOULD be understandable without requiring hidden context from unrelated sections.

Check:

```text
explicit subject
explicit predicate / answer
necessary qualifiers
units / dates where relevant
entity disambiguation
evidence linkage
```

This is a content-quality heuristic, not an asserted ranking factor.

---

## 23.7 GEO Entity Clarity

Proposed method:

```text
geo.entity_clarity_analysis
```

Check:

```text
consistent canonical entity naming
unambiguous organization/person/product references
relationship consistency
attribute consistency
brand/product/service distinctions
location distinctions
same entity not represented by conflicting facts
```

Use AI-LEGO Entity / Relation substrate rather than a separate GEO graph.

---

## 23.8 GEO Question Coverage

Proposed method:

```text
geo.question_coverage_analysis
```

Map:

```text
Topic
→ User Questions
→ Answer Types
→ Evidence
→ Content Sections
```

Outputs:

```text
covered questions
partially covered questions
missing questions
unsupported answers
duplicate answers
```

---

## 23.9 GEO Outputs

```text
GEOAnalysis
AnswerabilityReport
CitationReadinessReport
EntityClarityReport
QuestionCoverageMap
GEOContentRequirements
AIVisibilityObservation
```

---

## 23.10 GEO Metrics

Use observational metrics, never guaranteed-ranking language.

Examples:

```text
AI answer mention rate
citation rate
unique query coverage
unique surface coverage
brand/entity inclusion rate
source URL citation frequency
competitor co-mention rate
answer representation consistency
citation persistence over time
```

---

# 24. AEO Operating Architecture

AEO focuses on structuring information so answer-oriented search systems can resolve user questions accurately and efficiently.

It overlaps with SEO and GEO but is not identical to either.

---

## 24.1 AEO Objectives

```text
discover relevant questions
classify answer intent
select appropriate answer form
provide a direct answer
support the answer with explanation/evidence
avoid ambiguity
map related follow-up questions
validate structured-data eligibility where relevant
measure answer-surface visibility
```

---

## 24.2 Question Discovery

Proposed method:

```text
aeo.question_discovery
```

Sources may include:

```text
search queries
site search
support tickets
sales questions
community questions
SERP question features
AI answer follow-ups
product FAQ
customer interviews
```

Every question SHOULD retain its source/provenance.

---

## 24.3 Question Classification

Proposed method:

```text
aeo.question_classification
```

Possible answer classes:

```text
DEFINITION
FACT
HOW_TO
WHY
COMPARISON
LIST
CALCULATION
TROUBLESHOOTING
YES_NO
RECOMMENDATION
LOCAL
TRANSACTIONAL
POLICY
```

The class influences expected output form.

---

## 24.4 Answer Type Selection

Proposed method:

```text
aeo.answer_type_selection
```

Examples:

```text
definition → concise definition + qualification
how_to → ordered steps + prerequisites + warnings
comparison → explicit dimensions + evidence
calculation → formula + units + assumptions
troubleshooting → symptom → causes → checks → resolution
local → location-aware answer + entity/location facts
```

---

## 24.5 Direct Answer Construction

The system SHOULD use:

```text
Direct Answer
↓
Necessary Qualification
↓
Supporting Explanation
↓
Evidence / Citation
↓
Related Questions
```

Avoid:

```text
long introduction before answering
ambiguous pronouns
unsupported absolutes
answer hidden only in a table/image
```

---

## 24.6 FAQ / Question Graph

AEO SHOULD maintain a question graph:

```text
Primary Question
├── Clarifying Questions
├── Prerequisite Questions
├── Comparison Questions
├── Risk / Exception Questions
└── Next-step Questions
```

This can feed:

```text
FAQ
support content
article sections
product pages
comparison pages
AI answer analysis
```

---

## 24.7 Structured Data Eligibility

Proposed method:

```text
aeo.structured_answer_eligibility_analysis
```

This method checks:

```text
whether the page type is eligible
whether visible content matches structured data
whether official platform guidance supports the recommendation
whether markup would be truthful and non-misleading
```

---

## 24.8 AEO Outputs

```text
QuestionSet
QuestionClassification
AnswerTypePlan
DirectAnswerRequirements
FAQGraph
AEOContentRequirements
AnswerabilityReport
```

---

## 24.9 AEO Metrics

```text
question coverage
direct-answer coverage
answer-surface appearances
featured-answer / answer-feature observations
AI answer inclusion
support deflection where relevant
organic CTR for question queries
conversion from question-led pages
```

---

# 25. LLMO Operating Architecture

LLMO focuses on measuring and improving how a brand, product, service, source, or entity is represented across LLM-mediated answer surfaces.

LLMO MUST be observation-driven because model outputs are stochastic, surface-dependent, version-dependent, and time-dependent.

---

## 25.1 LLMO Objectives

```text
measure entity representation
measure brand/product mentions
measure citation behavior
identify source attribution
identify competitor co-occurrence
detect factual misrepresentation
detect missing entity coverage
track change over time
improve grounded information availability
```

---

## 25.2 Prompt / Query Universe

Proposed method:

```text
llmo.prompt_set_design
```

Prompt set categories:

```text
category discovery
brand discovery
product discovery
recommendation
comparison
problem / solution
how-to
definition
purchase consideration
local discovery
trust / reputation
feature / capability
alternatives
```

Every prompt SHOULD store:

```text
intent
persona
market
locale
language
importance weight
source/rationale
```

---

## 25.3 Sampling Contract

A valid LLMO observation SHOULD record where possible:

```yaml
llm_observation_context:
  provider:
  product_surface:
  model_or_surface_version:
  prompt_ref:
  locale:
  market:
  captured_at:
  session_mode:
  search_enabled:
  reproducibility_notes:
```

Do not compare two observations as if identical when their execution contexts differ materially.

---

## 25.4 Answer Snapshot Analysis

Proposed method:

```text
llmo.answer_snapshot_analysis
```

Extract:

```text
entities mentioned
brand mentioned
products/services mentioned
relative ordering
citations / URLs
claims about target entity
recommendation context
competitor mentions
uncertainty / qualifiers
negative or incorrect statements
```

---

## 25.5 Brand Mention Analysis

Proposed method:

```text
llmo.brand_mention_analysis
```

Output:

```yaml
brand_visibility:
  mentioned:
  mention_count:
  first_mention_position:
  recommendation_context:
  competitors_mentioned: []
  entity_description:
  factual_issue_refs: []
```

---

## 25.6 Citation Analysis

Proposed method:

```text
llmo.citation_analysis
```

Measure:

```text
citation present
target domain cited
target URL cited
citation context
claim supported by citation
competitor citations
citation diversity
citation persistence
```

---

## 25.7 Entity Representation Analysis

Proposed method:

```text
llmo.entity_representation_analysis
```

Compare answer assertions against canonical brand/entity knowledge.

Classify:

```text
CORRECT
PARTIALLY_CORRECT
OUTDATED
AMBIGUOUS
UNSUPPORTED
INCORRECT
MISSING
```

Incorrect representation becomes:

```text
Observation
→ Evidence
→ Claim / issue
→ remediation / content decision
```

not an automatic accusation about model behavior.

---

## 25.8 LLMO Volatility

LLM outputs SHOULD be sampled longitudinally.

Useful statistics:

```text
mention frequency
citation frequency
representation consistency
answer variance
competitor variance
source variance
```

A single answer snapshot MUST NOT be treated as stable market truth.

---

## 25.9 LLMO Outputs

```text
PromptSet
LLMAnswerSnapshot
LLMVisibilityObservation
BrandMentionAnalysis
CitationAnalysis
EntityRepresentationAnalysis
CompetitorCooccurrenceAnalysis
LLMOMeasurementReport
```

---

## 25.10 LLMO Metrics

```text
weighted mention rate
weighted citation rate
prompt coverage
surface coverage
brand recommendation rate
competitor share of mentions
entity correctness rate
citation persistence
representation consistency
```

All aggregate metrics MUST define:

```text
denominator
sampling strategy
weights
time period
surfaces included
```

---

# 26. Entity SEO Operating Architecture

Entity SEO improves the clarity, consistency, and retrievability of real-world entities and their relationships.

It MUST reuse AI-LEGO Entity / Relation / Evidence Graph concepts.

---

## 26.1 Entity SEO Objectives

```text
canonical entity identity
disambiguation
consistent attributes
consistent relationships
topic/entity coverage
entity-to-page mapping
entity-to-evidence mapping
structured representation
knowledge consistency
```

---

## 26.2 Entity Resolution

Proposed method:

```text
entity.resolve_identity
```

Inputs:

```text
names
aliases
URLs
organization data
product data
people
locations
external identifiers
brand knowledge
```

Output:

```text
canonical entity
aliases
possible duplicates
confidence
evidence refs
```

---

## 26.3 Entity Coverage Analysis

Proposed method:

```text
seo.entity_coverage_analysis
```

Map:

```text
Target Topic
→ Required Entities
→ Required Attributes
→ Required Relationships
→ Existing URLs
→ Missing Coverage
```

---

## 26.4 Entity Consistency

Proposed method:

```text
entity.consistency_analysis
```

Detect contradictions such as:

```text
different founding dates
different product naming
different prices
different locations
person-role mismatches
brand/company confusion
obsolete product facts
```

---

## 26.5 Entity-to-URL Mapping

```text
Entity
↕
Canonical URL
↕
Supporting URLs
↕
Claims
↕
Evidence
```

Avoid creating multiple competing canonical pages for the same entity without an explicit strategy.

---

## 26.6 Entity Outputs

```text
EntityResolution
EntityCoverageMap
EntityConsistencyReport
EntityURLMap
EntityContentRequirements
RelationRecommendations
```

---

# 27. Local SEO Operating Architecture

Local SEO is location-aware search optimization.

It MUST separate:

```text
business entity facts
location facts
profile/platform observations
local landing-page content
review/reputation observations
local search performance
```

---

## 27.1 Local SEO Objectives

```text
accurate location identity
consistent business facts
local-intent coverage
relevant location pages
local entity clarity
profile completeness
review/reputation visibility
local conversion
```

---

## 27.2 Local Entity Model

Recommended logical entities:

```text
Business
Brand
Location
ServiceArea
Product
Service
Person
OpeningHours
ContactPoint
```

Relationships:

```text
Brand → hasLocation → Location
Location → offers → Service
Location → serves → ServiceArea
Person → worksAt → Location
```

Canonical fields should ultimately reference core Entity/Source facts.

---

## 27.3 Local Intent Analysis

Proposed method:

```text
local.intent_analysis
```

Classify:

```text
near_me
city / district
service_area
directions
hours
availability
appointment
comparison
reputation
emergency / urgent
```

---

## 27.4 Local Profile Consistency

Proposed method:

```text
local.profile_consistency_analysis
```

Compare observed platform/profile data against canonical entity facts:

```text
name
address
phone
URL
hours
category
services
location status
```

Do not treat third-party platform data as canonical truth without verification.

---

## 27.5 Local Landing Page Analysis

Proposed method:

```text
local.landing_page_analysis
```

Check:

```text
location specificity
service/location relevance
unique local information
entity consistency
contact/action clarity
structured data eligibility
internal links
duplicate/doorway-like risk
```

Recommendations MUST avoid mass-producing near-identical location pages without genuine local value.

---

## 27.6 Reviews / Reputation

Proposed method:

```text
local.reputation_observation
```

Measure:

```text
review volume
rating distribution
recency
topic themes
response coverage
complaint themes
```

The system MUST NOT fabricate reviews or recommend deceptive review practices.

---

## 27.7 Local Metrics

```text
local impressions
local clicks
calls
directions
bookings
location-page conversions
local pack / map observations
review trend
profile action rate
```

---

# 28. Content Strategy Operating Architecture

Content Strategy decides:

> What should exist, why should it exist, for whom, at what priority, in what format, and what should happen to existing content?

Writing begins only after this decision layer.

---

## 28.1 Content Strategy Inputs

```text
Business Goals
Audience / Personas
Brand Positioning
Products / Services
Search Queries
Question Sets
Search Snapshots
AI Answer Observations
Existing Content Inventory
Entity Map
Competitor Observations
Performance Data
Conversion Data
Evidence Availability
Resources / Cost
```

---

## 28.2 Strategy End-to-End Method

```text
Business Goal
↓
Audience / Journey
↓
Demand / Question Research
↓
Topic / Entity Modeling
↓
Intent
↓
Existing Content Inventory
↓
URL Mapping
↓
Coverage / Gap Analysis
↓
Cannibalization
↓
Competitive Gap
↓
Business Value
↓
Evidence Availability
↓
Effort / Cost
↓
Priority Analysis
↓
Canonical Decision
↓
Roadmap
```

---

## 28.3 Topic Modeling

Proposed methods:

```text
content.topic_discovery
content.topic_clustering
content.topic_hierarchy_analysis
```

Topic clusters SHOULD preserve:

```text
parent topic
subtopics
queries
questions
entities
journey stage
existing URLs
business relationship
```

---

## 28.4 Content Gap Analysis

Proposed method:

```text
content.content_gap_analysis
```

Gap types:

```text
QUERY_GAP
QUESTION_GAP
ENTITY_GAP
INTENT_GAP
JOURNEY_GAP
FORMAT_GAP
FRESHNESS_GAP
EVIDENCE_GAP
COMPETITOR_COVERAGE_GAP
CONVERSION_GAP
```

---

## 28.5 Portfolio Analysis

Content strategy SHOULD operate above the single-page level.

Evaluate:

```text
topic authority coverage
funnel coverage
persona coverage
product/service coverage
entity coverage
geographic coverage
language coverage
content lifecycle
seasonality
revenue contribution
content maintenance burden
```

---

## 28.6 Priority Analysis

Proposed method:

```text
content.topic_prioritization
```

Criteria MAY include:

```text
business value
search opportunity
AI visibility opportunity
strategic fit
conversion potential
competitive gap
entity importance
evidence availability
freshness urgency
estimated effort
risk
```

Criteria and weights MUST be versioned.

If the priority changes a meaningful business roadmap, use canonical AI-LEGO Decision rather than hiding the choice inside a score.

---

## 28.7 Content Action Decision

Canonical Decision options commonly include:

```text
CREATE
KEEP
REFRESH
REWRITE
MERGE
SPLIT
REPOSITION
REDIRECT
REMOVE
NOINDEX
INVESTIGATE
```

The recommendation must retain:

```text
criteria
evidence
assumptions
unknowns
human judgment
```

---

## 28.8 Roadmap Output

```yaml
content_roadmap:
  period:
  initiatives:
    - topic_cluster_ref:
      decision_ref:
      target_artifact_type:
      priority:
      owner:
      dependencies:
      target_window:
      measurement_plan:
```

---

# 29. SXO / CRO Operating Architecture

SXO and CRO optimize the user journey after discovery.

They MUST not optimize conversion at the cost of:

```text
deception
accessibility
privacy
policy
user trust
```

---

## 29.1 Objectives

```text
message match
task completion
reduced friction
clear information hierarchy
trust
CTA clarity
conversion
retention / downstream quality
```

---

## 29.2 Inputs

```text
Search Intent
Landing Page
Traffic Source
Audience
Journey Stage
Analytics
Behavioral Data
Conversion Funnel
User Research
Experiment History
Accessibility Findings
```

---

## 29.3 Message Match

Proposed method:

```text
sxo.message_match_analysis
```

Compare:

```text
query / source promise
search snippet / ad promise
landing-page headline
primary content
CTA
conversion goal
```

Detect expectation mismatch.

---

## 29.4 Friction Analysis

Proposed method:

```text
cro.friction_analysis
```

Dimensions:

```text
unnecessary steps
unclear forms
poor error recovery
hidden costs
weak trust signals
mobile friction
slow interaction
confusing CTA hierarchy
accessibility blockers
```

---

## 29.5 CTA Analysis

Proposed method:

```text
cro.cta_analysis
```

Evaluate:

```text
action clarity
value proposition
placement
journey appropriateness
competing CTAs
commitment level
post-click expectation
```

---

## 29.6 Experiment Design

Use AI-LEGO Experiment / Decision architecture when machine contracts become available.

Experiment requirements:

```text
hypothesis
primary metric
guardrail metrics
control
treatment
sample
duration
stopping rule
analysis method
decision rule
```

Avoid declaring success from noisy before/after comparisons without a defensible design.

---

## 29.7 SXO / CRO Outputs

```text
JourneyAnalysis
MessageMatchAnalysis
FrictionReport
CTARecommendation
ExperimentPlan
ConversionRequirements
```

---

## 29.8 Metrics

```text
conversion rate
qualified lead rate
purchase rate
revenue per session
form completion
CTA engagement
drop-off
task success
return rate / cancellation where relevant
guardrail metrics
```

---

# 30. ASO Operating Architecture

ASO covers app-store discovery and listing conversion.

It is a separate surface from web search and must respect each store's current official metadata and policy requirements.

---

## 30.1 ASO Objectives

```text
store discoverability
query relevance
listing clarity
creative effectiveness
conversion to install
rating/review health
localization quality
retention-quality alignment
```

---

## 30.2 ASO Inputs

```text
App Entity
Store Listing
Metadata
Target Markets
Query / Keyword Observations
Competitor Listings
Ratings / Reviews
Creative Assets
Install / Conversion Data
Localization
Store Policy Evidence
```

---

## 30.3 ASO End-to-End Method

```text
Market / Audience
↓
Store Query Research
↓
Competitor Listing Analysis
↓
Metadata Analysis
↓
Entity / Feature Coverage
↓
Creative Analysis
↓
Review Theme Analysis
↓
Localization
↓
Listing Brief
↓
Store QA
↓
Publish
↓
Store Performance
↓
Refresh / Experiment
```

---

## 30.4 ASO Methods

Proposed methods:

```text
aso.query_research
aso.metadata_analysis
aso.competitor_listing_analysis
aso.creative_analysis
aso.review_theme_analysis
aso.localization_analysis
aso.listing_conversion_analysis
```

---

## 30.5 ASO Listing Contract

Logical fields:

```text
app name
subtitle / short description where applicable
long description
keywords where applicable
category
screenshots
video / preview where applicable
icon
promotional text where applicable
release notes
localizations
```

Actual allowed fields and limits MUST come from current official store evidence, not from hard-coded assumptions in this architecture.

---

## 30.6 ASO Metrics

```text
store impressions
product-page views
listing conversion
installs
keyword / query visibility observations
rating
review velocity
retention / quality guardrails
localized-market performance
```

---

# 31. Publishing Operations Architecture

Publishing converts an approved Artifact into a channel-specific Publication.

It is a controlled deployment process, not a text-generation step.

---

## 31.1 Publishing State Machine

Recommended logical states:

```text
CONTENT_READY
↓
DRAFT_CREATED
↓
PREVIEW_READY
↓
VALIDATED
↓
APPROVED
↓
SCHEDULED
or
PUBLISHED
↓
VERIFIED
```

Failure / alternate states:

```text
VALIDATION_FAILED
APPROVAL_REQUIRED
PUBLISH_FAILED
PARTIALLY_PUBLISHED
ROLLBACK_REQUIRED
ROLLED_BACK
UNPUBLISHED
```

---

## 31.2 Publishing Inputs

```text
Artifact
ContentBrief
Approval State
Channel
CMS / Store Adapter
Metadata
Structured Data
Media Assets
Internal Links
Canonical / Localization Configuration
Publish Policy
```

---

## 31.3 Adapter Contract

Every publishing adapter SHOULD define:

```yaml
publishing_adapter:
  provider:
  version:

  operations:
    - create_draft
    - update_draft
    - preview
    - diff
    - schedule
    - publish
    - unpublish
    - rollback
    - verify

  authentication:
  idempotency:
  retry_policy:
  rate_limit_behavior:
  conflict_behavior:
  rollback_support:
  observability:
```

---

## 31.4 Draft Creation

A draft operation SHOULD return:

```text
publication_ref
provider_object_id
preview_url
remote_version
content_hash
```

It MUST NOT silently publish unless the workflow explicitly requested and authorized publication.

---

## 31.5 Diff & Approval

Before a production publish, the system SHOULD be able to show:

```text
artifact version
current remote version
proposed remote version
content diff
metadata diff
schema diff
link diff
```

Approval must bind to the version/hash being approved.

---

## 31.6 Publishing Validation

Validate:

```text
required fields
title/meta
canonical
robots
hreflang where applicable
structured data syntax
structured data/content consistency
internal links
media references
alt text requirements
URL / slug
redirect implications
indexability
policy restrictions
```

---

## 31.7 Publish Verification

After publish:

```text
fetch published URL / object
verify expected content hash or semantic equivalence
verify HTTP / provider status
verify canonical
verify indexability configuration
verify structured data availability
verify internal links
emit publication event
```

---

## 31.8 Idempotency & Failure Handling

Publishing capabilities MUST define:

```text
idempotency key
retry behavior
timeout behavior
duplicate request behavior
partial failure handling
remote concurrent edit behavior
rollback behavior
```

---

## 31.9 Risk / Authority Mapping

Publishing policy SHOULD classify operations rather than assuming all writes have identical risk.

Example categories:

```text
create draft
update draft
schedule
publish reversible web content
publish regulated/high-impact content
unpublish
redirect
delete
rollback
```

Actual:

```text
risk tier
authority level
mandatory gate bundle
human approval
```

must be policy-driven.

---

# 32. Measurement & Attribution Architecture

Measurement determines whether the system produced useful outcomes.

It MUST separate:

```text
raw observations
derived metrics
experiments
business outcomes
interpretations
decisions
```

---

## 32.1 Measurement Layers

### Layer A — Search Visibility

```text
impressions
clicks
CTR
position / visibility
query coverage
URL coverage
```

### Layer B — AI Visibility

```text
mentions
citations
prompt coverage
surface coverage
entity correctness
competitor co-occurrence
```

### Layer C — Engagement

```text
sessions
engaged sessions
time
scroll / interaction where defensible
task completion
```

### Layer D — Conversion

```text
lead
signup
purchase
booking
call
revenue
qualified outcome
```

### Layer E — Content Lifecycle

```text
decay
freshness
source change
query shift
competitor displacement
conversion degradation
```

---

## 32.2 Metric Definition Contract

Every important metric SHOULD define:

```yaml
metric_definition:
  id:
  version:
  name:

  numerator:
  denominator:

  filters:
  segmentation:

  aggregation:
  attribution_window:

  timezone:
  currency:

  source_systems: []

  quality_checks: []

  interpretation_limits: []
```

This prevents ambiguous claims such as:

```text
"AI visibility increased 20%"
```

without defining what 20% means.

---

## 32.3 AI Visibility Denominators

LLMO/GEO measurements MUST state:

```text
number of prompts
unique prompts
number of runs
surfaces
markets
locales
time window
weights
```

Example:

```text
Weighted Mention Rate
=
sum(prompt_weight × mention_indicator)
/
sum(prompt_weight)
```

This formula is valid only when the sampling contract is defined.

---

## 32.4 Search Performance Baselines

Comparisons SHOULD consider:

```text
prior period
year-over-year where relevant
seasonality
site-wide trend
query-mix changes
tracking changes
algorithm/platform changes
publication date
```

Avoid interpreting every short-term change as caused by the most recent content edit.

---

## 32.5 Attribution

The architecture MUST permit multiple attribution models.

Possible models:

```text
last non-direct
first touch
position-based
data-driven provider metric
campaign-specific
experiment-based causal estimate
```

No single attribution model should be treated as universal truth.

---

## 32.6 Content Decay Detection

Proposed method:

```text
measurement.content_decay_detection
```

Signals MAY include:

```text
search visibility decline
query coverage decline
AI citation decline
conversion decline
source staleness
content age
competitor displacement
entity inconsistency
broken links
technical eligibility changes
```

Output:

```text
Observation
→ Refresh Context
→ canonical Decision
```

---

## 32.7 Measurement Data Quality

Gate dimensions:

```text
missing data
duplicate events
timezone mismatch
currency mismatch
sampling
provider API gaps
tracking changes
bot contamination
identity resolution limitations
attribution limitations
```

---

## 32.8 Measurement Outputs

```text
SearchPerformanceSnapshot
AIVisibilitySnapshot
EngagementSnapshot
ConversionSnapshot
ContentPerformance
DecayObservation
ExperimentResult
OutcomeLink
MeasurementReport
```

---

# 33. Cross-domain Content Production & Lifecycle

All domain methods converge into one content lifecycle.

The system MUST avoid separate production pipelines such as:

```text
SEO Writer
GEO Writer
AEO Writer
LLMO Writer
```

that independently create conflicting drafts.

Instead:

```text
Business Goal
↓
Search / Audience / Market Research
↓
SEO Analysis
+
GEO Analysis
+
AEO Analysis
+
LLMO Observation
+
Entity Analysis
+
Local / ASO / SXO context as applicable
↓
Content Strategy Decision
↓
Evidence Pack
↓
Content Brief
↓
Outline
↓
Draft
↓
Cross-domain QA
↓
Human Review
↓
Publish
↓
Measure
↓
Refresh Context
↓
Canonical Decision
```

---

## 33.1 Requirement Merge

A Content Brief SHOULD merge domain requirements into one non-conflicting set:

```yaml
requirements:
  seo: []
  geo: []
  aeo: []
  llmo: []
  entity: []
  local: []
  sxo_cro: []
  aso: []
  brand: []
  policy: []
```

If two requirements conflict:

```text
identify conflict
↓
retrieve governing evidence/policy
↓
resolve by scoped authority
↓
record rationale
↓
human review when unresolved
```

---

## 33.2 Content Production Types

The same architecture supports:

```text
article
guide
landing page
product page
category page
service page
local page
comparison page
FAQ
knowledge-base article
case study
app-store listing
support content
```

Each content type has a profile, not a separate core system.

---

## 33.3 Content QA Sequence

Recommended sequence:

```text
Evidence / Claim Validation
↓
Official-vs-Heuristic Classification
↓
Search Intent
↓
SEO Technical / Content
↓
GEO Answerability / Citation Readiness
↓
AEO Question / Direct Answer
↓
Entity Consistency
↓
Local / ASO requirements if applicable
↓
Brand
↓
SXO / CRO
↓
Accessibility
↓
Publishing Validation
↓
Human Review
```

---

## 33.4 Lifecycle Decisions

All lifecycle recommendations feed canonical Decision:

```text
CREATE
KEEP
REFRESH
REWRITE
MERGE
SPLIT
REPOSITION
REDIRECT
UNPUBLISH
REMOVE
NOINDEX
INVESTIGATE
```

No domain is allowed to create a competing Decision object.

---

## 33.5 Domain Method Catalog

Minimum proposed method catalog:

```text
SEO
- seo.query_discovery
- seo.search_intent_analysis
- seo.search_surface_analysis
- seo.crawlability_analysis
- seo.indexability_analysis
- seo.canonical_analysis
- seo.internal_link_analysis
- seo.cannibalization_analysis
- seo.structured_data_analysis
- seo.entity_coverage_analysis

GEO
- geo.answerability_analysis
- geo.citation_readiness_analysis
- geo.passage_independence_analysis
- geo.entity_clarity_analysis
- geo.question_coverage_analysis

AEO
- aeo.question_discovery
- aeo.question_classification
- aeo.answer_type_selection
- aeo.direct_answer_analysis
- aeo.structured_answer_eligibility_analysis

LLMO
- llmo.prompt_set_design
- llmo.answer_snapshot_analysis
- llmo.brand_mention_analysis
- llmo.citation_analysis
- llmo.entity_representation_analysis

ENTITY
- entity.resolve_identity
- entity.consistency_analysis

LOCAL
- local.intent_analysis
- local.profile_consistency_analysis
- local.landing_page_analysis
- local.reputation_observation

CONTENT
- content.topic_discovery
- content.topic_clustering
- content.content_gap_analysis
- content.topic_prioritization
- content.brief_synthesis
- content.refresh_analysis

SXO / CRO
- sxo.message_match_analysis
- cro.friction_analysis
- cro.cta_analysis

ASO
- aso.query_research
- aso.metadata_analysis
- aso.competitor_listing_analysis
- aso.creative_analysis
- aso.review_theme_analysis
- aso.localization_analysis
- aso.listing_conversion_analysis

MEASUREMENT
- measurement.content_decay_detection
- measurement.ai_visibility_analysis
- measurement.search_performance_analysis
- measurement.conversion_analysis
```

This catalog is proposed domain content.

Each executable method still requires a real AI-LEGO Method Contract before runtime use.

---

## 33.6 Domain Capability Catalog

Typical capabilities needed by the above methods:

```text
search.collect_snapshot
search.fetch_page
search.fetch_site_crawl
search.collect_query_metrics
search.collect_ai_answer_snapshot

knowledge.retrieve_evidence
knowledge.resolve_entity
knowledge.retrieve_brand_fact

content.generate_brief
content.generate_outline
content.generate_draft
content.bind_citations

publishing.create_draft
publishing.update_draft
publishing.preview
publishing.publish
publishing.rollback
publishing.verify

measurement.collect_search_performance
measurement.collect_ai_visibility
measurement.collect_analytics
measurement.collect_conversion
```

Capability existence must be distinguished from proposal status.

---

## 33.7 Definition of Domain Completeness

A domain is not considered implemented merely because its name exists in a folder.

Minimum completion:

```text
Domain Objective Defined
+
Inputs Defined
+
Method Contract Exists
+
Capabilities Exist
+
Typed Output Exists
+
Quality Gates Exist
+
Validated Recipe Exists
+
Workflow IR Compiles
+
Measurement Exists
+
Refresh / Decision Loop Exists
+
Tests Pass
```

Only then may the domain be labeled:

```text
END_TO_END_VERIFIED
```


# 34. SEO Quality Gates

Potential gates:

```text
Search Intent Gate
Title / Meta Gate
Heading Structure Gate
Crawlability Gate
Indexability Gate
Canonical Gate
Internal Linking Gate
Structured Data Gate
Entity Coverage Gate
Content Duplication Gate
Cannibalization Gate
Freshness Gate
```

---

# 35. GEO / AEO / LLMO Quality Gates

Potential gates:

```text
Direct Answerability Gate
Citation Readiness Gate
Claim Evidence Gate
Entity Clarity Gate
Source Authority Gate
Source Freshness Gate
Question Coverage Gate
Passage Independence Gate
Structured Explanation Gate
Contradiction Gate
Unsupported Platform Claim Gate
```

These must not claim to represent official platform ranking rules unless supported by official evidence.

---

# 36. Brand Quality Gates

Potential gates:

```text
Brand Voice Gate
Brand Positioning Gate
Product Fact Gate
Pricing Fact Gate
Unsupported Claim Gate
Forbidden Claim Gate
Entity Consistency Gate
Terminology Gate
```

---

# 37. Conversion / SXO Quality Gates

Potential gates:

```text
Message Match Gate
User Journey Gate
CTA Gate
Trust Signal Gate
Friction Gate
Accessibility Gate
Mobile Experience Gate
Conversion Path Gate
```

Where quantitative claims exist, they should be supported by measurable evidence.

---

# 38. Publishing Engine

AI LEGO provides the platform primitives needed to govern publishing:

- Workflow / Execution
- Authority
- Risk / Gates
- Policy evaluation
- Human approval
- Audit / Event Ledger
- Versioning / rollback semantics
- Artifact publication events

At the review baseline, this does **not** mean a complete SearchContent publishing policy or CMS adapter runtime already exists.

SearchContent must add publishing-specific policy and provider adapters while reusing the AI-LEGO governance primitives.

## 38.1 Suggested Adapters

```text
WordPress
Shopify
Webflow
Contentful
Sanity
Strapi
Git-based CMS
Custom CMS
```

## 38.2 Publishing Operations

```text
Create Draft
Update Draft
Preview
Diff
Approve
Schedule
Publish
Unpublish
Rollback
Verify
```

## 38.3 Page Metadata

Publishing may manage:

```text
title
meta description
canonical
robots
hreflang
structured data
internal links
image alt
Open Graph
sitemap inclusion
```

## 38.4 Publishing Authority Policy

Each operation must map to:

```text
risk tier
authority ceiling
required gates
human approval requirement
rollback requirement
```

Not every publish action is automatically the same authority tier. Regulated or high-impact external publication may require higher authority than creation of a CMS draft.

SearchContent MUST define this mapping in a versioned publishing policy rather than assuming a single `Human Review → Publish` rule.

# 39. Publishing Safety

Publishing should remain policy-controlled.

Recommended flow:

```text
Artifact
↓
Publishing Validation
↓
Policy Check
↓
Human Approval
↓
CMS Adapter
↓
Publish
↓
Verification
↓
Publication Event
```

No AI agent should directly bypass publishing policy.

---

# 40. Content Publication Object

`ContentPublication` is a valid SearchContent vertical object because it represents the relationship between a canonical Artifact and a real publication channel / URL. It does not replace Artifact.

At the review baseline, the canonical AI-LEGO Artifact record contract is a dependency whose machine-readable record schema is not yet available. Until that dependency is resolved, `artifact_ref` should remain a governed soft reference rather than causing SearchContent to invent a competing Artifact model.

```yaml
content_publication:
  id: CP-001

  tenant_ref:
  workspace_ref:
  project_ref:

  artifact_ref:
  content_brief_ref:

  channel:
    type: WEBSITE

  cms:
    provider: WORDPRESS
    site_ref:

  url:
  published_version:

  published_at:
  publish_execution_ref:

  verification:
    http_status:
    canonical_verified:
    schema_verified:
    indexability_verified:

  rollback_ref:
  provenance:
```

Once a canonical Artifact contract exists, this object should hard-reference it according to the AI-LEGO repository / contract conventions rather than redefining Artifact fields locally.

# 41. Measurement Layer

Platform observability and content performance are different concerns.

AI LEGO continues to measure:

```text
Workflow Failure
Model Error
Retrieval Quality
Cost
Latency
Quality Regression
Security
SLA
```

Search & Content adds:

```text
Search Impressions
Search Clicks
CTR
Average Position
AI Citation
AI Mention
Brand Mention
Referral Traffic
Engagement
Lead
Conversion
Revenue
Content Decay
```

---

# 42. Measurement Adapters

Possible integrations:

```text
Google Search Console
Google Analytics
Bing Webmaster Tools
Rank Tracking Providers
AI Visibility Trackers
CRM
Commerce Platform
CMS
```

All third-party integrations should use provider adapters.

---

# 43. ContentPerformance

```yaml
content_performance:
  id: PERF-001

  publication_id: CP-001

  period:
    start:
    end:

  search:
    impressions:
    clicks:
    ctr:
    avg_position:

  ai_visibility:
    citations:
    mentions:

  engagement:
    sessions:
    engaged_sessions:
    avg_engagement_time:

  conversion:
    leads:
    purchases:
    revenue:

  snapshot_at:
```

---

# 44. Content Learning Loop

The complete system should be:

```text
Research
↓
Strategy
↓
Brief
↓
Content
↓
Publish
↓
Search / AI Visibility
↓
Engagement
↓
Conversion
↓
Outcome
↓
Learn
↓
Refresh / Rewrite / Merge / Remove
```

---

# 45. Refresh Context & Canonical Decision Reuse

SearchContent MUST NOT define an independent `RefreshDecision` decision model.

AI LEGO already owns the canonical Decision object. Content refresh is a **decision context**, not a different kind of decision primitive.

## 45.1 Correct Model

```text
Content Performance
+
Search Observation
+
Source / Claim Change
+
Business Context
↓
Refresh Context
↓
AI-LEGO Decision
↓
Human Judgment / Approval
↓
Outcome
```

---

## 45.2 Refresh Context

```yaml
content_refresh_context:
  id: RC-001

  publication_ref: CP-001

  trigger_refs:
    - traffic_decline
    - stale_source
    - platform_rule_change

  evidence_refs: []
  performance_refs: []
  search_snapshot_refs: []

  decision_ref: DEC-001

  created_by_execution:
  provenance:
```

---

## 45.3 Canonical Decision Options

The referenced AI-LEGO Decision may evaluate options such as:

```text
KEEP
REFRESH
REWRITE
MERGE
SPLIT
REDIRECT
REMOVE
NOINDEX
INVESTIGATE
```

The Decision object remains responsible for criteria, evidence snapshot, assumptions, unknowns, recommendation, confidence, human judgment, reversal conditions, monitoring, and outcome.

SearchContent owns only the content-specific context and option vocabulary.

# 46. Change Detection

Official sources should support change monitoring.

Pipeline:

```text
Source Registry
↓
Fetch
↓
Normalize
↓
Hash
↓
Compare
↓
Diff
↓
Classify Change
↓
Update Evidence
↓
Identify Affected Claims
↓
Identify Affected Content
↓
Create Refresh Candidates
```

This is especially important for:

- Search platform documentation
- AI search documentation
- Structured data documentation
- Platform policies
- Developer documentation
- Standards

---

# 47. Search Source Registry / Profile

AI LEGO owns the canonical Source concept. At the review baseline, a canonical machine-readable Source record schema is not yet available, so SearchContent MUST NOT silently become the owner of a replacement Core Source record.

The vertical should maintain a **SearchSourceProfile / registry overlay** that points to a canonical `source_ref` and stores search-specific classification and operating policy.

## 47.1 Proposed Search Source Profile

```yaml
search_source_profile:
  id: SSP-001

  source_ref: SRC-001

  search_domains:
    - SEO
    - AI_SEARCH
    - STRUCTURED_DATA

  platforms:
    - GOOGLE_SEARCH

  crawl_policy:
    enabled: true

  authority_policy_ref: search-content-authority-v1
  freshness_policy_ref: search-content-freshness-v1

  preferred_locale:
  preferred_market:

  profile_status: ACTIVE
```

The canonical Source owner should eventually provide identity / locator / publisher / provenance fields. SearchContent should reference those values rather than duplicate them as its own source truth.

---

## 47.2 Initial Authority Sources

Profiles may be created for sources such as:

```text
Google Search Central
OpenAI official documentation
Bing Webmaster documentation
Schema.org
Peer-reviewed research
High-quality industry research
```

Their authority tier is determined by the Search-domain Authority Policy for the relevant claim scope, not embedded as an unconditional global publisher ranking.

# 48. Ingestion Flow

Reuse AI LEGO ingest capabilities.

Search-content specific flow:

```text
Source Registry
↓
Crawler / API
↓
Raw Source
↓
Normalize
↓
Metadata
↓
Section-aware Chunking
↓
Claims
↓
Entities
↓
Embeddings
↓
Evidence Graph
↓
Index
```

Avoid blind fixed-length chunking where source structure is available.

Preferred:

```text
Document
→ Heading
→ Section
→ Paragraph
```

---

# 49. Knowledge Card

Long documents may have a derived Knowledge Card for human and machine convenience.

The card MUST be treated as a **derived representation / materialized knowledge view**, not as a replacement source of truth.

```yaml
knowledge_card:
  id: KC-001

  source_ref:
  evidence_refs: []

  title:
  summary:
  core_rules: []
  do: []
  dont: []

  generated_from:
    source_hash:
    knowledge_snapshot:

  generated_by_execution:
  generated_at:
  review_after:

  provenance:
```

If the source changes, the card must be invalidated, regenerated, or explicitly marked stale.

The authoritative chain remains:

```text
Knowledge Card
→ Evidence / Claim
→ Source
```

not the other way around.

# 50. Brand Knowledge

Brand knowledge should reuse the AI LEGO knowledge/evidence model.

Recommended brand entities:

```text
Company
Brand
Person
Product
Service
Location
Offer
Price
Feature
Audience
Case Study
FAQ
Policy
```

Relationships:

```text
Person → founderOf → Company
Company → owns → Brand
Brand → offers → Product
Product → hasFeature → Feature
Brand → serves → Audience
```

Do not create an isolated "Brand RAG" if these entities can live in the shared knowledge graph.

---

# 51. Hybrid Retrieval Router

SearchContent may decide which retrieval modes are appropriate for a query, but it MUST NOT become a second global planner or orchestration runtime.

The router is best modeled as a SearchContent Method and/or Capability that compiles into the existing AI-LEGO Workflow / execution path.

```text
SearchContent Query
↓
Domain Retrieval Planning Method / Capability
↓
Intent Classification
↓
┌─────────────────────┬─────────────────────┬─────────────────────┐
│ Knowledge Retrieval │ Structured SQL      │ Live Search          │
│ Vector / FTS / Graph│ Brand / Product     │ Current information  │
└─────────────────────┴─────────────────────┴─────────────────────┘
↓
AI-LEGO Retrieval / Repository ports
↓
Reranking Policy
↓
Evidence Pack
```

The SearchContent router owns domain routing semantics only; Workflow IR remains the executable orchestration representation.

# 52. Proposed Capabilities

The following IDs are **PROPOSED SearchContent Capability Contracts**, not claims that the runtime currently implements them.

Each executable capability MUST receive a machine-readable Capability Contract before it may appear in a compiled Workflow IR.

```text
search.collect_snapshot
search.extract_observations
search.classify_intent
search.cluster_queries
search.detect_content_gap
search.detect_cannibalization
search.compare_competitors
search.build_evidence_pack

content.build_strategy
content.generate_brief
content.generate_outline
content.generate_draft
content.bind_citations
content.validate_seo
content.validate_geo
content.validate_entity
content.validate_brand
content.validate_conversion

publishing.create_draft
publishing.publish
publishing.rollback
publishing.verify

measurement.collect_search_performance
measurement.collect_ai_visibility
measurement.collect_conversion
measurement.detect_decay

content.build_refresh_context
```

Required lifecycle:

```text
Proposed capability
→ Capability Contract
→ Registry / validation
→ Implementation
→ Runtime verification
→ Workflow IR use
```

SearchContent MUST NOT use an uncontracted capability as if it were already available.

# 53. Proposed Methods

The following IDs are **PROPOSED Cognitive Methods**.

They use the AI-LEGO Method ID grammar `<family>.<name>` and should be implemented through the existing Cognitive Method system rather than a SearchContent-specific reasoning runtime.

```text
search.intent_analysis
search.query_clustering
search.topic_clustering
search.content_gap_analysis
search.competitor_content_analysis
search.entity_gap_analysis
search.source_conflict_analysis
search.evidence_authority_analysis

content.topic_prioritization
content.brief_synthesis
content.internal_link_planning
content.refresh_prioritization

geo.answerability_analysis
geo.citation_readiness_analysis
geo.entity_clarity_analysis
```

A domain-pack entry is not sufficient by itself.

Required lifecycle:

```text
/cognitive/domain-packs/search-content/...     # Errata E-04: superseded by ADR-021 §D8
↓
method implementation
↓
Method Contract
↓
methods/contracts/<id>.contract.yaml
↓
method registry
↓
validator / method resolution
↓
Recipe / Workflow IR
```

Methods MUST distinguish domain reasoning from execution capabilities.

# 54. Proposed Recipes

SearchContent Recipes MUST reuse the canonical AI-LEGO Recipe schema and Workflow compilation path.

Normative rule:

```text
All SearchContent Recipes
MUST validate against the canonical Recipe Contract.

All executable SearchContent workflows
MUST compile to Workflow IR.

SearchContent MUST NOT introduce
another executable workflow representation.
```

## 54.1 New Content Recipe

```text
Business Goal
↓
Search Research
↓
Topic Opportunity / Decision
↓
Evidence Retrieval
↓
Content Brief
↓
Outline
↓
Draft
↓
SEO / GEO / Entity / Brand QA
↓
Human Review
↓
Publish
↓
Measure
```

## 54.2 Refresh Existing Content Recipe

```text
Performance Decline
or
Source / Platform Change
↓
Refresh Context
↓
Current Search Snapshot
↓
Current Evidence
↓
Canonical Decision
↓
Refresh Brief
↓
Rewrite / Merge / Keep / Other Action
↓
QA
↓
Human Review
↓
Publish New Version if approved
↓
Measure
```

## 54.3 Platform Rule Change Recipe

```text
Official Source Change
↓
Diff
↓
Affected Claims
↓
Affected Briefs / Publications
↓
Impact Analysis
↓
Canonical Decision
↓
Human Review
```

A Recipe is author-facing declarative orchestration; runtime execution remains Workflow IR.

# 55. Proposed Events

SearchContent MUST reuse the AI-LEGO Event Ledger rather than create a second event store.

The existing Event Ledger uses an open event-type namespace, so SearchContent may introduce domain events such as:

```text
SearchSnapshotCaptured
SearchObservationCreated
TopicClusterCreated
ContentOpportunityCreated
ContentBriefCreated
ContentBriefApproved
ContentDraftGenerated
ContentQualityGateFailed
ContentQualityGatePassed
ContentPublished
ContentPerformanceCaptured
ContentDecayDetected
RefreshContextCreated
OfficialSourceChanged
ClaimSuperseded
```

For production use, each event should define:

```text
aggregate ownership
payload contract
tenant/workspace/project scope
producer capability/method
provenance requirements
version
idempotency behavior
```

No SearchContent-specific Event Ledger is required.

# 56. SearchContent Artifact Type Catalog

SearchContent should reuse the canonical AI-LEGO Artifact concept.

At the review baseline, a canonical machine-readable Artifact record schema / global artifact-type registry is not yet available. Therefore the following list is a **vertical artifact-type catalog**, not a platform-global enum owned by SearchContent.

```text
CONTENT_STRATEGY
CONTENT_BRIEF
CONTENT_OUTLINE
ARTICLE
LANDING_PAGE
PRODUCT_PAGE
CATEGORY_PAGE
FAQ
COMPARISON_PAGE
LOCAL_PAGE
APP_STORE_LISTING
CONTENT_AUDIT
SEARCH_INTELLIGENCE_REPORT
```

Once the canonical Artifact contract / registry is available, this catalog should integrate through extension/profile semantics rather than redefining Artifact itself.

# 57. Quality Gate Bundle

SearchContent can define domain-specific and method-specific gates, but MUST NOT create a second platform Global / High-risk gate catalog.

Suggested domain gate IDs:

```text
search_content.evidence
search_content.source_authority
search_content.freshness
search_content.citation
search_content.search_intent
search_content.seo
search_content.geo_answerability
search_content.entity
search_content.brand
search_content.conversion
search_content.accessibility
```

These gates compose with AI-LEGO platform gates and are emitted through the canonical Gate Result mechanism.

A high-level SearchContent bundle may include:

```text
Evidence Gate
Source Authority Gate
Freshness Gate
Citation Gate
Search Intent Gate
SEO Gate
GEO / AEO Gate
Entity Gate
Brand Gate
Conversion Gate
Accessibility Gate
Policy Gate
Human Review Gate
```

Platform-wide Global / High-risk gate ownership remains outside the SearchContent vertical.

# 58. Publishing / Measurement Separation

Do not merge publishing with measurement.

```text
Artifact
↓
Publishing
↓
Publication
↓
Measurement
↓
Performance
↓
Outcome
```

This allows:

- Multiple publications from one artifact
- Different channels
- Re-publication
- Version comparison
- Experiment comparison

---

# 59. Experiment Support

Content experiments should reuse the AI-LEGO Experiment / Decision / Outcome concepts rather than define an independent experimentation truth model.

Examples:

```text
Title Experiment
CTA Experiment
Layout Experiment
Content Depth Experiment
FAQ Experiment
Schema Experiment
Internal Link Experiment
```

A content experiment should preserve:

```text
Hypothesis
Treatment
Control
Metric
Sample
Duration
Result
Decision
Outcome
```

At the review baseline, Experiment / Outcome are architectural reuse targets whose exact machine-readable contract maturity must be verified before implementation.

Therefore SearchContent MUST treat canonical Experiment / Outcome contracts as prerequisites and MUST NOT create a competing core experiment model merely to unblock the vertical.

# 60. Logical Ownership Layout

The following structure describes **logical bounded-context ownership only**.

It is NOT the physical repository path source of truth.

Per AI-LEGO repository governance, final physical paths MUST be reconciled through the accepted Repository Architecture / ADR process rather than being independently fixed by this domain document.

Illustrative logical ownership:

```text
SearchContent
├── Search Intelligence
│   ├── Queries
│   ├── Surfaces
│   ├── Snapshots
│   ├── Observations
│   └── Competitors
│
├── Strategy
│   ├── Topic Clusters
│   ├── Content Gaps
│   ├── Prioritization
│   └── URL Mapping
│
├── Planning
│   ├── Briefs
│   ├── Outlines
│   └── Internal Linking
│
├── Production
│   ├── Drafting
│   └── Citation Binding
│
├── Quality
│   ├── SEO
│   ├── GEO
│   ├── Entity
│   ├── Brand
│   └── Conversion
│
├── Publishing
│   ├── Adapters
│   └── Verification
│
├── Measurement
│   ├── Search
│   ├── AI Visibility
│   ├── Analytics
│   ├── Conversion
│   └── Decay
│
└── Refresh
    ├── Context
    └── Content Actions
```

Expected integration points include the existing AI-LEGO locations for:

```text
cognitive domain packs
method contracts / registry
capability contracts
validated recipes
policies
machine-readable specs
```

The exact directories are finalized by repository architecture governance, not by this document.

# 61. Proposed SearchContent Specs

The following are backlog candidates, subject to final repository-path governance:

```text
search-query.schema.yaml
search-surface.schema.yaml
search-snapshot.schema.yaml
search-observation.schema.yaml
topic-cluster.schema.yaml
content-brief.schema.yaml
evidence-pack.schema.yaml
content-publication.schema.yaml
content-performance.schema.yaml
content-refresh-context.schema.yaml
authority-assessment.schema.yaml
freshness-assessment.schema.yaml
search-source-profile.schema.yaml
```

Important ownership exclusions:

```text
DO NOT create SearchContent-owned:
- source.schema.yaml as a replacement Core Source
- artifact.schema.yaml as a replacement Core Artifact
- decision.schema.yaml
- evidence.schema.yaml
- workflow-ir.schema.yaml
- event-ledger.schema.yaml
```

Core gaps must be resolved by AI-LEGO core owners.

# 62. Proposed SearchContent Policies

Policy backlog candidates include:

```text
search-source-authority.policy.yaml
search-source-freshness.policy.yaml
evidence-reranking.policy.yaml
unsupported-platform-claim.policy.yaml
publishing-authority.policy.yaml
content-refresh.policy.yaml
```

These policies MUST compose with existing AI-LEGO Authority, Risk, Gate, Jurisdiction, Privacy, Security, and Execution policy mechanisms.

They MUST NOT recreate those platform systems inside the SearchContent vertical.

# 63. MVP Scope

The MVP is feasible as an architectural vertical slice, but implementation must begin only after the integration prerequisites in SC-Phase 0 are satisfied.

Target MVP:

```text
30–50 high-authority sources / profiles
↓
Source import / registry integration
↓
Normalize
↓
Evidence / Claims / Entities
↓
AI-LEGO vector + FTS + graph retrieval
↓
Authority / Freshness Assessment
↓
Search Intelligence for selected surfaces
↓
Content Brief
↓
Draft
↓
SEO / GEO / Citation Gates
↓
Human Review
↓
CMS Draft / Publish Adapter
↓
Search Performance Measurement
```

Required implementation dependencies include:

```text
Core Source contract resolution
Core Artifact contract resolution
SearchContent Method Contracts
SearchContent Capability Contracts
Validated SearchContent Recipe
Domain gate registration
Publishing authority policy
CMS adapter contract
Measurement adapter contract
```

The MVP MUST NOT bypass missing core contracts by duplicating them locally.

# 64. SearchContent Delivery Plan

To avoid collision with AI-LEGO program phases, SearchContent uses the prefix `SC-Phase`.

## SC-Phase 0 — AI-LEGO Integration & Ownership Convergence

Resolve before vertical implementation:

```text
SearchContent bounded-context ownership
Core Source contract dependency
Core Artifact contract dependency
Experiment / Outcome contract dependency
Method namespace / lifecycle
Capability namespace / lifecycle
Gate namespace
Event aggregate ownership
Publishing risk / authority mapping
Physical repository-path ownership
Maturity baseline
```

Exit criteria:

- No duplicated Source / Evidence / Claim / Decision / Artifact / Workflow / Event model.
- Every proposed executable ID has an identified contract owner.
- Physical paths are approved by repository architecture governance.
- Cross-core references have a documented resolution.

---

## SC-Phase 1 — Domain Foundation

Build:

```text
Search / Content Domain Pack
Search Source Profile
Authority Assessment Policy
Freshness Assessment Policy
Reranking Policy
Core SearchContent schemas
```

Exit criteria:

- Claim-scope-aware authority assessment works.
- Freshness is policy-versioned and traceable.
- Claims can preserve supporting / contradicting evidence.

---

## SC-Phase 2 — Search Intelligence

Build:

```text
SearchQuery
SearchSurface
SearchSnapshot
SearchObservation
Competitor Observation
Topic Clustering
```

Exit criteria:

- A query can be observed across supported search surfaces.
- Snapshots are versioned and comparable.
- Changes over time are measurable.

---

## SC-Phase 3 — Content Strategy & Decision

Build:

```text
Topic Clusters
Content Gap
URL Mapping
Cannibalization
Content Prioritization Method
Canonical Decision integration
```

Exit criteria:

- System can recommend what should be created, refreshed, merged, kept, or not created through the canonical Decision model.

---

## SC-Phase 4 — Brief & Production

Build:

```text
Evidence Pack
Content Brief
Outline
Draft
Citation Binding
```

Exit criteria:

- Drafts are grounded in a traceable retrieval/evidence snapshot.
- Important claims can resolve to canonical Claim / Evidence / Source provenance.

---

## SC-Phase 5 — Quality

Build:

```text
SEO Gate
GEO / AEO Gate
Entity Gate
Brand Gate
Conversion Gate
```

Exit criteria:

- Domain gates emit canonical Gate Results.
- Unsupported claims fail closed or require review according to policy.

---

## SC-Phase 6 — Publishing

Build:

```text
Publishing Authority Policy
CMS Adapter Contract
Draft Creation
Diff
Approval
Publish
Rollback
Verification
```

Exit criteria:

- Publication is traceable to Artifact ref + Execution + Approval.
- Each publishing action has explicit risk / authority semantics.

---

## SC-Phase 7 — Measurement

Build:

```text
Search performance adapter
Analytics adapter
AI visibility adapter
Conversion measurement
Content decay detection
```

Exit criteria:

- Published content produces traceable measurement observations / Outcomes.

---

## SC-Phase 8 — Learning Loop

Build:

```text
Performance → Refresh Context → Decision
Source Change → Affected Content
Competitor Change → Opportunity
Content Decay → Decision / Rewrite Recipe
```

Exit criteria:

- The system continuously improves content using measured results and evidence changes without introducing a second Decision model.

# 65. Minimum Viable Vertical Slice

Recommended first end-to-end scenario:

```text
Official / Research Sources
↓
Core Source Integration
↓
Ingest / Normalize
↓
Evidence Graph
↓
Authority-aware / Freshness-aware Retrieval
↓
Search Query Research
↓
Content Opportunity
↓
Canonical Decision
↓
Content Brief
↓
Article Draft
↓
SEO / GEO / Citation QA
↓
Human Approval
↓
CMS Draft / Publish
↓
Search Performance Measurement
↓
Refresh Context
↓
Canonical Decision
```

Acceptance criteria:

1. Every important platform claim is traceable to canonical Evidence and Source provenance.
2. Authority ranking is claim-scope-aware; official sources dominate official-policy questions without being treated as universal empirical truth.
3. A published page is linked to its Artifact reference, Brief, Evidence Pack, Execution, and approval record.
4. Search performance can be linked to the published content version.
5. A stale or superseded source can trigger affected-content analysis.
6. Refresh actions are decided through the canonical AI-LEGO Decision model.
7. Every executable SearchContent Method / Capability used in the slice has a formal contract.
8. Every SearchContent Recipe validates and compiles to Workflow IR.
9. Domain gates produce canonical Gate Results.
10. No SearchContent-owned duplicate of Source, Evidence, Claim, Decision, Artifact, Workflow IR, or Event Ledger is introduced.

# 66. Non-Goals

This vertical is NOT:

- A standalone RAG product
- A generic AI writer
- A replacement for AI LEGO Knowledge Engine
- A second workflow engine
- A second evidence graph
- A second artifact model
- A second policy engine
- A second model gateway

---

# 67. Architectural Invariants

```text
ONE CANONICAL EVIDENCE SYSTEM.

ONE CANONICAL KNOWLEDGE / RETRIEVAL SUBSTRATE.

ONE CANONICAL WORKFLOW / EXECUTION MODEL.

ONE CANONICAL DECISION MODEL.

ONE CANONICAL EVENT LEDGER.

ONE CANONICAL ARTIFACT MODEL AS A CORE OWNERSHIP INVARIANT.
SEARCHCONTENT MUST NOT SUBSTITUTE ITS OWN ARTIFACT CORE WHILE THAT CONTRACT IS MISSING.

ONE CANONICAL SOURCE MODEL AS A CORE OWNERSHIP INVARIANT.
SEARCHCONTENT MUST NOT SUBSTITUTE ITS OWN SOURCE CORE WHILE THAT CONTRACT IS MISSING.

SEARCH / CONTENT LOGIC LIVES IN ITS DOMAIN PACK AND VERTICAL.

EXTERNAL AUTHORITY IS CLAIM-SCOPE-AWARE.
OFFICIAL AUTHORITY IS NOT A UNIVERSAL SUBSTITUTE FOR EMPIRICAL TRUTH.

FRESHNESS IS AN ASSESSMENT / POLICY DIMENSION, NOT A SECOND SOURCE TRUTH MODEL.

EVIDENCE PACKS ARE REPRODUCIBLE SNAPSHOTS, NOT CANONICAL EVIDENCE RECORDS.

OFFICIAL PLATFORM CLAIMS REQUIRE TRACEABLE EVIDENCE.
INDUSTRY SPECULATION MUST NOT BE PRESENTED AS OFFICIAL POLICY.

CONTENT GENERATION MUST FOLLOW RESEARCH AND BRIEFING.

SEARCHCONTENT METHODS MUST USE AI-LEGO METHOD CONTRACTS / REGISTRY.
SEARCHCONTENT CAPABILITIES MUST USE AI-LEGO CAPABILITY CONTRACTS.
SEARCHCONTENT RECIPES MUST COMPILE TO WORKFLOW IR.

SEARCHCONTENT GATES ARE DOMAIN / METHOD-SPECIFIC GATES.
THEY MUST NOT REPLACE THE PLATFORM GLOBAL / HIGH-RISK GATE CATALOG.

PUBLISHING MUST BE POLICY-CONTROLLED AND AUTHORITY-AWARE.

MEASUREMENT MUST FEED BACK INTO CANONICAL DECISIONS AND CONTENT ACTIONS.

ARCHITECTURE-DEFINED ≠ SCHEMA-DEFINED ≠ RUNTIME-IMPLEMENTED.
MATURITY MUST BE EXPLICIT.

AI MAY GENERATE.
AI MAY RECOMMEND.
AI MUST NOT SILENTLY PROMOTE UNSUPPORTED CLAIMS TO FACT.

HUMANS RETAIN FINAL AUTHORITY WHERE REQUIRED BY RISK / POLICY.
```

# 68. Final Target Architecture

```text
                         Agency OS
                            │
                            ▼
               AI LEGO Platform Core
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   Knowledge            Cognitive           Governance
   / Evidence           / Methods           / Workflow
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
               Search & Content Domain
       ┌────────────────────┼────────────────────┐
       │                    │                    │
Search Intelligence   Content Strategy     Brand Knowledge
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ↓
                      Evidence Pack
                            ↓
                      Content Brief
                            ↓
                         Outline
                            ↓
                          Draft
                            ↓
                      Content QA
       ┌─────────────────────────────────────────┐
       │ Evidence / Authority / Freshness        │
       │ SEO                                     │
       │ GEO / AEO / LLMO                        │
       │ Entity                                  │
       │ Brand                                   │
       │ Conversion                              │
       │ Accessibility                           │
       └─────────────────────────────────────────┘
                            ↓
                       Human Review
                            ↓
                         Publish
                            ↓
                    Search / AI Visibility
                            ↓
                      Traffic / Conversion
                            ↓
                          Outcome
                            ↓
                           Learn
                            ↓
                  Refresh / Rewrite / Merge
```

---

# 69. Recommended Next Architecture Documents

The next documents should prioritize integration convergence before downstream writer implementation.

Recommended order:

```text
1. SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md
2. ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md (→ docs/adr/ADR-021-search-content-boundary-and-ownership.md, Errata E-05)
3. SEARCH_CONTENT_DOMAIN_MODEL.md
4. SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md
5. SEARCH_EVIDENCE_RETRIEVAL_SPEC.md
6. SEARCH_INTELLIGENCE_SPEC.md
7. CONTENT_BRIEF_CONTRACT.md
8. SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md
9. SEARCH_CONTENT_QUALITY_GATES.md
10. PUBLISHING_ADAPTER_CONTRACT.md
11. CONTENT_MEASUREMENT_SPEC.md
12. SEARCH_CONTENT_MVP_VERTICAL_SLICE.md
```

Core AI-LEGO gaps that SearchContent depends on should be resolved by their proper core owners, not inside the vertical:

```text
Canonical Source Contract
Canonical Artifact Contract
Canonical Experiment / Outcome Contracts as required
```

The first implementation priority should NOT be the Writer.

Preferred order:

```text
Integration convergence
→ Domain semantics
→ Evidence authority / freshness policy
→ Retrieval
→ Search intelligence
→ Decision-backed strategy
→ Brief
→ Quality gates
→ Writing
→ Publishing
→ Measurement
→ Learning loop
```

# 70. Final Definition

The intended system is not merely:

```text
Keyword
→ Prompt
→ GPT
→ Article
```

It is:

```text
Business Goal
+
Search Environment
+
Trusted Evidence
+
Brand Knowledge
+
Content Strategy
+
Human Judgment
↓
Content Decision
↓
Content Brief
↓
Evidence-grounded Artifact
↓
Quality Validation
↓
Publishing
↓
Measurement
↓
Learning
```

Therefore the preferred product name is:

> **Search & Content Intelligence OS**

or, when emphasizing the platform relationship:

> **Search & Content Intelligence Vertical for AI LEGO Cognitive Engineering OS**

---

# Errata（2026-09-02）— 附錄

本附錄由 2026-09-02 獨立驗證（`agency-os/reports/audit/2026-09-02-search-content-pack-verification.md`，finding M5／M12）與 ADR-021 落地時加入。**規則**：每一條 in-place 修正都以「一行換一行」進行，本文件的行數與所有 `:LNNN` 引用位置不變（本附錄只附加於檔尾）。本文件維持 `PROPOSED` 敘事正本；規範性內容以 `docs/adr/ADR-021-search-content-boundary-and-ownership.md` 與 `docs/architecture/search-content/` 的 11 份規格文件為準，衝突時以後者為準。

| Errata | 位置 | 修正 | 依據 |
|---|---|---|---|
| E-00 | `:3` | Status 行加註規範性版本指標 | ADR-021 |
| E-01 | `:64` | 「horizontal intelligence runtime」→「horizontal platform / contract substrate and target execution runtime」 | Critical Review SCV3-M-01（`:1036`）；Architecture-defined ≠ Schema-defined ≠ Runtime-implemented |
| E-02 | `:1051-1053` | `required_source_tiers: [P0, P1]` → `null`（原值保留為註解） | Critical Review SCV3-H-02（`:586`）；`CONTENT_BRIEF_CONTRACT.md` FINDING-CB-01；本包 `search_content.evidence.source_authority` gate 採 claim-scope policy，不採固定 tier |
| E-03 | 12 個 H2 標題 | 第二組 `## 25.x`／`## 32.x`／`## 34.x`／`## 41.x` 依所屬 H1 重新編號（見下表），消除「§32.2 指哪一節」的歧義 | Critical Review SCV3-M-12（`:1407`）；驗證報告 M5 |
| E-04 | `:358`、`:4977` | `/cognitive/domain-packs/search-content/` 標記為 superseded；契約落 `methods/contracts/`、`capabilities/contracts/`、`recipes/validated/` | Critical Review SCV3-M-03（`:1110`）；ADR-021 §D8；`REPOSITORY_ARCHITECTURE.md` 無 domain-packs 層 |
| E-05 | §69 | `ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md` 已編號並移至 `docs/adr/ADR-021-search-content-boundary-and-ownership.md` | ADR_INDEX.md |
| E-06 | §55（`:5085-5122`）| 15 個 event 中 `ContentOpportunityCreated`／`ContentDraftGenerated`／`ContentQualityGateFailed`／`ContentQualityGatePassed`／`ContentPublished`／`OfficialSourceChanged`／`ClaimSuperseded` 不建或改名；正式 event registry（13 個，各附 aggregate owner）見 ADR-021 §D6 | Critical Review SCV3-H-05（`:768`）；ADR-021 §D6 |
| E-07 | §52／§53（`:4893-4993`）| 42 個提議 ID 的最終去向（納入／拒絕／DEPENDENCY_REQUEST／OPEN_QUESTION）見 `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` §3–§6 與 `SEARCH_CONTENT_REGISTRY_RECORDS.yaml` | 驗證報告 B6；ADR-021 §D4／§D5 |
| E-08 | §57（`:5147-5188`）| 11 個 flat gate id（`search_content.evidence` 等）由 `search_content.<domain>.<name>` 三段式 catalog 取代，跨領域 evidence gate 獨立為 `search_content.evidence.*` family | `SEARCH_CONTENT_QUALITY_GATES.md` §2／§5.5；驗證報告 M11 |
| E-09 | §11.1（`:705-716`）| `SearchSurface` 為 taxonomy enum、`EntityObservation` 折入 `SearchObservation.raw_observed_entity`，兩者不建獨立 object | ADR-021 §D1／§D3 |

## E-03 標題重新編號對照

| 行 | 原標題 | 新標題 |
|---|---|---|
| `:4324` | `## 25.1 Suggested Adapters` | `## 38.1 Suggested Adapters` |
| `:4337` | `## 25.2 Publishing Operations` | `## 38.2 Publishing Operations` |
| `:4352` | `## 25.3 Page Metadata` | `## 38.3 Page Metadata` |
| `:4369` | `## 25.4 Publishing Authority Policy` | `## 38.4 Publishing Authority Policy` |
| `:4584` | `## 32.1 Correct Model` | `## 45.1 Correct Model` |
| `:4606` | `## 32.2 Refresh Context` | `## 45.2 Refresh Context` |
| `:4631` | `## 32.3 Canonical Decision Options` | `## 45.3 Canonical Decision Options` |
| `:4698` | `## 34.1 Proposed Search Source Profile` | `## 47.1 Proposed Search Source Profile` |
| `:4730` | `## 34.2 Initial Authority Sources` | `## 47.2 Initial Authority Sources` |
| `:5011` | `## 41.1 New Content Recipe` | `## 54.1 New Content Recipe` |
| `:5037` | `## 41.2 Refresh Existing Content Recipe` | `## 54.2 Refresh Existing Content Recipe` |
| `:5065` | `## 41.3 Platform Rule Change Recipe` | `## 54.3 Platform Rule Change Recipe` |
