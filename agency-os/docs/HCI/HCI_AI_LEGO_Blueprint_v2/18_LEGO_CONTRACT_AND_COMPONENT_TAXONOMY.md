# 18 — LEGO Contract & Component Taxonomy

## Purpose

Define what "LEGO" means technically. A folder is not a LEGO. A component is LEGO-compatible only when it has explicit interfaces, versioning, authority, observability, and rollback semantics.

## Eight LEGO categories

### 1. Foundation LEGO
Examples: IAM, audit, secrets, event bus, tenant context. **This category is where the Shared Kernel (`09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel) lives — it was already the intended home for exactly this kind of cross-cutting primitive; V1 correctly named the category and never populated it with the epistemic/reference/risk-tier primitives that needed it.**

### 2. Cognitive LEGO
Examples: planner, verifier, critic, model router, context manager.

### 3. Intelligence LEGO
Examples: source quality, contradiction detector, confidence calculator, risk evaluator.

### 4. Domain LEGO
Examples: HCI trust domain, HCI relationship assessment, HCI permission gate.

### 5. Method Pack
Examples: Big Five (IPIP instrument, see `05_HCI30_INTELLIGENCE_METHODS.md`), Trust framework, BATNA, Sun Tzu strategic lens.

### 6. Solution Pack
Examples: HCI Personal, HCI Enterprise, HCI Group.

### 7. Integration LEGO
Examples: Salesforce adapter, Slack adapter, CRM adapter, Cognitive OS connector.

### 8. Policy Pack
Examples: HCI Personal Policy, HCI Enterprise Policy, high-risk financial policy, regional privacy policy.

## LEGO contract

Every LEGO must declare: `lego_id`, `version`, `type`, `capability`, `input_contract`, `output_contract`, `dependencies`, `optional_dependencies`, `authority_scope`, `security_scope`, `permissions`, `events_emitted`, `events_consumed`, `observability`, `migration`, `rollback`, `maturity`, `owner`.

## Example

```yaml
id: hci.trust-domain
version: 1.0.0
type: domain-intelligence

accepts:
  - evidence_set
  - relationship_context

produces:
  - domain_trust_assessment
  - confidence_report

depends_on:
  - hci.evidence-quality@^2
  - hci.confidence@^1

optional:
  - hci.behaviour@^1
  - hci.incentive@^2

maturity: stable
```

## Capability registry

Until the cross-product-component admission rule in `17_REPOSITORY_LAYOUT_AND_PATHS.md` is met, the capability registry is AI LEGO-owned at `D:\Work\Projects\internal\cognitive-engineering-os\capability-registry\`; HCI consumes it only through a versioned integration contract.

Use capability names such as: `research.web.search`, `research.source.verify`, `cognitive.claim.extract`, `cognitive.hypothesis.generate`, `cognitive.ach.evaluate`, `cognitive.contradiction.detect`, `decision.risk.evaluate`, `decision.option.compare`, `hci.person.resolve`, `hci.relationship.assess`, `hci.trust.evaluate`.

## Capability invocation

Products should ask for a capability, not a vendor.

Good: `requestCapability("llm.reason", requirements)`
Bad: `callOpenAI(...)`

## Vendor Replaceability *(new section in V2)*

This is the **tested property** that `01_SYSTEM_CONSTITUTION.md` Invariant 4 states as a principle. "No hidden vendor lock-in" is not proven by capability-registry abstraction existing in the architecture diagram — it must be exercised. Recommended minimum test: a CI job that runs the same eval suite against two different LLM providers behind the `llm.reason` capability and asserts equivalent-shape output. Until this test exists and is run, treat vendor-neutrality as an unverified claim, not a guarantee. See `HCI30_RESEARCH_REVIEW/18_30_YEAR_REPLACEMENT_ANALYSIS.md` for the full vendor-by-vendor analysis (LLM providers, Supabase/PostgreSQL, Cloudflare, Docker, frontend framework, payment provider, OVH) this section summarizes.

**Supabase-specific note**: PostgreSQL itself is the safest dependency in this architecture (30-year track record, license-free). Supabase (the self-hosted distribution wrapping it — Auth, PostgREST, Realtime, Storage) is a separate, tighter dependency if HCI code calls Supabase-specific client SDKs directly throughout the domain layer. Route all Supabase-specific calls through an explicitly isolated adapter module, never imported directly by domain logic — this keeps the actual database (Postgres) freely portable even if the Supabase distribution layer around it changes.

## Provider adapter rule

Search providers, LLMs, payment systems, CRMs, and other vendors must sit behind adapters.

```text
HCI
↓
research.search capability
↓
Search Router
↓
Provider Adapter
```

## Workflow as LEGO

A workflow itself is versioned and composable. Examples: `workflow.hci.quick-person-check`, `workflow.hci.deep-due-diligence`, `workflow.hci.partner-review`, `workflow.hci.conflict-analysis`.

## Dependency direction

```text
Solution
↓
Domain
↓
Intelligence
↓
Cognitive
↓
Foundation
```

Peer systems should not import each other's internal code.

## No circular dependency

Forbidden: `HCI → Agency → HCI`. Use contracts/events instead.

## No direct database coupling

Forbidden: `HCI SQL JOIN agency_customers`. Use: `HCI → API/Event/Contract → Agency capability`.

## Canonical cross-system references

Keep the shared canonical model deliberately small: `EntityRef`, `PersonRef`, `OrganizationRef`, `EvidenceRef`, `TenantContext`, `ActorRef`, `SourceRef`, `Timestamp`.

**Changed in V2 — this is now a build requirement, not only a design principle**: V1 specified this exact mechanism correctly but it was never actually built — AI LEGO's `evidence.schema.yaml` today is a full record embedded directly where a thin `EvidenceRef` was supposed to cross the HCI↔AI LEGO boundary. Build these as the literal implementation of `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel item 1, before the Wave-1 domain freeze. Do not create one universal god-schema — the list above is deliberately exhaustive, not a starting point to grow indefinitely.

## Compatibility matrix

Each component should declare compatible versions, e.g. `HCI 3.2`, `Cognitive OS 5.x`, `Evidence LEGO 2.x`, `Decision LEGO 3.x`.

## Maturity

Every LEGO should expose: Experimental, Beta, Stable, Critical, Deprecated. Enterprise policy may prohibit Experimental/Beta components.

## Future registry/marketplace

Architecture may later support: Official LEGOs, Certified Partner LEGOs, Enterprise Private LEGOs, Experimental LEGOs. **Confirmed correctly deferred** — do not build the marketplace before the contract/registry standards above are stable and actually implemented.
