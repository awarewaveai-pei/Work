# 16 — Open Decisions & Next Artifacts

## Status note (new in V2)

**`D:\Work\agency-os\docs\HCI\HCI30_RESEARCH_REVIEW\22_OPEN_HUMAN_DECISIONS.md` is the immutable 24-item research evidence list.** Current state is in `governance/ADR_INDEX.md`: all 24 findings (`HD-00` through `HD-23`) now have a recorded ADR decision — six via explicit per-decision operator approval on 2026-09-01 (`HD-00=C`/`ADR-0011`, `HD-01=A`/`ADR-0009`, `HD-02=C`/`ADR-0010`, `HD-03=A`/`ADR-0014`, `HD-04=A`/`ADR-0015`, `HD-05=A`/`ADR-0016`), the remaining eighteen under the operator's 2026-09-02 explicit blanket delegation (`ADR-0012`, `ADR-0013`, `ADR-0017` through `ADR-0032`), plus `ADR-0033` resolving a tenancy-principal gap `ADR-0016` itself surfaced. **A recorded decision is not an implementation** — every ADR's runtime gate remains `OPEN`; see `ADR_INDEX.md`'s gate table for what still needs to be built and tested before each is real. This chapter keeps V1's original decision list for continuity, marked against what V2 resolved, and folds in the items that list omitted.

## Governance starter — before the next artifact

Use `governance/ADR_INDEX.md` as the auditable register for the ADRs named by this blueprint, and start a material decision/change with `governance/HCI_CHANGE_PROPOSAL_TEMPLATE.md`. The register only records state and evidence links: it does not create an accepted ADR or turn a pending decision into an implementation instruction.

Before artifact #1 or any artifact that would choose a boundary, authority, consent scope, subject type, market scope, or shared-kernel rule, create the corresponding `PLANNED`/`DRAFT` record and obtain the explicitly required human approval before applying the chosen option. The three accepted ADRs still require their named implementation gates; the other 21 decisions remain open unless their authoritative record says otherwise.

## Decisions already made

### Product separation

Confirmed: HCI-30 and AI LEGO Cognitive Engineering OS are separate peer systems — **re-confirmed in V2 after independent re-derivation against six ownership criteria**, not merely carried forward. See `02_PRODUCT_BOUNDARIES.md`.

### Domain separation

Confirmed: independent bounded contexts, independent data ownership, independent deployment lifecycle, independent failure domains, optional integration only — **with one qualification added in V2**: a small versioned Foundation-layer kernel is shared (vendored, not live) between the two products. See `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel.

### Current infrastructure baseline

Confirmed as of 2026-08-29: OVHcloud Dedicated Server `ns3006986.ip-149-202-64.eu` (operationally `ks-aw-01`). Active architecture documents must describe current deployment truth only. See `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` for the verified current state and the still-open `CURRENT_SERVICE_PLACEMENT.md` gap.

### Subdomain direction

See `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md` and `20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md` for current, verified status (`docs`/`trust` are now live, not planned).

### HCI

Confirmed design direction: evidence-centric, no universal person score, trust domains, public intelligence with all source URLs, source quality and identity resolution, favorable + unfavorable evidence, domain methods from psychology, trust, negotiation, game theory, classical strategy, self-reflection frameworks separated from formal enterprise decision scoring, human final decision, commercial Personal→Group/Private editions.

**New in V2**: the researched Subject's own rights are equally confirmed design direction, not an afterthought — see `01_SYSTEM_CONSTITUTION.md` Invariant 9.

### AI LEGO

Known: three mother documents, 289-method atlas, scoped authority chain, replay/rollback, jurisdiction, cross-model validation, `AGREE != FACT`.

## Open design decisions — status against V1's original list

| # | V1's original item | V2 status |
|---|---|---|
| 1 | Final HCI product name and trademark strategy | Still open — no reviewer finding, unchanged |
| 2 | Exact HCI trust-domain definitions and formulas | Still open — see `04_HCI30_PRODUCT_SPEC.md` note on the Trust-Domain-to-Dimension roll-up formula |
| 3 | Confidence algorithm v1 | Still open — `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04; note in V2 that bare percentages are replaced with qualitative bands until this ships (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`) |
| 4 | Evidence-quality algorithm v1 | Still open — `21` P0-04 |
| 5 | Risk model v1 | Still open — `21` P0-04 |
| 6 | Permission model v1 | Still open — `21` P0-01/P0-04 |
| 7 | HCI Domain Policy machine-readable schema | Still open — `21` P0-05; V2 adds the specific deterministic/probabilistic/LLM-assisted/human-only policy content (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Cross-Model Gate) |
| 8 | Public Intelligence source-quality scoring | Still open — formula itself; the pipeline hardening around it is resolved in V2 (`06`) |
| 9 | Identity-resolution thresholds | **Resolved for RESTRICTED confirmation by ADR-0015 (`HD-04=A`)** — deterministic/human confirmation is a hard synthetic runtime gate; lower-confidence scoring remains open |
| 10 | HCI-to-Cognitive integration contract schema | **Resolved in V2** — see `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` (transport, risk-tier reuse, agreement taxonomy reuse, usage metering) |
| 11 | Event naming/versioning standard | Still open |
| 12 | Tenant isolation implementation detail | **Resolved by ADR-0016 (`HD-05=A`)** — mandatory RLS + non-owner cross-tenant test; local synthetic runner exists, Docker evidence remains open |
| 13 | Data residency region plan | Still open (schema stubs kept, enforcement not built — see `12`) |
| 14 | Local-first Personal architecture | Still open |
| 15 | Report format and citation schema | Still open — structure defined (`19`), exact schema not |
| 16 | Paid plan packaging/pricing | Still open |
| 17 | Enterprise licensing | Still open |
| 18 | Method licensing/legal review | **Partially resolved in V2** — Big Five (IPIP) and MBTI licensing questions resolved (`05_HCI30_INTELLIGENCE_METHODS.md`); broader legal review still open |
| 19 | Scientific advisory process | Still open |
| 20 | HCIS public standard design | Still open |

## New decision records surfaced by the V2 review (not in V1's original list of 20)

See `D:\Work\agency-os\docs\HCI\HCI30_RESEARCH_REVIEW\22_OPEN_HUMAN_DECISIONS.md` for the complete set. Headline additions V1's own list missed entirely:

- Subject-type scope: **resolved by ADR-0011** — V1 Person-only with a forward-compatible nullable subject stub (`HD-00=C`)
- Data Subject (researched Person) rights channel: **resolved by ADR-0014** (`HD-03=A`; synthetic DSR runtime gate exists, realtest open)
- Tenant/Organization model reconciliation across HCI, AI LEGO, and the already-shipped portal code: **resolved by ADR-0009** (`HD-01=A`; mapping/migration/test gate open)
- Consent entity scope: **resolved by ADR-0010** (`HD-02=C`; model/policy/test gate open)
- EU AI Act / FCRA regulatory scope (`HD-20`)
- Controller/processor determination for the profiled Person (`HD-21`)
- Claim/Source tenant ownership — shared vs. tenant-scoped (`HD-16`)
- Trigger.dev network-isolation verification for the fetch/scan pipeline (`HD-19`)

## Next artifacts to produce

Recommended in this order (unchanged from V1's sequencing, with V2's new entities folded into item 1):

### 1. HCI Domain ERD

Must include: Person; Organization as a relationship/attribute node (ADR-0011, not an independently assessable subject); Relationship, Interaction, Evidence, Claim, Assessment, TrustDomain, Risk, Permission, Decision, Outcome, **Case/Engagement, DataSubjectRequest, PersonMergeLog/PersonSplitLog, Control/Mitigation** (all new in V2, see `07`).

### 2. HCI Trust & Risk Mathematical Specification

Define: scoring semantics, confidence semantics, evidence weighting, contradiction handling, time decay, severity-aware decay, model disagreement.

### 3. HCI Method Contract Specification

Define formal schema for: psychology, trust, negotiation, strategy, game theory, self-reflection. **Must include the `inference_mode` field (new in V2, `05`).**

### 4. Public Intelligence Technical Spec

Define: identity resolution (with the deterministic match gate), search planner, source registry, claim graph, URL provenance, contradiction workflow, report generation, **content isolation and minimum-viable authenticity check (new in V2)**.

### 5. HCI Domain Policy

Machine-readable rules for: protected traits, allegations, psychometrics, classical strategy, high-impact decisions, research legality, **the deterministic/probabilistic/LLM-assisted/human-only field policy (new in V2, `10`)**.

### 6. HCI × AI LEGO Integration Contract

Define: request package, response package, run references, authority mapping, failure modes, compatibility, replay. **Largely specified in V2 `10` — this artifact formalizes it into machine-readable form.**

### 7. Subdomain / gateway deployment ADR

Formalize: hostnames, TLS, routing, auth, API namespaces, cookie boundaries, CORS, service ownership.

### 8. Foundation Kernel extraction *(new in V2)*

Formalize the shared thin-reference types, epistemic vocabulary, risk-tier ladder, and tenant substrate into `shared/platform`/`shared/contracts` per `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel — this should happen alongside or before artifact #1, since the ERD depends on knowing what's vendored from the kernel vs. HCI-owned.

## AI implementation rule

No AI should begin coding production HCI logic until the relevant domain and contract artifact above exists, **and no AI should implement the content of a 🔴 DECISION PENDING block anywhere in this document set until the operator has explicitly resolved it.**

When ambiguity appears, create an ADR rather than silently inventing behavior.
