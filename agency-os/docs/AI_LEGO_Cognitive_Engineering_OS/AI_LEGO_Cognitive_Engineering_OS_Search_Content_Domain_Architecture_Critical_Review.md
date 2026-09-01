# Search & Content Domain Architecture — Comprehensive Critical Review

**Review Status:** COMPLETE  
**Reviewed Document:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`  
**Reviewed Version:** `v3 — COMPREHENSIVE MASTER REVISION`  
**Reviewed Lines:** 1–5880（全文）  
**Reviewed Top-level Sections:** 70 / 70  
**AI-LEGO Architecture Review Baseline:** `awarewaveai-pei/Work@4b26e83612caad72698271545ee1952058cc32dd`  
**Review Scope:** Architecture conformance / ownership / contract compatibility / ADR alignment / maturity claims / duplicate-system risk  
**Explicit Exclusion:** This review does **not** analyze or compare any earlier version of `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`.

---

# 0. Executive Verdict

## 0.1 Final Result

`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3 is **architecturally viable and substantially aligned with AI-LEGO**, but it is **not yet ready to be marked `ACCEPTED` or machine-contract implementation-ready**.

Recommended status:

```yaml
review_verdict:
  conceptual_architecture: ACCEPTABLE
  ai_lego_boundary: ACCEPTABLE_WITH_REVISIONS
  no_second_rag_claim: PASS
  no_second_evidence_system_claim: PASS_WITH_LOCAL_CORRECTIONS
  no_second_workflow_runtime_claim: PASS
  no_second_decision_model_claim: PASS
  no_second_event_ledger_claim: PASS_WITH_EVENT_SEMANTIC_CORRECTIONS
  no_second_artifact_core_claim: PASS
  no_second_source_core_claim: PASS
  method_system_reuse: PASS_IN_PRINCIPLE_BUT_NAMESPACE_CONVERGENCE_REQUIRED
  capability_system_reuse: PASS_IN_PRINCIPLE_BUT_CATALOG_CONVERGENCE_REQUIRED
  gate_system_reuse: PASS
  publishing_governance_reuse: PASS_WITH_MISSING_POLICY_AND_ADAPTER_DEPENDENCIES
  implementation_ready: false
  acceptance_ready: false

recommended_document_status:
  PROPOSED_WITH_REQUIRED_REVISIONS
```

The v3 document now has the correct high-level relationship:

```text
AI LEGO
=
horizontal knowledge / evidence / cognitive / workflow / governance substrate

SearchContent
=
vertical Search / Content semantics
+
domain methods
+
domain observations
+
publishing adapters
+
measurement / feedback
```

That relationship is supported by the AI-LEGO architecture.

The remaining problems are no longer primarily about "building a second RAG." They are mostly:

```text
canonical method-ID convergence
canonical capability catalog convergence
event semantic ownership
core Entity maturity
Source reference maturity
live-web retrieval boundary
ContentBrief authority requirements
measurement-object completeness
document numbering integrity
```

---

# 1. What This Review Can and Cannot Prove

This review compares v3 against the AI-LEGO architecture baseline.

Therefore it can answer questions such as:

```text
Does SearchContent duplicate AI-LEGO Evidence?
Does it duplicate Workflow IR?
Does it define a competing Decision?
Does it violate Repository ownership?
Are Method IDs compatible with the canonical Method grammar?
Are Capability IDs compatible with the Capability Contract?
Are new gates compatible with the existing Gate system?
Can new events use the canonical Event Ledger?
Does the document overstate runtime maturity?
```

AI-LEGO itself cannot prove that a specific SEO, GEO, AEO, LLMO, CRO, or ASO technique empirically works.

Therefore sections defining domain methodology are classified as:

```text
DOMAIN_PROPOSAL
```

when they are structurally compatible with AI-LEGO but require external authoritative / empirical evidence before being promoted to evidence-backed operational rules.

For those domains, the proper evidence authorities are things such as:

```text
official search/platform documentation
standards
peer-reviewed research
empirical UX/CRO research
app-store official documentation
first-party observations
controlled experiments
```

The architecture correctly creates mechanisms to store and classify that evidence, but AI-LEGO specs alone are not evidence that a particular SEO/GEO tactic improves performance.

---

# 2. AI-LEGO Baseline Used for Verification

Primary architecture / governance sources:

```text
Architecture-Constitution-v1.md
docs/architecture/REPOSITORY_ARCHITECTURE.md

specs/evidence/evidence.schema.yaml
specs/evidence/claim.schema.yaml
specs/evidence/evidence-graph.schema.yaml
specs/evidence/sentence-provenance.schema.yaml

specs/decision/decision.schema.yaml

specs/cognitive/method.schema.yaml
specs/cognitive/recipe.schema.yaml

specs/domain/capability-contract.schema.yaml
specs/domain/repository-contract.schema.yaml

specs/workflow/workflow-ir.schema.yaml

specs/execution/gate.schema.yaml
specs/execution/event-ledger.schema.yaml
specs/execution/authority.schema.yaml

methods/contracts/*
methods/registry/*

capabilities/contracts/*

policies/*
specs/artifact/*
specs/domain/*
```

Accepted ADRs materially relevant to this review include:

```text
ADR-001 Scoped Authority
ADR-004 Risk / epistemic canonicalization
ADR-005 Method ID grammar
ADR-006 Repo-layout / mother-document revision governance
ADR-011 Platform Gate ownership
ADR-013 Repository/data architecture ratification
```

---

# 3. Central Claim Verification

## 3.1 "No Second RAG System"

### Verdict

```text
PASS
```

v3 says SearchContent MUST NOT own:

```text
a separate vector database
a separate graph store
a separate full-text index
a separate canonical knowledge repository
```

This is aligned with AI-LEGO.

The active Repository Contract already treats:

```text
semantic_retrieval_vector_index
graph_store
full_text_search_index
event_store
```

as platform storage/retrieval concerns.

`REPOSITORY_ARCHITECTURE.md` also treats Knowledge as:

```text
shared kernel schema
+
independent Knowledge engine
```

rather than something each vertical recreates.

### Required clarification

The **live external web search path** must not be modeled as if it were just another Repository store. See finding `SCV3-H-03`.

---

## 3.2 "No Second Evidence System"

### Verdict

```text
PASS_WITH_LOCAL_CORRECTIONS
```

This claim substantially stands.

The canonical Evidence schema already owns:

```text
source_authority
recency
directness
independence
consistency
geography
sample
method_quality
hierarchy_tier
```

v3 correctly changes SearchContent authority/freshness into:

```text
domain policy
+
assessment snapshot
```

rather than a new Evidence record.

That is the correct ownership boundary.

### Remaining defect

Section 17 still contains:

```yaml
required_source_tiers:
  - P0
  - P1
```

inside `ContentBrief`.

That reintroduces an unconditional tier-oriented requirement even though section 7 correctly states authority is claim-scope-aware.

This must be replaced by claim/evidence requirement semantics.

See `SCV3-H-02`.

---

## 3.3 "No Second Workflow Runtime"

### Verdict

```text
PASS
```

v3 explicitly requires:

```text
Domain Method
→ Method Contract / Capability Contract
→ Recipe
→ Workflow IR
→ Execution
```

This aligns with the active Workflow IR.

AI-LEGO's Workflow IR is the executable form, while Recipe is an author-facing declarative object.

v3 correctly states:

```text
SearchContent MUST NOT introduce
another executable workflow representation.
```

No second workflow runtime is created by the architecture as written.

---

## 3.4 "No Second Decision Model"

### Verdict

```text
PASS
```

v3 correctly models content refresh as:

```text
Refresh Context
→ canonical AI-LEGO Decision
```

and keeps:

```text
criteria
evidence snapshot
assumptions
unknowns
recommendation
confidence
human judgment
reversal conditions
monitoring
outcome
```

inside the canonical Decision object.

This is directly aligned with:

```text
specs/decision/decision.schema.yaml
```

The vertical only owns content-specific:

```text
context
triggers
option vocabulary
```

This boundary stands.

---

## 3.5 "No Second Event Ledger"

### Verdict

```text
PASS_WITH_EVENT_SEMANTIC_CORRECTIONS
```

The active Event Ledger deliberately uses an open PascalCase event namespace.

Therefore SearchContent can add domain events.

However:

```text
open namespace
≠
permission to duplicate an existing event semantic
```

v3 currently proposes:

```text
ContentPublished
ClaimSuperseded
OfficialSourceChanged
```

These require ownership review.

In particular, the AI-LEGO Event Ledger already documents:

```text
ArtifactPublished
```

as an existing canonical event example.

If `ContentPublished` means the same transition for a published Artifact, it is duplicate event semantics.

Likewise:

```text
ClaimSuperseded
```

sounds like a canonical Claim aggregate lifecycle event, not a SearchContent-owned event.

See `SCV3-H-05`.

---

## 3.6 "No Second Artifact System"

### Verdict

```text
PASS
```

v3 explicitly refuses to create:

```text
SearchContent-owned artifact.schema.yaml
```

and correctly labels the canonical Artifact machine-readable record as a baseline dependency.

At the baseline:

```text
specs/artifact/
```

contains:

```text
cas-path.schema.yaml
portable-uri.schema.yaml
```

but no canonical Artifact record schema.

v3 handles this correctly in `ContentPublication` by keeping:

```text
artifact_ref
```

as a governed soft dependency instead of inventing Artifact locally.

---

## 3.7 "No Second Source System"

### Verdict

```text
PASS_WITH_REFERENCE_MATURITY_CORRECTION
```

The ownership principle is correct.

v3 uses:

```text
SearchSourceProfile
```

as an overlay rather than a replacement Source.

However, the current baseline does not have a canonical standalone Source record schema.

The Evidence Graph uses `SRC-*` only as a NEW_DESIGN graph-node ID grammar.

Therefore the master architecture should avoid making:

```text
SRC-001
```

look like a final canonical Source identity format.

See `SCV3-M-04`.

---

# 4. Critical / High Findings

## SCV3-H-01 — Canonical Method Namespace Is Internally Inconsistent

**Severity:** HIGH / blocks contract implementation  
**Affected sections:** 22–33, 53  
**v3 lines:** approximately 1421–4227 and 4946–4993

v3 defines multiple overlapping Method IDs for apparently similar domain operations.

Examples:

```text
seo.search_intent_analysis
vs
search.intent_analysis
```

```text
content.content_gap_analysis
vs
search.content_gap_analysis
```

```text
content.topic_clustering
vs
search.topic_clustering
```

```text
seo.entity_coverage_analysis
vs
search.entity_gap_analysis
```

Not all pairs are necessarily identical, but the current document does not define their semantic distinction.

This matters because AI-LEGO Method IDs are canonical and versioned.

The active Method schema locks IDs to:

```regex
^[a-z_]+\.[a-z_]+$
```

through ADR-005, but syntax validity is not enough.

Two valid IDs representing the same method would still create duplication.

### Required correction

Create one canonical Method Registry table in the master architecture:

```yaml
method:
  canonical_id:
  family:
  purpose:
  inputs:
  outputs:
  distinct_from: []
  aliases: []
  owner:
```

For every potentially overlapping pair, decide:

```text
MERGE
or
DEFINE SEMANTIC DIFFERENCE
```

Example:

```text
seo.search_intent_analysis
=
page/query intent analysis for SEO execution

search.intent_analysis
=
cross-surface intent analysis

```

If this distinction is intended, it must be stated.

If not, one ID must be removed.

---

## SCV3-H-02 — ContentBrief Reintroduces a Simplified P0/P1 Authority Rule

**Severity:** HIGH  
**Affected section:** 17  
**v3 lines:** 1020–1082

Section 7 correctly says:

```text
authority is claim-scope-aware
```

and:

```text
P0/P1/P2/P3 is not an unconditional global truth hierarchy
```

But `ContentBrief` later contains:

```yaml
evidence:
  evidence_pack_id:
  required_source_tiers:
    - P0
    - P1
```

This can be interpreted as:

> every brief requires P0/P1 sources regardless of claim type.

That contradicts the more precise authority model.

### Required correction

Replace:

```yaml
required_source_tiers:
```

with something like:

```yaml
evidence_requirements:
  - claim_scope:
      assertion_type:
      platform:
      jurisdiction:
    accepted_source_classes: []
    minimum_authority_policy_result:
    minimum_directness:
    freshness_requirement:
```

or use policy references:

```yaml
evidence_policy_ref:
authority_policy_ref:
freshness_policy_ref:
```

The brief should consume the authority policy, not hard-code tier labels.

---

## SCV3-H-03 — Live Web Search Is Put on the Wrong Architectural Boundary

**Severity:** HIGH  
**Affected sections:** 9, 51  
**v3 lines:** 567–643, 4866–4892

v3 correctly says:

```text
Vector / FTS / Graph / SQL
```

should reuse AI-LEGO retrieval.

But it also places:

```text
Live Web Search
```

inside the same Repository/Retrieval path.

The active Repository Contract is about system storage/retrieval substrates.

Live external search is different:

```text
external provider capability / tool
```

It should pass through the AI-LEGO capability/tool/provider execution boundary, then its results can be normalized into observations/evidence.

### Correct architecture

```text
SearchContent Retrieval Planning
↓
┌─────────────────────────────────────┐
│ Canonical Knowledge Retrieval       │
│ Vector / FTS / Graph / SQL          │
│ → Repository / Knowledge ports      │
└─────────────────────────────────────┘
+
┌─────────────────────────────────────┐
│ External Freshness Retrieval        │
│ Web / Search API / Provider         │
│ → Capability / Tool / AI Gateway    │
└─────────────────────────────────────┘
↓
Normalize / classify
↓
Evidence / Observation
↓
Rerank
↓
Evidence Pack
```

Do not make a web provider look like a Repository store.

---

## SCV3-H-04 — Entity Maturity Is Overstated

**Severity:** HIGH  
**Affected sections:** 2, 3, 12, 26, 27, 50  
**v3 lines:** 68–236, 797–840, 2608–2914, 4830–4865

v3 treats:

```text
Entity
Relation
```

as if a mature canonical Core record already exists.

At the baseline, `evidence-graph.schema.yaml` explicitly says:

```text
Entity and Relation had zero standalone schema
```

and the graph file creates only a minimal:

```text
entity_node
edge
```

shape, flagged as NEW_DESIGN.

Therefore the correct maturity is closer to:

```text
ENTITY:
  architectural concept: yes
  graph minimal shape: yes
  standalone canonical entity contract: not mature / not available
```

### Required correction

Section 3 should label Entity similarly to Source / Artifact:

```text
Entity | AI LEGO Core concept / Evidence Graph minimal shape;
canonical standalone record maturity is a dependency.
```

Entity SEO / Local SEO / Brand Knowledge may still reuse the graph substrate, but must not silently promote the minimal graph node into a final Core Entity contract.

---

## SCV3-H-05 — Proposed Event Catalog Contains Core-Semantic Duplication Risks

**Severity:** HIGH  
**Affected section:** 55  
**v3 lines:** 5085–5122

The proposed event list includes:

```text
ContentPublished
OfficialSourceChanged
ClaimSuperseded
```

Problems:

### `ContentPublished`

AI-LEGO already has:

```text
ArtifactPublished
```

as an Event Ledger event example.

If SearchContent content is an Artifact, two events for the same state transition create semantic duplication.

Possible resolution:

```text
ArtifactPublished
+
ContentPublicationCreated
```

where:

```text
ArtifactPublished
= core Artifact lifecycle event

ContentPublicationCreated
= vertical Publication aggregate event
```

### `ClaimSuperseded`

A Claim lifecycle transition belongs to the canonical Claim/Evidence owner.

SearchContent may **request** or **observe** supersession, but it should not unilaterally own the canonical core event unless the Claim owner defines it.

Possible domain event:

```text
SearchClaimImpactDetected
```

or consume a core:

```text
ClaimSuperseded
```

if the Core owner creates it.

### `OfficialSourceChanged`

Similar issue.

A Source change may be:

```text
core Source lifecycle event
```

or:

```text
SearchSourceChangeObserved
```

depending on ownership.

### Required correction

Add an Event Ownership Matrix:

```text
event_id
aggregate_owner
emitter
semantic
core_or_vertical
supersedes/aliases
```

Open event namespace does not eliminate aggregate ownership.

---

## SCV3-H-06 — Method Catalog and "Proposed Methods" Are Not the Same Catalog

**Severity:** HIGH  
**Affected sections:** 33, 53  
**v3 lines:** 3897–4227, 4946–4993

Section 33 defines a large minimum method catalog including:

```text
seo.*
geo.*
aeo.*
llmo.*
entity.*
local.*
content.*
cro.*
aso.*
measurement.*
```

Section 53 later defines a much smaller "Proposed Methods" list using partly different IDs.

Because this is a Master SSOT, readers cannot tell which list is canonical.

### Required correction

There must be one authoritative table:

```text
SearchContent Method Catalog
```

All other sections reference it.

Recommended rule:

```text
Section 33 = canonical catalog
Section 53 = lifecycle/registration procedure only
```

or merge both sections.

---

## SCV3-H-07 — Capability Catalog Is Also Split Across Two Different Lists

**Severity:** HIGH  
**Affected sections:** 33, 52  
**v3 lines:** 3897–4227, 4893–4945

Section 33 contains capabilities such as:

```text
search.fetch_page
search.fetch_site_crawl
search.collect_query_metrics
search.collect_ai_answer_snapshot
publishing.preview
publishing.update_draft
measurement.collect_analytics
```

Section 52 contains a different set such as:

```text
search.extract_observations
search.classify_intent
search.cluster_queries
search.detect_content_gap
content.build_strategy
content.validate_seo
measurement.detect_decay
```

This may represent legitimate additional capabilities, but the Master SSOT does not say:

```text
one list is examples
one list is authoritative
or both union into one catalog
```

### Required correction

Create a single canonical capability backlog/catalog.

Every entry should have:

```yaml
id:
status:
owner:
input_type:
output_type:
implementation_state:
contract_state:
```

At the baseline, `capabilities/contracts/` contains only:

```text
run_statistics.capability.yaml
```

so SearchContent capability IDs are correctly "proposed," but they still need one consistent catalog.

---

## SCV3-H-08 — ContentPerformance Object Is Too Thin for the Measurement Architecture Defined Elsewhere

**Severity:** HIGH  
**Affected sections:** 32, 43  
**v3 lines:** 3647–3896, 4511–4547

Section 32 correctly says important metrics should define:

```text
numerator
denominator
filters
segmentation
aggregation
attribution_window
timezone
currency
source systems
quality checks
interpretation limits
```

But section 43's `ContentPerformance` object only contains:

```text
publication_id
period
search metrics
AI visibility
engagement
conversion
snapshot_at
```

It lacks:

```text
tenant/workspace/project
measurement source
collection execution
metric definition references
provider version
timezone
currency
data quality
provenance
attribution model
calculation run
```

This creates a gap between the methodology and the object contract.

### Required correction

Expand `ContentPerformance`, or make it explicitly a projection over versioned Measurement records rather than the full measurement truth object.

---

# 5. Medium Findings

## SCV3-M-01 — Executive Summary Overstates "Runtime"

**Affected section:** 1  
**v3 line:** around 64

The phrase:

```text
AI LEGO provides the horizontal intelligence runtime.
```

is broader than the baseline evidence supports.

The baseline clearly has substantial:

```text
architecture
schemas
contracts
ADRs
```

but this review does not establish that every listed subsystem is already runtime-implemented.

The document itself later correctly states:

```text
Architecture-defined ≠ Schema-defined ≠ Runtime-implemented.
```

### Correction

Use:

```text
AI LEGO provides the horizontal platform / contract substrate
and target execution runtime.
```

or:

```text
AI LEGO owns the horizontal intelligence runtime architecture.
```

---

## SCV3-M-02 — Vertical Ownership Wording Still Says "Refresh Context / Decision"

**Affected section:** 2

Section 2.2 lists:

```text
Refresh Context / Decision
```

as a SearchContent concept.

Later section 45 correctly says Decision is canonical AI-LEGO Core.

### Correction

Use:

```text
Refresh Context
(decision_ref → canonical AI-LEGO Decision)
```

to remove the ownership ambiguity.

---

## SCV3-M-03 — Domain Pack Path Is Written as Concrete Before Repo Governance Resolves It

**Affected section:** 6  
**v3 lines:** 353–380

Section 6 says:

```text
/cognitive/domain-packs/search-content/
```

as a direct path.

Section 60 later says physical paths are not owned by this document.

The proposed path is conceptually consistent with the Method Atlas / repository architecture direction, but the document should not simultaneously:

```text
fix the physical path
and
say it does not fix physical paths
```

### Correction

Label it:

```text
candidate logical implementation path
subject to Repository Architecture / ADR-006 governance
```

---

## SCV3-M-04 — `SRC-001` Is Treated Too Much Like a Canonical Source ID

**Affected sections:** 7, 8, 18, 47

At the baseline, no canonical Source record schema exists.

`evidence-graph.schema.yaml` uses:

```text
SRC-*
```

as a NEW_DESIGN graph-node convention, not an approved universal Source contract.

### Correction

Until a Core Source contract exists:

```yaml
source_ref:
```

should be treated as an opaque governed reference.

Examples should avoid implying `SRC-*` is permanently canonical.

---

## SCV3-M-05 — SearchObservation Inlines Entity Identity Instead of Clearly Separating Raw Observation and Core Entity

**Affected section:** 12

Current example:

```yaml
entity:
  type: DOMAIN
  value: example.com
```

This can become another entity representation.

### Better model

```yaml
observed_entity:
  raw_type:
  raw_value:

entity_ref:
  # optional resolved AI-LEGO entity reference
```

This preserves:

```text
what the provider returned
vs
which canonical entity the system resolved it to
```

---

## SCV3-M-06 — Domain Method Shape Risks Looking Like a Second Method Contract

**Affected section:** 21

The `domain_method` shape is useful as a conceptual operating template.

But AI-LEGO already has a canonical Method Contract.

### Correction

Explicitly label:

```text
domain_method = narrative / design profile
NOT a second machine-readable Method Contract
```

Machine execution must still use:

```text
specs/cognitive/method.schema.yaml
```

---

## SCV3-M-07 — Domain Methodology Is Structurally Valid but Not "Proven" by AI-LEGO

**Affected sections:** 22–30

This applies to:

```text
SEO
GEO
AEO
LLMO
Entity SEO
Local SEO
Content Strategy
SXO/CRO
ASO
```

The methodology is generally well bounded and contains good evidence caveats.

However, AI-LEGO specs do not validate claims such as:

```text
which SEO technique improves rankings
which GEO characteristic causes AI citations
which ASO creative pattern improves installs
which CRO signal causes conversion lift
```

### Required interpretation

These sections should be considered:

```text
DOMAIN_METHOD_DESIGN
```

until populated with domain evidence through the Source/Evidence system.

This is not an architecture defect; it is a maturity/evidence classification requirement.

---

## SCV3-M-08 — Publishing Safety Flow Shows Human Approval as Universal

**Affected sections:** 38–39

Section 38 correctly says not every operation has the same authority requirement.

Section 39 shows:

```text
Policy Check
↓
Human Approval
↓
CMS Adapter
```

for every publishing flow.

That is too broad.

AI-LEGO Authority separates:

```text
A3 reversible production change
A4 irreversible / external high-impact
```

and does not define a universal risk-tier-to-authority identity mapping.

### Correction

Use:

```text
Policy Check
↓
Human Approval WHEN REQUIRED BY POLICY / AUTHORITY
↓
CMS Adapter
```

---

## SCV3-M-09 — Change Detection Says "Update Evidence" Rather Than Version/Supersede

**Affected section:** 46

The flow contains:

```text
Update Evidence
```

AI-LEGO is event-native and version/audit oriented.

### Correction

Prefer:

```text
Create / supersede versioned Evidence or Claim state
↓
emit canonical event
↓
identify affected claims/content
```

Avoid language suggesting destructive in-place mutation.

---

## SCV3-M-10 — "Reuse AI LEGO Ingest Capabilities" Overstates Baseline Runtime Maturity

**Affected section:** 48

The architecture can and should reuse the AI-LEGO ingestion path.

But "capabilities" should mean:

```text
contracted capability once available
```

not assume crawler/API/normalizer contracts already exist at runtime.

### Correction

Use the maturity vocabulary already introduced in section 3.

---

## SCV3-M-11 — Gate Names and Gate IDs Are Not Mapped

**Affected sections:** 34–37, 57

Sections 34–37 define display names:

```text
Search Intent Gate
SEO Gate
Citation Readiness Gate
...
```

Section 57 defines IDs:

```text
search_content.search_intent
search_content.seo
...
```

There is no mapping table.

### Correction

Create:

```yaml
gate:
  id:
  display_name:
  owner:
  category: DOMAIN_METHOD_SPECIFIC
  applies_to:
  evidence_required:
```

AI-LEGO's Gate Result allows open method-specific gate IDs, so the architecture is compatible; it just needs one canonical registry.

---

## SCV3-M-12 — Several Internal Section Numbers Are Stale

**Severity:** Medium document-integrity defect

The v3 top-level sections were renumbered, but at least 12 internal headings still use earlier numbering.

Examples:

```text
Section 38:
  ## 25.1
  ## 25.2
  ## 25.3
  ## 25.4

Section 45:
  ## 32.1
  ## 32.2
  ## 32.3

Section 47:
  ## 34.1
  ## 34.2

Section 54:
  ## 41.1
  ## 41.2
  ## 41.3
```

A Master SSOT should not contain stale internal numbering because later ADR/spec references may cite the wrong section.

### Correction

Renumber to:

```text
38.1–38.4
45.1–45.3
47.1–47.2
54.1–54.3
```

---

# 6. Positive Conformance Findings

## 6.1 Scoped Authority Awareness

v3 consistently distinguishes:

```text
official rules
official guidance
research
heuristics
experimental practice
internal observations
model inference
```

This is aligned with the Architecture Constitution principle that lower-level advice cannot silently override higher-authority contracts/policies and with the general AI-LEGO anti-hallucination / evidence posture.

---

## 6.2 Evidence Authority Ownership Is Now Correct

v3 correctly leaves:

```text
Evidence quality
recency
directness
hierarchy slot
```

with AI-LEGO Evidence and gives SearchContent only:

```text
domain interpretation
policy
assessment snapshot
reranking use
```

This is the correct "one canonical evidence system" design.

---

## 6.3 Reranking Is Correctly Treated as Versioned Policy

v3 no longer treats a sample multiplication equation as a permanent truth.

It now requires:

```text
normalization
missing-value behavior
weight ranges
tie-breaking
calibration
evaluation
rollback
```

This is structurally appropriate.

---

## 6.4 Conflict Analysis Is Derived, Not Canonical

v3 correctly uses:

```text
Claims
Evidence
Authority Assessment
Freshness
→ derived conflict analysis
```

rather than inventing another truth store.

---

## 6.5 Decision Reuse Is Correct

Refresh decisions go through canonical AI-LEGO Decision.

This is one of the strongest parts of v3.

---

## 6.6 Workflow Reuse Is Correct

v3 explicitly requires:

```text
Recipe
→ Workflow IR
```

and does not define a SearchContent runtime IR.

---

## 6.7 Gate Ownership Is Correct

v3 explicitly states domain gates are:

```text
domain / method-specific
```

and do not replace the platform Global / High-risk gate catalog.

This is aligned with ADR-011 / Gate schema behavior.

---

## 6.8 Repository Ownership Is Mostly Correct

v3 correctly states:

```text
logical bounded-context ownership
≠
physical repository SSOT
```

and routes final paths through repository governance.

Only section 6 needs wording cleanup.

---

## 6.9 Artifact and Source Core Gaps Are Not Illegally Filled

v3 correctly refuses to create:

```text
SearchContent source.schema
SearchContent artifact.schema
```

merely to unblock itself.

That is aligned with Shared Kernel ownership.

---

## 6.10 Publishing Maturity Is Honestly Labeled

v3 explicitly says AI-LEGO has governance primitives but does not claim the SearchContent publishing policy/CMS adapter runtime already exists.

That is correct.

At the baseline, the policy directories contain:

```text
ai-execution
jurisdiction
privacy
provider
security
```

and no SearchContent publishing policy.

---

# 7. 70-Section Review Table

Legend:

```text
PASS
= stands as written for AI-LEGO conformance

PASS+
= architecturally correct but has an explicit dependency / integration detail

DOMAIN_PROPOSAL
= structurally compatible with AI-LEGO, but substantive domain efficacy is not proven by AI-LEGO specs

REVISE
= material correction needed

BLOCKING_CONVERGENCE
= do not create machine contracts from this section until the issue is resolved
```

| § | Lines | Section | Verdict | Review |
|---:|---:|---|---|---|
| 1 | 15–67 | Executive Summary | **REVISE** | Core positioning is correct; "provides the horizontal intelligence runtime" overstates baseline implementation maturity. |
| 2 | 68–157 | Architectural Positioning | **REVISE** | Horizontal/vertical split is correct; `Refresh Context / Decision` wording should explicitly keep Decision Core-owned. |
| 3 | 158–236 | System Boundary | **REVISE** | Excellent maturity model; Source/Artifact handled correctly; Entity maturity is overstated. |
| 4 | 237–325 | Core Design Principles | **PASS** | No-parallel-KB and Evidence-before-Generation align with AI-LEGO. |
| 5 | 326–352 | Proposed Bounded Context | **PASS** | Valid vertical bounded context. |
| 6 | 353–380 | Search & Content Domain Pack | **REVISE** | Domain-pack concept is valid; path must be labeled candidate/logical pending repo governance. |
| 7 | 381–489 | Evidence Authority Policy | **PASS+** | Correct ownership; depends on unresolved canonical Source contract. |
| 8 | 490–566 | Freshness Policy | **PASS+** | Correct policy/assessment pattern; Source reference maturity remains a dependency. |
| 9 | 567–643 | Retrieval & Reranking | **REVISE** | Vector/FTS/Graph/SQL reuse stands; Live Web Search must use external Capability/Tool boundary rather than Repository storage semantics. |
| 10 | 644–701 | Contradiction Analysis | **PASS** | Correctly derived from canonical Claims/Evidence. |
| 11 | 702–796 | Search Intelligence | **PASS+** | Valid new vertical objects; provider adapters/contracts are future work. |
| 12 | 797–840 | Search Observation | **REVISE** | Separate raw observed entity from resolved canonical `entity_ref`. |
| 13 | 841–867 | Competitor Intelligence | **PASS** | Observation vs inference separation is correct. |
| 14 | 868–939 | Content Strategy Engine | **PASS** | Valid vertical decision preparation layer. |
| 15 | 940–966 | URL / Topic Mapping | **PASS+** | Good model; Artifact reference depends on canonical Artifact contract. |
| 16 | 967–1019 | Content Priority | **PASS** | Correctly routes material decisions through canonical Decision. |
| 17 | 1020–1082 | Content Brief | **REVISE** | `required_source_tiers: P0/P1` contradicts claim-scope-aware authority. |
| 18 | 1083–1155 | Evidence Pack | **PASS** | Correct snapshot semantics; does not replace Evidence. |
| 19 | 1156–1191 | Production Pipeline | **PASS** | Correct research→brief→draft→QA sequence. |
| 20 | 1192–1220 | Writing Boundary | **PASS** | Correct separation of generation from truth/policy/decision. |
| 21 | 1221–1420 | Complete Domain Execution Contract | **PASS+** | Strong master pattern; explicitly label `domain_method` as narrative profile, not second Method Contract. |
| 22 | 1421–1883 | SEO Operating Architecture | **DOMAIN_PROPOSAL** | Structurally valid; efficacy requires external SEO evidence, not AI-LEGO specs. |
| 23 | 1884–2153 | GEO Operating Architecture | **DOMAIN_PROPOSAL** | Strong official-vs-heuristic caveat; empirical GEO claims require external evidence. |
| 24 | 2154–2355 | AEO Operating Architecture | **DOMAIN_PROPOSAL** | Structurally valid; platform-specific rules need official evidence. |
| 25 | 2356–2607 | LLMO Operating Architecture | **DOMAIN_PROPOSAL** | Good stochastic/sampling framing; substantive method validity is external-evidence dependent. |
| 26 | 2608–2739 | Entity SEO | **REVISE** | Reuse direction is correct, but canonical Entity contract maturity is weaker than stated. |
| 27 | 2740–2914 | Local SEO | **DOMAIN_PROPOSAL + DEPENDENCY** | Valid vertical design; depends on Entity/Source maturity. |
| 28 | 2915–3134 | Content Strategy Operating Architecture | **DOMAIN_PROPOSAL** | Strong; scoring/criteria correctly versioned. |
| 29 | 3135–3305 | SXO / CRO | **DOMAIN_PROPOSAL + DEPENDENCY** | Good experimentation discipline; Experiment/Outcome contracts remain prerequisites. |
| 30 | 3306–3432 | ASO | **DOMAIN_PROPOSAL** | Correctly requires current official store evidence for limits/policies. |
| 31 | 3433–3646 | Publishing Operations | **PASS+** | Good adapter/state-machine design; policy/contracts are not baseline runtime. |
| 32 | 3647–3896 | Measurement & Attribution | **PASS+** | Strong metric-definition architecture; downstream object does not yet fully implement it. |
| 33 | 3897–4227 | Cross-domain Lifecycle | **REVISE** | Lifecycle is good; Method/Capability catalogs conflict with later canonical-looking lists. |
| 34 | 4228–4248 | SEO Quality Gates | **PASS+** | Valid method/domain gates; must receive canonical gate IDs/contracts. |
| 35 | 4249–4270 | GEO/AEO/LLMO Gates | **PASS+** | Correct official-rule disclaimer; needs canonical gate mapping. |
| 36 | 4271–4287 | Brand Gates | **PASS+** | Valid domain gates; Product/Pricing facts must resolve to evidence/core facts. |
| 37 | 4288–4306 | Conversion/SXO Gates | **PASS+** | Compatible; quantitative claims correctly require evidence. |
| 38 | 4307–4384 | Publishing Engine | **PASS+** | Correct primitives/maturity framing; stale internal subsection numbers. |
| 39 | 4385–4412 | Publishing Safety | **REVISE** | Human approval should be conditional on policy/authority, not visually universal. |
| 40 | 4413–4454 | ContentPublication | **PASS+** | Valid vertical object; correct Artifact dependency. |
| 41 | 4455–4491 | Measurement Layer | **PASS** | Correct separation from platform observability. |
| 42 | 4492–4510 | Measurement Adapters | **DOMAIN_PROPOSAL** | Valid adapter concept. |
| 43 | 4511–4547 | ContentPerformance | **REVISE** | Object lacks provenance/source/metric-definition/data-quality fields required by section 32. |
| 44 | 4548–4577 | Learning Loop | **PASS+** | Correct feedback loop; Outcome contract maturity remains dependency. |
| 45 | 4578–4650 | Refresh Context / Decision | **PASS** | Correct canonical Decision reuse; stale internal numbering only. |
| 46 | 4651–4691 | Change Detection | **REVISE** | Replace "Update Evidence" with version/supersede/event semantics. |
| 47 | 4692–4744 | Search Source Profile | **REVISE** | Overlay design is correct; do not ossify `SRC-*` as final canonical identity grammar. |
| 48 | 4745–4787 | Ingestion Flow | **REVISE** | Good pipeline; "reuse capabilities" must respect contract/runtime maturity. |
| 49 | 4788–4829 | Knowledge Card | **PASS** | Correctly derived/materialized, not authoritative. |
| 50 | 4830–4865 | Brand Knowledge | **REVISE** | Shared graph principle is correct; Entity maturity needs caveat. |
| 51 | 4866–4892 | Hybrid Retrieval Router | **REVISE** | Correct anti-second-planner rule; external live search boundary must be separated from Repository retrieval. |
| 52 | 4893–4945 | Proposed Capabilities | **BLOCKING_CONVERGENCE** | IDs are syntactically compatible, but catalog conflicts/incompleteness vs section 33 must be resolved before contracts. |
| 53 | 4946–4993 | Proposed Methods | **BLOCKING_CONVERGENCE** | Method grammar is correct, but duplicate/overlapping IDs vs sections 22–33 need canonicalization. |
| 54 | 4994–5084 | Proposed Recipes | **PASS+** | Correct Recipe→Workflow IR rule; internal subheading numbering is stale. |
| 55 | 5085–5122 | Proposed Events | **BLOCKING_CONVERGENCE** | Event Ledger reuse stands, but `ContentPublished`, `ClaimSuperseded`, `OfficialSourceChanged` need aggregate ownership / duplicate-semantic resolution. |
| 56 | 5123–5146 | Artifact Type Catalog | **PASS+** | Correct vertical catalog and Core Artifact dependency. |
| 57 | 5147–5188 | Quality Gate Bundle | **PASS+** | Correct method/domain-specific gate scope; add ID/display-name registry. |
| 58 | 5189–5216 | Publishing / Measurement Separation | **PASS+** | Clean separation; Outcome maturity dependency. |
| 59 | 5217–5250 | Experiment Support | **PASS+** | Correctly refuses parallel experiment model; contracts remain prerequisite. |
| 60 | 5251–5320 | Logical Ownership Layout | **PASS** | Correctly makes physical repo path non-authoritative. |
| 61 | 5321–5354 | Proposed Specs | **PASS+** | Good ownership exclusions; Entity/reference dependencies should be documented. |
| 62 | 5355–5371 | Proposed Policies | **PASS+** | Correct composition with platform policy mechanisms. |
| 63 | 5372–5421 | MVP Scope | **PASS+** | Correct dependency-aware MVP; requires convergence findings before implementation. |
| 64 | 5422–5606 | Delivery Plan | **PASS+** | SC-Phase separation is good; add Method/Capability catalog convergence and Event ownership explicitly to exit gate. |
| 65 | 5607–5657 | Minimum Viable Vertical Slice | **PASS+** | Strong acceptance criteria; not executable until core/adapters/contracts exist. |
| 66 | 5658–5672 | Non-Goals | **PASS** | Correct anti-duplication boundary. |
| 67 | 5673–5726 | Architectural Invariants | **PASS+** | Strong; Entity maturity and runtime wording should be reflected consistently. |
| 68 | 5727–5784 | Final Target Architecture | **PASS+** | Correct target architecture; dependencies remain. |
| 69 | 5785–5832 | Next Documents | **PASS+** | Good order; Method/Capability/Event namespace convergence should be explicit first-class outputs. |
| 70 | 5833–5880 | Final Definition | **PASS** | Correct system definition. |

---

# 8. Claim-by-Claim AI-LEGO Conformance Matrix

| v3 Claim | Verdict | AI-LEGO Basis | Notes |
|---|---|---|---|
| SearchContent is a vertical over AI-LEGO | PASS | Repository Architecture bounded-context model | Correct architectural relationship |
| Do not create second Knowledge/RAG | PASS | Repository Contract + Knowledge engine ownership | Strong |
| Do not create second Evidence | PASS | Evidence schema / Evidence Graph | Authority/freshness overlay is correct |
| Domain evidence hierarchy may exist | PASS | Evidence `hierarchy_tier` is domain-specific | P0–P3 must remain claim-scope-aware |
| Reuse Vector/FTS/Graph | PASS | Repository Contract | Correct |
| Live external web search is Repository retrieval | **FAIL AS DRAWN** | Repository Contract does not model external provider search | Use Capability/Tool/provider boundary |
| Reuse Claim supporting/contradicting evidence | PASS | Claim / Evidence Graph | Correct |
| Reuse canonical Decision | PASS | Decision schema | Correct |
| RefreshContext is vertical, Decision is Core | PASS | Decision schema + Shared Kernel ownership | Correct |
| Search methods use `<family>.<name>` | PASS | ADR-005 / Method schema | Syntax is correct |
| Proposed Search method IDs are already runtime methods | NOT CLAIMED | methods/contracts listing | v3 correctly labels them proposed |
| Proposed Search capabilities are already runtime capabilities | NOT CLAIMED | capabilities/contracts listing | v3 correctly labels them proposed |
| Recipes compile to Workflow IR | PASS | Workflow IR compilation model | Correct |
| Search gates can be method-specific | PASS | Gate schema open method-specific namespace | Correct |
| SearchContent may create second Global Gate catalog | REJECTED BY v3 | ADR-011 / Gate schema | v3 correctly forbids it |
| SearchContent events can use Event Ledger | PASS | Event Ledger open PascalCase namespace | Aggregate semantics still need ownership |
| `ContentPublished` is automatically safe as a new event | NO | Event Ledger already has `ArtifactPublished` | Must resolve semantic overlap |
| SearchContent owns Artifact schema | NO | Shared Kernel ownership | v3 correctly rejects |
| Canonical Artifact record exists at baseline | NO | `specs/artifact/` listing | v3 correctly marks dependency |
| Canonical Source record exists at baseline | NO | `specs/domain/` listing / Evidence Graph notes | v3 correctly marks dependency |
| Mature standalone Entity schema exists | NO | Evidence Graph explicitly says Entity/Relation had no standalone schemas | v3 must weaken maturity claim |
| SearchSourceProfile overlay is valid | PASS | Shared Kernel ownership pattern | Good |
| Publishing policy already exists | NO | baseline policy directory | v3 correctly says it must be added |
| CMS adapter runtime already exists | NO | no corresponding baseline contract | v3 correctly says it is proposed |
| Publishing must obey Authority / Gate / Policy | PASS | Authority / Gate / Execution architecture | Correct |
| Human approval is always required for every operation | NOT SUPPORTED | Authority levels are contextual; no universal mapping | Make conditional |
| Experiment / Outcome are reuse targets | PASS AS ARCHITECTURE | Repository Architecture | Machine contract maturity remains prerequisite |

---

# 9. Machine-ID Conformance

## 9.1 Method Grammar

Canonical Method grammar:

```regex
^[a-z_]+\.[a-z_]+$
```

The proposed v3 Method IDs are syntactically compatible.

Examples:

```text
seo.search_intent_analysis
geo.answerability_analysis
aeo.question_discovery
llmo.prompt_set_design
local.intent_analysis
aso.metadata_analysis
content.topic_prioritization
```

The defect is **semantic duplication**, not grammar.

---

## 9.2 Capability Grammar

The Capability Contract accepts:

```text
bare_id
or
namespace.id
```

with one optional namespace separator.

v3 capability IDs such as:

```text
search.collect_snapshot
content.generate_brief
publishing.publish
measurement.collect_conversion
```

are syntactically compatible.

Again, the remaining issue is catalog convergence and missing contract instances.

---

# 10. Runtime Maturity Matrix at Review Baseline

| Component | Baseline maturity | v3 treatment |
|---|---|---|
| Evidence | ACTIVE_SCHEMA | Correct |
| Claim | ACTIVE_SCHEMA | Correct |
| Evidence Graph | ACTIVE_SCHEMA | Correct |
| Sentence Provenance | ACTIVE_SCHEMA | Correct |
| Decision | ACTIVE_SCHEMA | Correct |
| Method Contract schema | ACTIVE_SCHEMA | Correct |
| Recipe schema | ACTIVE_SCHEMA | Correct |
| Workflow IR | ACTIVE_SCHEMA | Correct |
| Capability Contract schema | ACTIVE_SCHEMA | Correct |
| Repository Contract | ACTIVE_SCHEMA | Correct |
| Event Ledger | ACTIVE_SCHEMA | Correct |
| Gate Result / platform gate catalog | ACTIVE_SCHEMA | Correct |
| Authority | ACTIVE_SCHEMA | Correct |
| Source canonical record | NOT AVAILABLE | v3 correctly treats as dependency |
| Artifact canonical record | NOT AVAILABLE | v3 correctly treats as dependency |
| Entity standalone canonical record | NOT MATURE / graph minimal shape only | **v3 needs correction** |
| SearchContent Method contracts | NOT AVAILABLE | Correctly proposed |
| SearchContent Capability contracts | NOT AVAILABLE | Correctly proposed |
| SearchContent validated recipes | NOT AVAILABLE | Correctly proposed |
| SearchContent publishing policy | NOT AVAILABLE | Correctly proposed |
| CMS adapters | NOT AVAILABLE | Correctly proposed |
| Measurement adapters | NOT AVAILABLE | Correctly proposed |

Baseline Method Contract instances:

```text
evidence.triangulation
research.qualitative_coding
root_cause.fishbone
stakeholder.regulator
strategy.swot
```

Baseline Capability Contract instances:

```text
run_statistics
```

Therefore no SearchContent-specific ID should be described as runtime-ready yet.

v3 generally follows this rule correctly.

---

# 11. Architecture Acceptance Blockers

The document can remain the conceptual Master Architecture now.

Before status can become:

```text
ACCEPTED
```

the following should be resolved.

## Gate A — Method Namespace Convergence

```text
PASS when:
one canonical Method catalog exists
+
all overlapping IDs are merged or semantically distinguished
```

---

## Gate B — Capability Catalog Convergence

```text
PASS when:
one canonical Capability backlog exists
+
each ID has owner/status/input/output
```

---

## Gate C — Event Ownership

```text
PASS when:
every proposed event has aggregate owner
+
no duplicate of ArtifactPublished or Core Claim/Source lifecycle events
```

---

## Gate D — Authority Consistency

```text
PASS when:
ContentBrief no longer hard-codes unconditional P0/P1 requirements
```

---

## Gate E — External Retrieval Boundary

```text
PASS when:
Live Web / provider search is routed through Capability / Tool / Provider
rather than Repository storage semantics
```

---

## Gate F — Entity Maturity

```text
PASS when:
Entity/Relation maturity is explicitly classified
and SearchContent does not silently define a competing Core Entity model
```

---

## Gate G — Measurement Contract Completeness

```text
PASS when:
ContentPerformance either:
A. includes measurement provenance/source/metric-definition metadata
or
B. is explicitly only a derived projection over canonical measurement records
```

---

## Gate H — Document Integrity

```text
PASS when:
stale internal section numbers are corrected
```

---

# 12. Really Usable Now

The following v3 architecture decisions are sound enough to keep.

```text
✓ SearchContent as AI-LEGO vertical
✓ one canonical Knowledge/RAG substrate
✓ one canonical Evidence system
✓ claim-scope-aware authority policy
✓ freshness as policy/assessment
✓ Evidence Pack as retrieval snapshot
✓ derived contradiction analysis
✓ Search Intelligence bounded context
✓ Content Strategy before writing
✓ canonical Decision reuse
✓ ContentBrief as a vertical typed object
✓ Recipe → Workflow IR
✓ domain/method-specific quality gates
✓ Event Ledger reuse
✓ Source profile overlay
✓ Knowledge Card as derived view
✓ Artifact soft dependency rather than local core
✓ Publishing adapter architecture
✓ Measurement separated from platform observability
✓ content lifecycle / refresh loop
✓ maturity-state vocabulary
✓ SC-Phase delivery model
```

---

# 13. Needs Correction Before Machine Implementation

```text
△ canonical Method ID catalog
△ canonical Capability catalog
△ ContentBrief evidence requirements
△ Live Web retrieval boundary
△ Entity maturity declaration
△ Event ownership / event duplicate semantics
△ ContentPerformance completeness
△ SearchObservation entity resolution model
△ Source reference grammar maturity
△ publishing approval conditionality
△ change-detection versioning language
△ ingest runtime maturity wording
△ gate ID/display-name mapping
△ stale subsection numbering
```

---

# 14. What Is Not an Architecture Defect but Still Requires Evidence

The following are **not rejected** by this review.

They simply cannot be validated by AI-LEGO architecture alone:

```text
SEO method efficacy
GEO citation heuristics
AEO answer-format effectiveness
LLMO visibility methodology
Entity SEO effectiveness
Local SEO tactics
CRO/SXO causal effects
ASO listing tactics
search-surface-specific optimization advice
```

For these, SearchContent should use its own evidence pipeline:

```text
Official Rules
+
Standards
+
Research
+
Observed Search/AI Snapshots
+
Experiments
↓
Canonical Evidence / Claims
↓
Domain Method Contract
```

This is exactly why the evidence-first architecture is valuable.

---

# 15. Recommended Correction Order

Do not begin with the Writer.

Recommended immediate order:

```text
1. Canonical Method Catalog Convergence
2. Canonical Capability Catalog Convergence
3. Event Ownership Matrix
4. Fix ContentBrief authority requirements
5. Separate external live search from Repository retrieval
6. Correct Entity maturity / EntityRef semantics
7. Complete ContentPerformance / Measurement references
8. Create Gate ID Registry
9. Correct document section numbering
10. Then proceed to machine-readable SearchContent specs/contracts
```

After this:

```text
SearchContent domain specs
→ Method Contracts
→ Capability Contracts
→ Validated Recipes
→ Workflow IR tests
→ Gate tests
→ Publishing policy/adapters
→ Measurement adapters
→ MVP vertical slice
```

---

# 16. Final Conclusion

The v3 document's central architectural proposition stands:

> **Search & Content Intelligence should be a domain vertical on AI-LEGO, not a second cognitive/evidence/workflow platform.**

The strongest claims are valid:

```text
No second RAG              → PASS
No second Evidence system  → PASS, with one ContentBrief correction
No second Workflow runtime → PASS
No second Decision model   → PASS
No second Event Ledger     → PASS, but event semantics need ownership convergence
No second Artifact core    → PASS
No second Source core      → PASS
```

The main risk has shifted.

It is no longer:

```text
"Will SearchContent accidentally build a whole second AI platform?"
```

The main risk is now:

```text
"Will SearchContent create multiple valid-looking Method IDs,
Capability catalogs, and Event names for the same semantics?"
```

That is a much narrower and more solvable problem.

Final recommendation:

```yaml
final_assessment:
  architecture_direction: STRONG
  ai_lego_conformance: HIGH
  duplicate_platform_risk: LOW
  duplicate_semantic_contract_risk: MEDIUM_HIGH
  domain_method_evidence_maturity: PROPOSED
  machine_contract_readiness: NOT_READY
  implementation_readiness: NOT_READY

recommended_next_status:
  PROPOSED_WITH_REQUIRED_REVISIONS
```

The architecture should be corrected, not redesigned from scratch.

---

# Appendix A — Detected Document Integrity Defects

Stale subsection headings detected:

```text
L4324  current §38  → "## 25.1 Suggested Adapters"
L4337  current §38  → "## 25.2 Publishing Operations"
L4352  current §38  → "## 25.3 Page Metadata"
L4369  current §38  → "## 25.4 Publishing Authority Policy"

L4584  current §45  → "## 32.1 Correct Model"
L4606  current §45  → "## 32.2 Refresh Context"
L4631  current §45  → "## 32.3 Canonical Decision Options"

L4698  current §47  → "## 34.1 Proposed Search Source Profile"
L4730  current §47  → "## 34.2 Initial Authority Sources"

L5011  current §54  → "## 41.1 New Content Recipe"
L5037  current §54  → "## 41.2 Refresh Existing Content Recipe"
L5065  current §54  → "## 41.3 Platform Rule Change Recipe"
```

---

# Appendix B — Canonical Method Collision Candidates

These pairs/groups require an explicit merge-or-distinguish decision:

```text
seo.search_intent_analysis
search.intent_analysis
```

```text
content.content_gap_analysis
search.content_gap_analysis
```

```text
content.topic_clustering
search.topic_clustering
```

```text
seo.entity_coverage_analysis
search.entity_gap_analysis
```

Potential related-but-not-necessarily-identical concepts should also be documented:

```text
seo.query_discovery
search.query_clustering
search.cluster_queries  # capability, not method
```

The distinction:

```text
Method
vs
Capability
```

must remain explicit.

---

# Appendix C — Event Ownership Candidates

Recommended analysis:

| Current proposed event | Likely owner / issue |
|---|---|
| SearchSnapshotCaptured | SearchContent |
| SearchObservationCreated | SearchContent |
| TopicClusterCreated | SearchContent |
| ContentOpportunityCreated | SearchContent |
| ContentBriefCreated | SearchContent |
| ContentBriefApproved | SearchContent / approval workflow |
| ContentDraftGenerated | SearchContent / Artifact boundary needs definition |
| ContentQualityGateFailed | SearchContent Gate output / possibly derive from canonical Gate Result |
| ContentQualityGatePassed | Same |
| ContentPublished | **Check against canonical `ArtifactPublished`** |
| ContentPerformanceCaptured | SearchContent |
| ContentDecayDetected | SearchContent |
| RefreshContextCreated | SearchContent |
| OfficialSourceChanged | **Core Source vs Search observation ownership unresolved** |
| ClaimSuperseded | **Core Claim owner; should not be silently vertical-owned** |

---

# Appendix D — One-Sentence Verdict

> **v3 is now a credible AI-LEGO vertical architecture; it no longer tries to rebuild AI-LEGO, but it still needs canonical Method/Capability/Event semantic convergence before its proposed domain system can safely become machine-readable and executable.**
