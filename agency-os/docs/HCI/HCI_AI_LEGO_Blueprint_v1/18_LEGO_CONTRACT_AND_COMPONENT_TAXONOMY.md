> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md. See 00_README.md in this folder for why.

# 18 — LEGO Contract & Component Taxonomy

## Purpose

Define what “LEGO” means technically.

A folder is not a LEGO. A component is LEGO-compatible only when it has explicit interfaces, versioning, authority, observability, and rollback semantics.

## Eight LEGO categories

### 1. Foundation LEGO
Examples:
- IAM
- audit
- secrets
- event bus
- tenant context

### 2. Cognitive LEGO
Examples:
- planner
- verifier
- critic
- model router
- context manager

### 3. Intelligence LEGO
Examples:
- source quality
- contradiction detector
- confidence calculator
- risk evaluator

### 4. Domain LEGO
Examples:
- HCI trust domain
- HCI relationship assessment
- HCI permission gate

### 5. Method Pack
Examples:
- Big Five
- Trust framework
- BATNA
- Sun Tzu strategic lens

### 6. Solution Pack
Examples:
- HCI Personal
- HCI Enterprise
- HCI Group

### 7. Integration LEGO
Examples:
- Salesforce adapter
- Slack adapter
- CRM adapter
- Cognitive OS connector

### 8. Policy Pack
Examples:
- HCI Personal Policy
- HCI Enterprise Policy
- high-risk financial policy
- regional privacy policy

## LEGO contract

Every LEGO must declare:

```text
lego_id
version
type
capability
input_contract
output_contract
dependencies
optional_dependencies
authority_scope
security_scope
permissions
events_emitted
events_consumed
observability
migration
rollback
maturity
owner
```

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

Recommended location:

```text
D:\Work\agency-os\shared\platform\capability-registry\
```

Use capability names such as:

```text
research.web.search
research.source.verify

cognitive.claim.extract
cognitive.hypothesis.generate
cognitive.ach.evaluate
cognitive.contradiction.detect

decision.risk.evaluate
decision.option.compare

hci.person.resolve
hci.relationship.assess
hci.trust.evaluate
```

## Capability invocation

Products should ask for a capability, not a vendor.

Good:

```text
requestCapability("llm.reason", requirements)
```

Bad:

```text
callOpenAI(...)
```

## Provider adapter rule

Search providers, LLMs, payment systems, CRMs, and other vendors must sit behind adapters.

Example:

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

A workflow itself is versioned and composable.

Examples:

```text
workflow.hci.quick-person-check
workflow.hci.deep-due-diligence
workflow.hci.partner-review
workflow.hci.conflict-analysis
```

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

Forbidden:

```text
HCI → Agency → HCI
```

Use contracts/events instead.

## No direct database coupling

Forbidden:

```sql
HCI SQL JOIN agency_customers
```

Use:

```text
HCI
→ API/Event/Contract
→ Agency capability
```

## Canonical cross-system references

Keep the shared canonical model deliberately small:

```text
EntityRef
PersonRef
OrganizationRef
EvidenceRef
TenantContext
ActorRef
SourceRef
Timestamp
```

Do not create one universal god-schema.

## Compatibility matrix

Each component should declare compatible versions.

Example:

```text
HCI 3.2
Cognitive OS 5.x
Evidence LEGO 2.x
Decision LEGO 3.x
```

## Maturity

Every LEGO should expose:

```text
Experimental
Beta
Stable
Critical
Deprecated
```

Enterprise policy may prohibit Experimental/Beta components.

## Future registry/marketplace

Architecture may later support:

```text
Official LEGOs
Certified Partner LEGOs
Enterprise Private LEGOs
Experimental LEGOs
```

Do not build the marketplace before the contract/registry standards are stable.
