> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md. See 00_README.md in this folder for why.

# 16 — Open Decisions & Next Artifacts

## Decisions already made

### Product separation

Confirmed:

```text
HCI-30
and
AI LEGO Cognitive Engineering OS
```

are separate peer systems.

### Domain separation

Confirmed:
- independent bounded contexts
- independent data ownership
- independent deployment lifecycle
- independent failure domains
- optional integration only

### Current infrastructure baseline

Confirmed as of 2026-08-29:

```text
OVHcloud Dedicated Server
ns3006986.ip-149-202-64.eu
```

Active architecture documents must describe current deployment truth only.

Maintain exact service placement separately at:

```text
D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md
```

### Subdomain direction

Recommended:

```text
hci.aware-wave.com
cognitive.aware-wave.com
portal.aware-wave.com
api.aware-wave.com
docs.aware-wave.com
trust.aware-wave.com
status.aware-wave.com
```

`api.aware-wave.com` already exists and remains the common external API gateway.

`app.aware-wave.com` is verified as the internal Lobster Factory operations/admin console and MUST NOT be treated as the future customer portal.

Existing `uptime.aware-wave.com` / Uptime Kuma should remain the monitoring source of truth for any future public `status.aware-wave.com` surface.

### API namespace

Recommended:

```text
/hci/v1
/cognitive/v1
/platform/v1
```

### HCI

Confirmed design direction:
- evidence-centric
- no universal person score
- trust domains
- public intelligence with all source URLs
- source quality and identity resolution
- favorable + unfavorable evidence
- domain methods from psychology, trust, negotiation, game theory, classical strategy
- self-reflection frameworks separated from formal enterprise decision scoring
- human final decision
- commercial Personal→Group/Private editions

### AI LEGO

Known:
- three mother documents
- 289-method atlas
- scoped authority chain
- replay/rollback
- jurisdiction
- cross-model validation
- AGREE != FACT

## Open design decisions

These still need formal specification:

1. Final HCI product name and trademark strategy
2. Exact HCI trust-domain definitions and formulas
3. Confidence algorithm v1
4. Evidence-quality algorithm v1
5. Risk model v1
6. Permission model v1
7. HCI Domain Policy machine-readable schema
8. Public Intelligence source-quality scoring
9. Identity-resolution thresholds
10. HCI-to-Cognitive integration contract schema
11. Event naming/versioning standard
12. Tenant isolation implementation detail
13. Data residency region plan
14. Local-first Personal architecture
15. Report format and citation schema
16. Paid plan packaging/pricing
17. Enterprise licensing
18. Method licensing/legal review
19. Scientific advisory process
20. HCIS public standard design

## Next artifacts to produce

Recommended in this order:

### 1. HCI Domain ERD

Must include:
- Person
- Organization
- Relationship
- Interaction
- Evidence
- Claim
- Assessment
- TrustDomain
- Risk
- Permission
- Decision
- Outcome

### 2. HCI Trust & Risk Mathematical Specification

Define:
- scoring semantics
- confidence semantics
- evidence weighting
- contradiction handling
- time decay
- severity-aware decay
- model disagreement

### 3. HCI Method Contract Specification

Define formal schema for:
- psychology
- trust
- negotiation
- strategy
- game theory
- self-reflection

### 4. Public Intelligence Technical Spec

Define:
- identity resolution
- search planner
- source registry
- claim graph
- URL provenance
- contradiction workflow
- report generation

### 5. HCI Domain Policy

Machine-readable rules for:
- protected traits
- allegations
- psychometrics
- classical strategy
- high-impact decisions
- research legality

### 6. HCI × AI LEGO Integration Contract

Define:
- request package
- response package
- run references
- authority mapping
- failure modes
- compatibility
- replay

### 7. Subdomain / gateway deployment ADR

Formalize:
- hostnames
- TLS
- routing
- auth
- API namespaces
- cookie boundaries
- CORS
- service ownership

## AI implementation rule

No AI should begin coding production HCI logic until the relevant domain and contract artifact above exists.

When ambiguity appears, create an ADR rather than silently inventing behavior.
