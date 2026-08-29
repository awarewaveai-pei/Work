# 05 DOMAIN ARCHITECTURE REVIEW: Domain Architecture Review

> Independent analysis by Reviewer A (Domain Architecture) — part of the HCI-30 x AI LEGO V1 architecture re-research. This reviewer worked in isolation from the other 8 reviewers; any agreement with other reviewers noted elsewhere in this package (see `14_CONVERGENCE_MATRIX.md`) was independently re-derived, not copied.

---

## Narrative Analysis

# Domain Architecture Review — HCI-30 × AI LEGO V1 Blueprint

## Method and scope

I read all 24 files in `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\` in full, in the prescribed order, plus `manifest.json`. Because this lens explicitly requires judging whether HCI-30 and AI LEGO should stay independent using domain-ownership criteria, I also opened the actual AI LEGO machine-readable specs at `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\` (evidence, decision, domain, governance subfolders) — these are not summaries, they are the real, ADR-governed JSON Schema files that already exist for AI LEGO. This turned out to be essential: several of my most load-bearing findings are not visible from the blueprint prose alone — they only surface when the blueprint's claims about HCI's future entities are checked against what AI LEGO has *already built*. I confirmed via `Glob`/`Bash` that `D:\Work\agency-os\systems\` and `D:\Work\agency-os\shared\` (the HCI/shared implementation trees doc 17 proposes) do not exist yet — HCI-30 is 100% pre-code, architecture-only. That is good news: every finding below is cheap to act on now and would be expensive later.

## Verdict on the top-level question: peer products or shared platform?

**Keep HCI-30 and AI LEGO as independent peer products at the domain layer.** The central thesis of docs 01/02/09/10 — that "who is this person, can we trust them, should we collaborate" (Person/Relationship/TrustDomain/Decision) is a genuinely different subject matter from "how do we execute and verify a cognitive workflow" (Method/Workflow/ExecutionRun) — is correct, not merely asserted. I checked it against all six required criteria independently rather than accepting V1's framing:

- **Domain ownership**: Strong PEER. A Person/Relationship/TrustDomain aggregate and a Method/Workflow/ExecutionRun aggregate answer unrelated questions and have no natural shared invariants. This is a real bounded-context split, not an artificial one.
- **Failure independence**: Strong PEER, and well-designed. Doc 13's graceful-degradation table ("If AI LEGO is down, HCI should still support historical reads / manual evidence / manual assessment") is exactly the right contract, and doc 01 Invariant 3 states it as a system-level rule rather than an aspiration. Confirmed as correct engineering, not just correct on paper.
- **Commercial independence**: PEER at the SKU layer (doc 15's "Do not force HCI customers to buy Cognitive OS" is sound), but this *requires* a shared, product-agnostic control plane underneath (Tenant/Subscription/Entitlement) — doc 12 already says this correctly. No disagreement here.
- **Data ownership**: Conceptually PEER and correct (doc 07's "HCI owns... / HCI does not own..." split, doc 10's "two evidence ledgers" doctrine). But — see findings below — the ownership *split* is right while the *namespacing* that would make it tamper-evident in code is missing, and two systems have already independently built overlapping entity names for different things.
- **Deployment independence**: Not really applicable yet — a single OVH dedicated server (doc 23) is the actual failure domain for everything today regardless of software boundaries. Doc 12's "modular monolith first, avoid premature microservices" is correctly conservative and should be read as: HCI is one monolith, AI LEGO is a second monolith, not one shared monolith. This is implicit rather than stated; I recommend making it explicit rather than changing it.
- **Evolution independence**: Strong PEER. The versioned compatibility-matrix mechanism in doc 10 ("HCI 2.7 requires Cognitive Runtime >=5.1<6") is the right tool for letting a 289-method Atlas grow without forcing an HCI release, and vice versa.

So the peer-product thesis survives independent scrutiny on 6/6 criteria. My disagreement with V1 is narrower and more consequential than "should these be one product": **a handful of Foundation-layer primitives are being independently reinvented by each system instead of being pulled into the `shared/platform` layer that doc 18 already anticipated a place for.** This is not "build a shared God Platform" — it is the opposite failure: doc 18's own Foundation LEGO category (IAM, audit, secrets, event bus, tenant context) exists precisely to prevent this, and it is currently under-used. Concretely: Tenant/Workspace identity, epistemic-status/provenance labeling, the canonical `EvidenceRef`/`PersonRef` thin-reference layer, and a generic "candidate → gate → admitted" promotion pattern each already have a prose-level HCI version *and* an independently-built AI LEGO version, with no reconciliation step anywhere in the 24 documents.

## Are the domain boundaries correct?

Yes at the top level (see above). The specific boundary mechanism — "two evidence ledgers" (doc 10:95-109: HCI Domain Evidence answers "why do we believe something about the person," AI LEGO Execution Evidence answers "how did the cognitive run produce this result") — is the right *idea*. But I checked it against AI LEGO's actual, ACTIVE schemas and found the boundary is not yet tamper-evident: `ai-lego://specs/evidence/evidence.schema.yaml` and `ai-lego://specs/evidence/claim.schema.yaml` are real, ADR-adjacent, already-built full record types named `Evidence` and `Claim` — the exact same bare names doc 07:16-17 uses for HCI's own Person-domain `Evidence`/`Claim` entities, and doc 06 uses throughout for the public-intelligence pipeline. Doc 18:232-247 already anticipated the fix — a deliberately small shared canonical model of thin references (`EntityRef`, `PersonRef`, `OrganizationRef`, `EvidenceRef`, `TenantContext`, `ActorRef`, `SourceRef`) that is supposed to be what crosses the HCI↔AI LEGO boundary, never a full record. But that `EvidenceRef` has not actually been built, and AI LEGO's `evidence.schema.yaml` is a full record (required: `evidence_id`, `provenance`; optional `content`, `source`, `quality_assessment`), not a stub — it is already being embedded directly into AI LEGO's `Claim.supporting_evidence[]` and `Decision.evidence_snapshot`. If an implementer wires the HCI↔AI LEGO integration adapter (doc 17: `systems/hci30/integrations/cognitive-os/`) without an explicit disambiguation rule, "Evidence" will mean two different, differently-shaped, differently-owned things depending on which side of the adapter you are standing on, with nothing in code forcing the distinction. This is exactly the class of failure doc 01's "Definition of architecture failure" warns about ("a vendor-specific dependency inside stable domain logic") applied one layer down — a same-named-but-different-shaped dependency inside stable domain logic.

## Are the aggregates correct?

Mostly, with four specific problems worth flagging.

**TrustDomain vs. AssessmentDimension — two unlinked taxonomies.** Doc 04 defines two lists that look like they should be the same axis system but aren't declared to be: "Trust domains" (04:52-66, 7 items: Operational/Competence/Confidentiality/Financial/Strategic/Reputational/Governance) and "Core analysis dimensions" (04:68-85, 14 items: Integrity consistency, Reliability, Competence, Communication quality, Boundary respect, Reciprocity, Conflict repair, Power behavior, Incentive alignment, Risk externalization, Information governance, Learning/adaptability, Context stability, Predictability). Doc 07 then lists both `TrustDomain` and `AssessmentDimension` as separate core entities (07:25-26) with separate tables (`trust_domains`, `assessment_dimensions`, 07:157-158) but never states how the 14 granular, observation-facing dimensions roll up into the 7 coarse, decision-facing domains — e.g. is "Competence" (dimension #3) the same concept as "Competence Trust" (domain #2), or a narrower input that partially feeds it? Without a declared aggregation function, two implementers (or two AI coding agents) will build two different mappings and neither will be wrong on paper. Doc 21:101-113 (P0-04) already schedules `HCI_TRUST_DOMAIN_SPEC.md` — this finding sharpens that gap rather than discovering a new one, but it specifically identifies *which* two lists must be reconciled and how.

**Risk/RiskEvent and the undeclared event-sourcing choice.** Doc 02:43 names a bare `Risk` object; doc 07:27 names `RiskEvent` and a `risk_events` table (07:158); doc 19:213 talks about "Risk Analysis" as a report section. This naming drift (Risk vs. RiskEvent) is symptomatic of a real, unresolved architecture decision the blueprint never makes explicit anywhere in 24 documents: is HCI's core state event-sourced (immutable append-only events, current state always derived) or CRUD-with-versioning (mutable aggregate roots that get new versions)? This is one of the single highest-leverage decisions for a system whose Invariant 6 is "historical truth is immutable" (01:85-87) and whose P0-02 gap (21:67-82) demands full bitemporal history ("what did HCI know on date X?"). An event-sourced Risk/Decision/Assessment core would satisfy both requirements almost for free; a CRUD-with-versioning core needs bitemporal columns bolted onto every table by hand. The blueprint leans event-sourced in spirit (Invariant 6, doc 13's replay requirements) but never says so outright, and the entity-naming inconsistency (`Risk` in one doc, `RiskEvent` in another) is the visible symptom of that ambiguity.

**Relationship graph conflates node types with edge role types.** Doc 07:186-195 says: "Track relationships among: Person, Company, Project, Investor, Partner, Supplier, Client, Advisor, Introducer." Person and Company are entity types; Investor/Partner/Supplier/Client/Advisor/Introducer are *roles a Person or Company plays toward another Person or Company* — they belong on the Relationship edge (`role_type`), not as their own graph node types. As written, a reasonable implementer could build "Investor" as a first-class node type sitting alongside "Person," which would be wrong. This is a small, mechanical, low-controversy fix, but worth stating explicitly since it currently reads as ambiguous.

**"Project" is overloaded between two hierarchies.** The same relationship-graph sentence (07:186-195) lists "Project" as something a Person has a relationship to, while doc 08:86-98 and doc 12:27-39 both use "Project" as the *bottom tier of the commercial tenancy hierarchy* (Tenant → Organization → Workspace → Project). Doc 07:137-143 is explicit that "HCI does not own... tenant billing," yet if the business-relationship-graph's "Project" is the same object as the tenancy-scoping "Project," HCI's domain data is directly referencing a platform/control-plane concept, which blurs exactly the boundary doc 07 draws two paragraphs earlier. This compounds a larger finding below (Tenant/Workspace conflict).

## Missing entities

**Case / Engagement — the unit that bounds a due-diligence effort.** Doc 10:48 ("Request package," `case_id`) and doc 06's "Research modes" (Quick Search / Standard Research / Deep Due Diligence / Continuous Monitoring, 06:258-263) both presuppose a bounded, versioned, replayable unit of work — but no such entity appears anywhere in doc 02's or doc 07's core entity lists. `research_reports` and `research_report_versions` exist as tables (07:177-178), but nothing owns "the ongoing work on Person X for the purpose of Deal Y" across multiple interactions, evidence admissions, and decisions over time. Without this, doc 13's replay requirement ("replay a decision" — 13:63-75) has to replay against the entire eternal history of a Person rather than a bounded case, and doc 10's `case_id` has no defined home. I recommend `Case`/`Engagement` be added as a real aggregate root (purpose, risk_level, relationship_context, evidence refs, decisions, research reports) at Wave 1, not discovered ad hoc during Wave 4 (Public Intelligence) implementation.

**Consent / lawful-basis modeling — the most legally load-bearing entity in the model is undefined.** `Consent` appears exactly once, as a bare noun with zero elaboration, in doc 07:31's entity list. Nowhere in 24 documents is it stated *whose* consent this represents. HCI's entire mission is profiling third parties — Persons — who typically have not been asked and have not agreed to being researched (that is inherent to due-diligence/OSINT work, doc 06). So `Consent` could mean: the tenant's own internal authorization-to-investigate; actual data-subject consent (legally required in several jurisdictions for background-check-adjacent uses); or a data-source's terms of use. Doc 21:213-230 (P1-01) defers `PURPOSE_AND_LAWFUL_BASIS_MATRIX.md` and `CONSENT_AND_NOTICE_MODEL.md` to the enterprise-readiness wave rather than treating it as a Wave-1 domain question — but the domain model itself needs to know which of these three meanings `Consent` carries before the ERD is frozen (P0-01, doc 21:44-65), because that determines whether it is a field on `Case`, a field on `Person`, or a wholly separate ledger. I independently found strong corroboration for this gap on the AI LEGO side: `specs/domain/personal-data-redacted-event.schema.yaml` states plainly that AI LEGO's own mother documents sketch a "Global Privacy Engine Rights Model" and "Lawful Basis / Consent Registry" (Master Plan §§100-101) around a "Data Subject" concept, and that "no Domain Model schema exists for it" on the AI LEGO side either. This is the single best opportunity in the whole review to build a primitive once, shared, correctly — rather than have HCI invent its own undocumented `Consent` semantics now and AI LEGO independently build out its already-sketched Privacy Engine later, producing two incompatible answers to "who is a Data Subject and what rights do they have" a year from now.

**DataSubjectRequest / correction-and-dispute — the profiled Person has no way to act on the system.** Doc 07:30 lists `Review` as an entity, but every description of `Review` in the blueprint (04:1-163, 19:1-286) describes HCI's own *internal* periodic reassessment trigger, never a request initiated by the profiled Person. Doc 15's public commitments ("We separate evidence from interpretation... We disclose method and source provenance," 15:107-111) imply a norm of fairness toward the profiled subject, but nothing in the entity list lets that subject exercise a right to see, dispute, or request correction of what HCI holds about them. This is precisely the "right to correction/appeals" risk category the mission brief calls out by name, and it is currently absent, not merely deferred — doc 21's privacy-ops wave (P1-01) lists a `DSAR_RUNBOOK.md` but that is an operational runbook, not a domain entity, and runbooks cannot be built against an ERD that has no place to record an incoming correction request, its resolution, or its effect on evidence lineage.

**Control / Mitigation — the safety principle has no auditable record.** Doc 04:146-163 ("Cooperation safety principle") lists concrete controls — escrow, milestone payments, dual approval, limited API permissions, audit rights, credential rotation, exit procedure — and doc 19:216 lists "Recommended Controls" as a report section. But no entity anywhere tracks whether a recommended control was actually adopted, by whom, and whether it is still in force. Without this, "if all current assessments are wrong, what protects us?" (04:150) is answerable only as prose in a generated report, not as a queryable, auditable fact tied to a Decision — which undercuts the very safety principle it is meant to operationalize.

## What is correctly *not* over-engineered

Two places deserve explicit credit rather than a manufactured criticism, since the brief asks me to hunt for both over- and under-engineering. `Source` / `SourceSnapshot` / `SourceRelationship` as three separate entities (07:18-20, 166-168) looks expensive for a pre-code system, but it is directly earned by doc 06's explicit requirement that "URL count is not independent-source count" (06:159) — tracking `cites`/`derived_from`/`original_source` is exactly what stops a report from treating five reprints of one wire story as five independent corroborations, which is a first-order integrity requirement for a product whose brand promise is evidentiary rigor (15:100-111). I would not cut this. Likewise, doc 12's "modular monolith first... avoid premature microservices" (12:1-9) is correctly conservative given the actual current infrastructure (a single OVH dedicated server, doc 23) — this is the anti-overengineering discipline working as intended and should be kept exactly as written.

## Premature or duplicate abstraction

Beyond the Evidence/Claim naming collision above, two more instances of the same pattern — a concept independently reinvented on both sides of the peer boundary instead of being shared once — are worth flagging together as the strongest evidence for the "shared foundation, not shared platform" recommendation:

1. **Tenant/Workspace hierarchy conflict.** HCI's blueprint commits, in three separate places (doc 08:86-98, doc 12:27-39, doc 17:172 placing tenant scaffolding under `shared/platform/tenants/`), to a four-level hierarchy `Tenant → Organization → Workspace → Project`. AI LEGO's `specs/domain/tenant.schema.yaml` is not a sketch — it is `status: ACTIVE`, traces to an ACCEPTED ADR (ADR-003), and explicitly defines Tenant as "the outermost billing/legal/deployment entity... sitting above Workspace in the blast-radius chain with a strict `Tenant 1:N Workspace` cardinality" — a **three**-level model with no Organization layer between Tenant and Workspace. If HCI's tenant/workspace primitive is meant to be the shared Foundation LEGO doc 17 already places it as, these two cardinalities are in direct conflict and one of them has to change before either system reaches its Wave-1/Wave-2 identity work. If they are *not* meant to be the same primitive, then doc 17's placement of HCI's tenant hierarchy under `shared/platform/tenants/` is misleading and should say so explicitly.

2. **Epistemic-status labeling.** HCI's "Fact model" (07:48-76) and Invariant 1 (01:28-37, "Fact != Observation != Interpretation != Hypothesis != Assessment != Decision") describe, in prose, exactly the problem AI LEGO's `specs/governance/epistemic-label.schema.yaml` already solves as a governed, versioned, ADR-backed schema (`epistemic_type` enum: SOURCE_FACT / EVIDENCE / ASSUMPTION / HYPOTHESIS / AI_INFERENCE / AI_SUGGESTION / HUMAN_OPINION / CALCULATED_RESULT / SIMULATED_RESULT / UNKNOWN / DECISION, plus an orthogonal `authorship_state` and a `locked` axis with explicit legal promotion paths). Two of HCI's own four named epistemic levels — "Fact" and "Interpretation" — have no corresponding table in doc 07's "Recommended relational tables" list (07:144-179) at all; only Observation and Hypothesis are operationalized. Rather than let this gap get filled by an independently-invented HCI-only taxonomy later, I recommend HCI's epistemic-status handling be built by extending the already-ADR-governed shared primitive.

## Closing synthesis

Every finding above shares the same shape: **the top-level peer-product split is architecturally sound and should not be disturbed, but a specific, small set of Foundation-layer primitives are being (or are about to be) independently reinvented on both sides of that boundary, at exactly the moment — pre-code — when consolidating them costs almost nothing.** This is not a call for a shared platform in the forbidden sense; doc 18 already carved out the right home for this (Foundation LEGO) and simply has not been walked through for these four primitives (Tenant/Workspace, epistemic-status, the EvidenceRef/PersonRef thin-reference layer, and the privacy/Data-Subject-rights registry AI LEGO's own mother documents already sketch). Fixing this now is a documentation and naming exercise; discovering it after both systems have shipped their own versions would be a migration.


---

## Change Items (11)

### DOM-01 — Tenant/Workspace hierarchy conflicts with AI LEGO's already-ADR-accepted Tenant model

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | HCI blueprint commits to Tenant -> Organization -> Workspace -> Project (08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:86-104; 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:27-39) and doc 17_REPOSITORY_LAYOUT_AND_PATHS.md:172 places HCI's tenant scaffolding under the shared 'shared/platform/tenants/' directory, implying this is meant to be the same primitive AI LEGO uses. |
| **Problem** | AI LEGO's specs/domain/tenant.schema.yaml (status ACTIVE, decided_by ADR-003, ACCEPTED) already defines Tenant as the outermost entity with a strict Tenant 1:N Workspace cardinality -- no Organization layer. HCI's 4-level hierarchy and AI LEGO's already-accepted 3-level hierarchy cannot both be 'the' shared Tenant/Workspace primitive without reconciliation, and nothing in the 24 blueprint docs acknowledges the conflict. |
| **Evidence** | 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:86-104 (Tenant/Organization/Workspace/Project); 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:27-39 (same hierarchy repeated); 17_REPOSITORY_LAYOUT_AND_PATHS.md:172 (shared/platform/tenants/ as the intended shared home); corroborating cross-repo evidence: D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\domain\tenant.schema.yaml (ACTIVE, ADR-003, 'Tenant 1:N Workspace' cardinality, no Organization layer). |
| **Risk if unchanged** |  |
| **Alternative A** | Adopt AI LEGO's 3-level Tenant model as the single shared primitive; HCI represents 'Organization' as an attribute or a Relationship-graph node under Workspace rather than a fourth hierarchy tier. |
| **Alternative B** | Extend AI LEGO's ADR-003 Tenant schema with an optional Organization child entity (Tenant 1:N Organization 1:N Workspace), keeping one shared schema but a richer cardinality. |
| **Alternative C** | Keep the two hierarchies deliberately separate (HCI owns its own Tenant/Organization/Workspace/Project concept, not derived from AI LEGO's), and stop referencing shared/platform/tenants/ as the common home in doc 17. |
| **Recommended** | Before Wave 1/2 implementation, produce an explicit ADR reconciling the two models: either (a) extend AI LEGO's accepted Tenant schema with an optional Organization layer so both systems share one Foundation LEGO Tenant/Workspace primitive, or (b) declare HCI's tenant hierarchy deliberately separate from AI LEGO's and correct doc 17 so it stops implying they share the same shared/platform/tenants/ implementation. |
| **Why** | Both are candidate readings of the current blueprint and neither is wrong on its own terms -- but building against both simultaneously is impossible, and this is exactly the kind of boundary-defining decision the constitution (01_SYSTEM_CONSTITUTION.md) says must be resolved by ADR rather than discovered during coding. |
| **Blast radius** | Affects the Foundation LEGO tenant/identity layer consumed by every future service in both products, plus entitlement/billing metering (doc 12 control plane) and RLS design (doc 11). |
| **Migration impact** | None yet (pre-code); becomes expensive only if deferred past Wave 1. |
| **Rollback** | Low cost pre-code: this is a documentation/ADR fix, not a migration, as long as it is resolved before either system's Wave-1 schema work begins. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | YES |

### DOM-02 — HCI 'Evidence'/'Claim' and AI LEGO 'Evidence'/'Claim' are same-named, differently-shaped, differently-owned record types with no disambiguation rule

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | Doc 07 defines HCI-domain Evidence and Claim as person/relationship-scoped, tenant-owned, RESTRICTED entities (07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:9-34, 78-100, 119-135). Doc 10 states 'two evidence ledgers' must not be merged in semantics (10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:95-109). Doc 18 proposes a small shared canonical reference model including EvidenceRef, PersonRef (18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:232-247) as what should cross the peer boundary. |
| **Problem** | AI LEGO already has ACTIVE, full (non-stub) record types literally named Evidence and Claim (evidence.schema.yaml, claim.schema.yaml), embedded directly inside Decision.evidence_snapshot and Claim.supporting_evidence -- not thin refs. The EvidenceRef/PersonRef thin-reference layer doc 18 promises as the actual crossing mechanism has not been built. An implementer wiring the HCI<->AI LEGO adapter (systems/hci30/integrations/cognitive-os/) has no code-level guardrail preventing 'Evidence' from meaning either thing depending on which side of the adapter is read. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:9-34 (Evidence, Claim listed as HCI core entities); 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:95-109 (two-ledgers doctrine, no enforcement mechanism given); 18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:232-247 (EvidenceRef/PersonRef promised, not built); corroborating cross-repo evidence: D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\evidence\evidence.schema.yaml and claim.schema.yaml (both ACTIVE, full records, already referenced by decision.schema.yaml's evidence_snapshot field). |
| **Risk if unchanged** |  |
| **Alternative A** | Namespace prefix convention (hci.Evidence / cognitive.Evidence) enforced by lint/architecture test (doc 13 already proposes architecture tests for related invariants). |
| **Alternative B** | Build EvidenceRef/PersonRef now as the only type allowed to cross the adapter boundary; full records never leave their owning system. |
| **Alternative C** | Rename one side's type outright (e.g. AI LEGO keeps 'Evidence', HCI's domain object becomes 'CollaborationEvidence' or similar) -- more disruptive, not recommended as first choice. |
| **Recommended** | Build the EvidenceRef/PersonRef thin-reference layer doc 18 already promised, and add an explicit rule (ADR or governance doc) that no code, schema, or API may use the bare unqualified name 'Evidence' or 'Claim' for either system's full record type -- require a namespace prefix (e.g. hci.Evidence vs cognitive.Evidence) wherever both could appear in the same context (docs, code, logs, integration contract). |
| **Why** | This is exactly the failure mode doc 01's 'Definition of architecture failure' warns against one layer down from where it is written -- a same-named-but-different-shaped dependency living inside otherwise-correct domain logic, invisible until an integration bug or a data leak surfaces it. |
| **Blast radius** | Integration contract layer only (doc 10, doc 17's integrations/cognitive-os/ adapter) -- does not require reworking either product's internal domain model. |
| **Migration impact** | None if resolved before either integration adapter or shared canonical model is coded. |
| **Rollback** | Trivial pre-code; a naming/namespace convention change. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### DOM-03 — HCI's Fact/Observation/Interpretation/Hypothesis epistemic ladder duplicates AI LEGO's already-built, ADR-governed epistemic-status primitive, and two of its four levels have no table

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 01_SYSTEM_CONSTITUTION.md:28-37 (Invariant 1: Fact != Observation != Interpretation != Hypothesis != Assessment != Decision) and 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:48-76 ('Fact model' section) describe a 4-level epistemic status ladder in prose only. |
| **Problem** | AI LEGO's specs/governance/epistemic-label.schema.yaml already implements a governed, ADR-backed (ADR-004, ACCEPTED) equivalent -- an 11-value epistemic_type enum (SOURCE_FACT/EVIDENCE/ASSUMPTION/HYPOTHESIS/AI_INFERENCE/AI_SUGGESTION/HUMAN_OPINION/CALCULATED_RESULT/SIMULATED_RESULT/UNKNOWN/DECISION) plus orthogonal authorship_state and locked axes with explicit legal promotion paths (e.g. UNKNOWN cannot jump directly to SOURCE_FACT). Meanwhile HCI's own 'Recommended relational tables' list (07:144-179) only operationalizes 2 of its 4 named levels (observations, hypotheses) -- there is no facts table and no interpretations table anywhere in the schema, despite both being named as mandatory-to-separate in Invariant 1. |
| **Evidence** | 01_SYSTEM_CONSTITUTION.md:28-37; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:48-76 (Fact model prose) vs. 144-179 (relational tables list missing facts/interpretations); corroborating cross-repo evidence: D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\governance\epistemic-label.schema.yaml (ACTIVE, ADR-004, 11-value epistemic_type enum + authorship_state + locked, with explicit promotion-path rules). |
| **Risk if unchanged** |  |
| **Alternative A** | Adopt epistemic-label.schema.yaml wholesale as HCI's Foundation LEGO epistemic primitive. |
| **Alternative B** | Keep HCI's own 4-level model but formally map each level onto the shared enum's values for interoperability, without replacing HCI's own vocabulary in UI/reports. |
| **Alternative C** | Leave the two systems independent and accept the risk of divergence, explicitly documenting why HCI's needs differ enough to justify a separate taxonomy (not currently argued anywhere in the blueprint). |
| **Recommended** | Do not invent a separate HCI-only epistemic ladder. Extend or reference the already-built epistemic-label.schema.yaml as HCI's Foundation LEGO for epistemic status; map HCI's 'Fact' to SOURCE_FACT and HCI's 'Interpretation' to either AI_INFERENCE or HUMAN_OPINION depending on origin, and add the missing tables (or explicitly document that Fact = a Claim admitted at VERIFIED_FACT status per doc 19's claim-state list, if that is the intended reading). |
| **Why** | HCI's own core invariant (Invariant 1) is currently backed by half-built plumbing (2 of 4 levels have tables), while a stricter, already-governed version of the same primitive sits unused one repository level away. Reinventing it independently risks producing an incompatible second taxonomy exactly where the constitution says consistency matters most. |
| **Blast radius** | HCI's core Fact/Observation/Interpretation/Hypothesis handling across every domain entity that carries a status (Evidence, Claim, Assessment, Decision) -- moderate but purely additive, no removal required. |
| **Migration impact** | None pre-code; becomes a real migration only after HCI_TRUST_DOMAIN_SPEC.md-equivalent work ships without this reconciliation. |
| **Rollback** | Low; this is a P0-04 mathematical-spec deliverable (doc 21) not yet started, so no rework is at risk. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### DOM-04 — Consent entity is undefined -- the single most legally load-bearing concept in the model has zero specified semantics

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:31 lists 'Consent' as a bare core entity with no further elaboration anywhere in any of the 24 documents. |
| **Problem** | HCI's core activity is profiling third-party Persons who have not agreed to being researched (04_HCI30_PRODUCT_SPEC.md, 06_HCI30_PUBLIC_INTELLIGENCE.md throughout). It is undecided whether 'Consent' means the tenant's internal authorization-to-investigate, actual data-subject consent (legally required in some jurisdictions for background-check-adjacent uses), or a data source's terms of use. Doc 21:213-230 (P1-01) defers PURPOSE_AND_LAWFUL_BASIS_MATRIX.md and CONSENT_AND_NOTICE_MODEL.md to the enterprise-readiness wave, but this is a domain-modeling question that the P0-01 ERD (doc 21:44-65) cannot be correctly frozen without first resolving. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:31; 21_HCI_TOP_TIER_GAP_ANALYSIS.md:213-230 (P1-01, deferred to enterprise wave); corroborating cross-repo evidence: D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\domain\personal-data-redacted-event.schema.yaml, which independently states that AI LEGO's own Master Plan sections 100-101 sketch a 'Global Privacy Engine Rights Model' / 'Lawful Basis / Consent Registry' around a 'Data Subject' concept that 'no Domain Model schema exists for... not one of MP §3's 22 objects, not Tenant #23 either' -- i.e. the same gap independently surfaced on the AI LEGO side. |
| **Risk if unchanged** |  |
| **Alternative A** | Model Consent narrowly as tenant-internal 'authorization to investigate' only, and explicitly declare data-subject consent out of scope (defer to a documented legitimate-interest/lawful-basis policy instead). |
| **Alternative B** | Build the shared 'Data Subject rights registry' AI LEGO's Master Plan already sketches as a Foundation LEGO both products consume. |
| **Alternative C** | Model three distinct fields/sub-entities (tenant authorization, subject consent where applicable, source terms-of-use) rather than one bare Consent entity. |
| **Recommended** | Resolve, before P0-01 ERD freeze, which of the three meanings Consent carries (or model all three as distinct fields/entities). Given the independent AI LEGO-side sketch of a 'Global Privacy Engine' / 'Data Subject' registry, treat this as a build-once-shared-Foundation-LEGO opportunity rather than letting HCI and AI LEGO each invent incompatible answers later. |
| **Why** | This determines whether Consent is a field on Case/Engagement, a field on Person, or a wholly separate ledger -- a structural ERD decision, not a later add-on -- and it sits at the exact intersection of privacy law, defamation exposure, and cross-border data rules the mission brief specifically asked me to hunt for. |
| **Blast radius** | Touches the ERD (P0-01), the Case/Engagement entity (see DOM-06), retention/deletion policy (doc 07's retention principle), and cross-border jurisdiction handling. |
| **Migration impact** | Significant if deferred: retrofitting lawful-basis tracking onto already-live Evidence/Claim records is materially harder than designing it in from Wave 1. |
| **Rollback** | Low cost now; expensive after P0-01 ERD is frozen and implemented. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | YES |

### DOM-05 — No entity lets the profiled Person exercise a right to see, dispute, or correct what HCI holds about them

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:30 lists 'Review' as a core entity; every description of Review in 04_HCI30_PRODUCT_SPEC.md and 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md describes an internally-triggered periodic reassessment, never a subject-initiated request. |
| **Problem** | The mission brief explicitly asks reviewers to hunt for underestimated 'right to correction/appeals' risk. HCI's entity model has no DataSubjectRequest/CorrectionRequest concept: the profiled Person exists only as inert subject matter, never as a rights-holder who can act on the system. Doc 21's P1-01 lists a DSAR_RUNBOOK.md deliverable, but a runbook cannot function without a domain entity to record an incoming request, its resolution, and its effect on evidence/claim lineage. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:30 (Review, no subject-initiated variant); 04_HCI30_PRODUCT_SPEC.md (Review Due UI concept, internal only); 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:14-25 (Review Due listed as an internal dashboard section); 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-230 (DSAR_RUNBOOK.md deferred to P1 with no domain-entity precursor named). |
| **Risk if unchanged** |  |
| **Alternative A** | Full DataSubjectRequest entity with lifecycle and lineage into evidence versioning. |
| **Alternative B** | Explicitly declare HCI out of scope for subject-initiated correction in v1 (a legitimate product decision) and document why, rather than leaving it silently absent. |
| **Alternative C** | Route subject requests entirely through tenant-side manual process (outside HCI's system of record) -- weakest option, breaks the audit/lineage guarantee doc 01 requires elsewhere. |
| **Recommended** | Add a DataSubjectRequest (or similar) entity at the Wave-1 ERD stage: request type (access/correction/dispute/deletion), submitting party, linked Claims/Evidence/Assessments affected, resolution, and lineage into the bitemporal history (P0-02) so a correction produces a new version rather than a silent overwrite (consistent with Invariant 6). |
| **Why** | This is not a hypothetical -- HCI's own claim-state model (06_HCI30_PUBLIC_INTELLIGENCE.md:188-197) already tracks REJECTED and contradiction states for third-party claims, meaning the mechanism for 'this assertion was successfully disputed' half-exists for external sources but not for the subject's own voice. |
| **Blast radius** | New entity + workflow; interacts with evidence-integrity/tamper-evidence design (P0-03) and bitemporal history (P0-02), both already scheduled. |
| **Migration impact** | Low now; potentially significant later if a jurisdiction mandates subject access and no entity exists to satisfy it. |
| **Rollback** | Low if added at Wave 1; becomes a compliance and product-scope decision if HCI ships without ever deciding whether it accepts subject-initiated requests at all. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### DOM-06 — No Case/Engagement aggregate bounds a due-diligence effort, despite the integration contract already assuming one exists

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:42-59 references a 'case_id' in the request package as if it is an established HCI concept. 06_HCI30_PUBLIC_INTELLIGENCE.md:258-263 defines Research modes (Quick Search/Standard Research/Deep Due Diligence/Continuous Monitoring) that need a bounded unit to attach to. |
| **Problem** | Neither 02_PRODUCT_BOUNDARIES.md's core domain objects list nor 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md's core entities list (07:9-34) contains a Case, Engagement, or equivalent aggregate root. research_reports/research_report_versions exist as tables (07:177-178) but nothing owns the purpose, risk_level, relationship_context, and set of evidence/decisions that span a single piece of due-diligence work over time. Doc 13's replay requirement (13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:63-75) needs a bounded unit to replay against; without Case/Engagement, replay has to reconstruct against the entire eternal Person history. |
| **Evidence** | 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:42-59 (case_id referenced, never defined); 06_HCI30_PUBLIC_INTELLIGENCE.md:256-263 (Research modes needing a bounded scope); 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:9-34 and 144-179 (no Case/Engagement entity or table); 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:63-75 (replay scope ambiguity). |
| **Risk if unchanged** |  |
| **Alternative A** | Add Case/Engagement as a distinct HCI-domain aggregate, separate from and referencing (not equal to) the tenancy Project. |
| **Alternative B** | Merge the concept into Project itself, making Project a domain-meaningful unit rather than a pure billing container -- simpler but risks re-coupling domain data to the tenancy control plane doc 07 says HCI must not own. |
| **Alternative C** | Defer and let 'case_id' remain an opaque string in the integration contract until Wave 4 -- cheapest short-term, but leaves doc 13's replay requirement unsatisfiable in the interim. |
| **Recommended** | Add Case/Engagement as a Wave-1 aggregate root: purpose, risk_level, relationship_context, evidence refs, decisions, research report refs, lifecycle state. Clarify its relationship to the tenancy 'Project' concept (08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:86-98) -- they read as different things (billing-scoping container vs. domain workflow unit) but the blueprint currently conflates them via the Relationship-graph's overloaded 'Project' reference (07:186-195). |
| **Why** | This is not a nice-to-have -- it is a prerequisite for the replay guarantee doc 13 already requires and for making sense of case_id, which the integration contract already uses as if it existed. |
| **Blast radius** | Affects the ERD (P0-01), the integration contract's request package shape (doc 10), and potentially the commercial Project/entitlement metering unit (doc 08) if the two concepts are meant to relate. |
| **Migration impact** | Low now; becomes a real migration once research_reports/evidence records accumulate without a bounding entity to retrofit. |
| **Rollback** | Low if added before P0-01 freeze. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### DOM-07 — Relationship graph conflates entity node types with role types

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:186-195 ('Relationship graph'): 'Track relationships among: Person, Company, Project, Investor, Partner, Supplier, Client, Advisor, Introducer.' |
| **Problem** | Person and Company are entity types; Investor/Partner/Supplier/Client/Advisor/Introducer are roles a Person or Company plays toward another Person or Company. Listing them together in one flat list invites an implementer to build 'Investor' as its own first-class graph node type sitting alongside 'Person', which is a modeling error -- role type belongs on the Relationship edge, not as a node type. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:186-195. |
| **Risk if unchanged** |  |
| **Alternative A** | State explicitly: nodes = Person \| Organization; role_type = edge attribute enum. |
| **Alternative B** | Keep the flat list but add a sentence distinguishing node types from role types without restructuring the list itself. |
| **Alternative C** | Leave as-is and rely on implementer judgment -- not recommended given demonstrated ambiguity. |
| **Recommended** | Clarify in the domain model documentation: Relationship nodes are Person \| Organization only; Investor/Partner/Supplier/Client/Advisor/Introducer are values of a role_type attribute on the Relationship edge. |
| **Why** | Small, mechanical, low-controversy, but exactly the kind of ambiguity that produces an incorrect graph schema if left for an implementer (or AI coding agent) to resolve unilaterally. |
| **Blast radius** | Documentation clarification only; affects the relationships/relationship-graph table design in Wave 1. |
| **Migration impact** | None if fixed before Wave 1 schema work. |
| **Rollback** | Trivial. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### DOM-08 — Permission tiers (P0-P6 collaboration access) and Data Classification (Public/Internal/Confidential/Restricted) share overlapping vocabulary for two different axes

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:257-271 defines P0 Public through P6 Ownership/Governance as collaboration-access tiers granted to an external counterparty. 11_SECURITY_PRIVACY_GOVERNANCE.md:48-64 separately defines PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED as HCI's own internal data classification, with HCI person-analysis data defaulting to RESTRICTED. |
| **Problem** | Both schemes reuse the words 'Public' and 'Confidential' for conceptually different things -- one governs how much access/collaboration depth a Person (counterparty) is granted, the other governs how HCI classifies and protects its own tenant data. An implementer building RBAC/ABAC (doc 11's authorization section) risks conflating 'this record is Confidential-classified' with 'this counterparty has P2 Confidential collaboration access', which are unrelated facts that happen to share a label. |
| **Evidence** | 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:257-271; 11_SECURITY_PRIVACY_GOVERNANCE.md:48-64. |
| **Risk if unchanged** |  |
| **Alternative A** | Rename doc 19's P0-P6 scale to avoid 'Public'/'Confidential' overlap with doc 11's data classification. |
| **Alternative B** | Rename doc 11's data classification instead, keeping doc 19's counterparty-facing P0-P6 language (which is more customer-visible and harder to change post-launch). |
| **Alternative C** | Keep both as-is and rely on context to disambiguate -- not recommended. |
| **Recommended** | Rename one of the two schemes to remove the vocabulary collision -- e.g. keep doc 11's PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED as 'HCI Data Classification' and rename doc 19's P0-P6 to 'Collaboration Permission Tier' or similar, with distinct labels at each tier. |
| **Why** | Low-controversy, mechanical fix; worth doing before RBAC/ABAC implementation (Wave 2) rather than after naming collisions have propagated into code, policy YAML, and UI copy. |
| **Blast radius** | Naming only; affects governance policy YAML (doc 21 P0-05) and UI copy (doc 19), not the underlying access-control logic. |
| **Migration impact** | None if resolved before either scheme is implemented in policy YAML or RBAC code. |
| **Rollback** | Trivial. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### DOM-09 — No Control/Mitigation entity operationalizes the Cooperation Safety Principle as an auditable record

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 04_HCI30_PRODUCT_SPEC.md:146-163 ('Cooperation safety principle') lists concrete controls (escrow, milestone payments, dual approval, limited API permissions, contract clauses, audit rights, insurance, data segregation, credential rotation, exit procedure). 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:216 lists 'Recommended Controls' as a report section. |
| **Problem** | No entity in doc 07's core list or relational tables tracks whether a recommended control was actually adopted, by whom, when, and whether it remains in force. 'If all current assessments are wrong, what protects us?' (04:150) is currently answerable only as report prose, not as a queryable, auditable fact tied to a Decision -- which undercuts the safety principle it exists to operationalize. |
| **Evidence** | 04_HCI30_PRODUCT_SPEC.md:146-163; 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:216; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:9-34 and 144-179 (no controls/mitigations table). |
| **Risk if unchanged** |  |
| **Alternative A** | Add Control/Mitigation as a first-class entity linked 1:N from Decision. |
| **Alternative B** | Model it as a structured field on Decision rather than a separate table if control adoption is rarely revisited. |
| **Alternative C** | Leave as report-only prose -- not recommended, undermines auditability of the safety principle. |
| **Recommended** | Add a Control/Mitigation entity linked to Decision: control_type, status (recommended/adopted/verified/lapsed), owner, verification_date, evidence_of_adoption. Surface adoption status alongside the Decision in reporting (doc 19). |
| **Why** | Turns the marketed safety principle into a structural guarantee rather than a report-writing convention -- directly serves the brand promise in doc 15 ('we show... how to collaborate safely even when uncertain'). |
| **Blast radius** | New entity attached to Decision; low blast radius, purely additive. |
| **Migration impact** | None if added at Wave 4 (Evidence/Claim/Assessment core) alongside Decision. |
| **Rollback** | Trivial to add or defer. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### DOM-10 — The same generic 'candidate -> gate -> admitted' promotion pattern is independently reinvented with three different vocabularies

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | Public claim admission uses DISCOVERED/MATCHED/VERIFIED/ACCEPTED/ACTIVE/REJECTED (06_HCI30_PUBLIC_INTELLIGENCE.md:188-197). Identity resolution uses MATCH_CONFIRMED/MATCH_HIGH_CONFIDENCE/MATCH_POSSIBLE/MATCH_AMBIGUOUS/MATCH_REJECTED (06:68-76). AI LEGO integration results use AI LEGO Analysis -> HCI Domain Validation -> Assessment Candidate -> Human/Policy Review -> Formal HCI Assessment (10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:81-93). |
| **Problem** | All three are the same underlying pattern -- untrusted candidate data enters, passes through validation/human review, and either gets promoted to a trusted formal record or rejected -- but each is specified independently with its own state names and no shared formalization. This is not wrong, but it is a missed opportunity: a future fourth admission pipeline (e.g. for Case/Engagement intake, DOM-06) will likely reinvent it a fourth time absent a documented pattern. |
| **Evidence** | 06_HCI30_PUBLIC_INTELLIGENCE.md:68-76 and 188-197; 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:81-93. |
| **Risk if unchanged** |  |
| **Alternative A** | Document as a shared pattern in governance docs without forcing code-level reuse. |
| **Alternative B** | Build an actual generic Foundation LEGO 'admission gate' component the three pipelines configure rather than reimplement. |
| **Alternative C** | Leave as three independent pipelines -- acceptable if the pattern is documented at least once for future reference. |
| **Recommended** | Document one generic 'Candidate Promotion' state-machine pattern (not necessarily shared code, just a shared documented shape: candidate -> validation -> gate -> admitted\|rejected, with human-review checkpoint) in the governance layer, and have each of the three existing pipelines declare itself an instance of it. |
| **Why** | Lower priority than DOM-01 through DOM-06, but cheap to fix now and directly reduces the chance of a fourth, incompatible vocabulary appearing later. |
| **Blast radius** | Documentation-level pattern only; does not require changing any of the three existing state machines. |
| **Migration impact** | None; purely additive. |
| **Rollback** | Trivial; purely additive documentation. |
| **30-year consequence** | — |
| **Confidence** | Low |
| **Requires human decision** | NO |

### DOM-11 — Core peer-product domain boundary (Person/Relationship/Trust vs. Method/Workflow/Execution) is correctly designed and should not be disturbed

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 02_PRODUCT_BOUNDARIES.md:1-131 defines HCI-30's core domain objects (Person, Organization, Relationship, Evidence, Claim, TrustDomain, Decision...) as distinct from AI LEGO's (Problem, Method, Workflow, ExecutionRun...); 01_SYSTEM_CONSTITUTION.md Invariant 3 requires independent failure domains; 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:159-166 specifies graceful degradation when AI LEGO is unavailable. |
| **Problem** | None -- this is a KEEP finding, included to state explicitly (per the six required criteria: domain ownership, failure independence, commercial independence, data ownership, deployment independence, evolution independence) that the top-level peer-product split survives independent scrutiny and should not be collapsed into one shared domain, notwithstanding the Foundation-layer sharing recommendations in DOM-01/02/03/04. |
| **Evidence** | 02_PRODUCT_BOUNDARIES.md:1-131 (full document); 01_SYSTEM_CONSTITUTION.md:57-59 (Invariant 3); 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:159-166 (graceful degradation, well-specified); 09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:104-126 (explicit non-ownership statements both directions). |
| **Risk if unchanged** |  |
| **Alternative A** | N/A -- this is the recommended baseline. |
| **Alternative B** | N/A |
| **Alternative C** | N/A |
| **Recommended** | Keep the peer-product boundary exactly as designed. Do not merge HCI and AI LEGO into a shared domain model or shared database, even while consolidating the Foundation-layer primitives identified in DOM-01 through DOM-04. |
| **Why** | A Person/Relationship/TrustDomain aggregate and a Method/Workflow/ExecutionRun aggregate answer genuinely unrelated questions for genuinely different consumers, and the failure-independence design (doc 13) is already correctly specified, not merely asserted. |
| **Blast radius** | None -- this affirms existing design. |
| **Migration impact** | None. |
| **Rollback** | N/A. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

---

### DOM-12 — HCI's entire product framing and Evidence schema assume the assessed Subject is always an individual Person; Organization is declared as an entity but has no first-class Evidence/Assessment/TrustDomain support, and the Requester's own party-type is not modeled as a dimension that shapes the analysis

> **Provenance note**: this finding was not surfaced by the original 9-reviewer independent pass. It was raised by the operator after reviewing the package (2026-08-29), then verified against the source blueprint before being added here — same evidentiary bar as every other finding in this package, added out-of-band rather than silently backfilled to look like it was always there.

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 02_PRODUCT_BOUNDARIES.md:17 opens the product identity with "Who is **this person**?" (not "this person or organization"); 04_HCI30_PRODUCT_SPEC.md:5 mission statement: "understanding **people**, relationships, incentives, trust, risk, and safe collaboration"; every Trust Domain (04:56-66) and Core Analysis Dimension (04:68-85) is phrased around an individual's behavior. `Organization` **is** listed as a core domain object (02:33, 07:11) — but 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:78-100's Evidence provenance field list hard-codes `person_id` (verified: this is the only occurrence of `person_id` in the file, and there is no `organization_id` or generic `subject_id`/`subject_type` field anywhere in doc 07). `Organization` today functions only as an attribute/relationship node attached to a Person (employer, `OrganizationHierarchy`), not as an independently assessable subject with its own Evidence/Claim/Assessment/TrustDomain records. Separately, 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md's edition tiers (Personal/Professional/Team/Enterprise/Group/Private) describe the **Requester's account size**, not the Requester's **role in the relationship being evaluated** (e.g., an individual investor vs. a corporate M&A team vs. a solo hiring manager) — no field anywhere pairs "who is asking" with "what kind of relationship they're trying to establish" as a structuring input to which Trust Domains/Assessment Dimensions apply. |
| **Problem** | Two real-world use cases this architecture markets itself for — "should my company invest in / partner with / use as a vendor this **other company**" and "should we merge with this **group**" — cannot be represented in the current schema the same way "should I trust this **person**" can, because Evidence is keyed to `person_id` specifically. An implementer who needs company-vs-company due diligence today has no defined path: extend `Organization` ad hoc (risking the same "same concept two different shapes" failure DOM-02 already found between HCI and AI LEGO's `Evidence`), or force a company assessment through Person-shaped tables via a workaround, corrupting the semantics of `person_id`. Separately, without a Requester-role × Subject-type × relationship-goal dimension, two very different real analyses (a Personal-tier individual evaluating a potential co-founder vs. an Enterprise-tier procurement team evaluating a vendor organization) currently get the same undifferentiated Trust Domain menu, even though which dimensions matter (e.g. "Financial Trust" and "Governance/Power Trust" matter enormously more for an organization-as-subject than for an individual) differs by combination. |
| **Evidence** | 02_PRODUCT_BOUNDARIES.md:17, 33; 04_HCI30_PRODUCT_SPEC.md:5, 52-85; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:9-34 (Organization listed as core entity), 07:78-100 (Evidence table hard-coded to `person_id`, verified sole occurrence via full-file grep); 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:1-14 (edition tiers describe account size, not relationship role). Related but distinct from DOM-06 (Case/Engagement aggregate, which captures `relationship_context` as free-form purpose text but does not require a structured Subject-type or Requester-role field). |
| **Risk if unchanged** | Either (a) HCI-30 quietly stays a person-only product despite marketing/mission language and Organization's presence in the entity list implying broader scope — a scope-vs-schema mismatch discovered by a confused implementer or customer later — or (b) an implementer bolts organization-as-subject support onto the Person-shaped tables under time pressure, producing the exact "two shapes, one name" collision DOM-02 already flags as a structural failure mode, this time inside HCI's own schema rather than at the HCI/AI LEGO boundary. |
| **Alternative A** | Explicitly scope V1/V2 to individual-Person subjects only, and correct the entity list (remove `Organization` as an independently-assessable subject, keep it only as a Person-attribute/relationship node) so the schema and the product's actual capability match. Cheapest; forecloses company-vs-company due diligence as a use case until a deliberate future decision reopens it. |
| **Alternative B** | Generalize the Evidence/Claim/Assessment/TrustDomain schema to a polymorphic `subject_type: PERSON \| ORGANIZATION` + `subject_id` (replacing the hard-coded `person_id`), and add a `requester_context` (role type: individual / corporate-team / group-consortium) to the Case/Engagement aggregate from DOM-06/HD-10, so the pairing of (requester role, subject type, relationship goal) can drive which Trust Domains/Assessment Dimensions are surfaced as relevant. Matches what "Organization" already being a declared core entity implies was intended. |
| **Alternative C** | Keep `Person` as the only assessable subject for V1 (matches current schema with zero migration cost), but explicitly design the `subject_id`/`subject_type` polymorphism into the Wave-1 ERD now as a **forward-compatible column shape** (nullable `subject_type` defaulting to `PERSON`) without building Organization-assessment logic yet — the schema-stub pattern already used elsewhere in this package for multi-region readiness (`13_ARCHITECTURE_OPTIONS_MATRIX.md` §3c). Cheapest way to avoid the "expensive to retrofit after real data exists" trap this whole package's `17_TECH_DEBT_PREVENTION.md` is built around, without committing engineering effort to organization-assessment features before there's a validated need. |
| **Recommended** | Alternative C. This is a genuine product-scope decision (does HCI-30 ever assess organizations, not just people) that only the operator can make — but the *schema-shape* cost of staying forward-compatible is close to zero if decided now, and expensive if deferred until after Evidence/Claim/Assessment tables have real Person-keyed rows in them. Whichever scope is chosen, `Organization`'s status in the entity list (02:33, 07:11) should be corrected to match — either promoted to a real assessable subject or explicitly demoted to attribute-only, not left ambiguous. |
| **Why** | This is the same "cheap now, expensive after Wave 1 data exists" pattern documented throughout `17_TECH_DEBT_PREVENTION.md` §A, applied to a dimension none of the 9 original reviewers checked because V1's own framing (person-first language throughout) primed every independent reader toward the same blind spot — a good illustration of why an operator's own read, even after a 9-reviewer pass, still finds real gaps: the reviewers were independent of each other, but not independent of the source document's own framing. |
| **Blast radius** | If deferred past Wave 1 ERD freeze and Organization-as-subject is needed later: touches Evidence, Claim, Assessment, TrustDomain, and every downstream table that joins on `person_id` — a materially larger blast radius than most other Wave-1-timed fixes in this package, because it is a foreign-key shape change, not an additive column. |
| **Migration impact** | If decided now (Alternative C): zero — one nullable column added before any data exists. If decided after real Person-keyed evidence rows exist: a genuinely hard migration (every existing row needs a `subject_type='PERSON'` backfill, every join needs re-validation). |
| **Rollback** | Alternative C's forward-compatible column can simply go unused (default `PERSON` forever) if the operator later decides organization-assessment is out of scope permanently — no rollback needed, only a decision not to build the feature. |
| **30-year consequence** | A product that markets "collaboration intelligence" and lists `Organization` as a core entity, but structurally can only ever assess individuals, will face this exact question again the first time a real customer asks "can I vet a vendor company, not just a contact person" — cheaper to decide the shape once, deliberately, than to discover the answer was implicitly "no" only when a customer asks. |
| **Confidence** | High |
| **Requires human decision** | YES |

---

## Open Assumptions Flagged by This Reviewer

- I assumed AI LEGO's specs/*.yaml files, though technically outside the blueprint directory, are authoritative current-state evidence about AI LEGO's actual committed design (ADR-003, ADR-004 both marked ACCEPTED) rather than draft/exploratory material, since the task explicitly permits corroborating evidence from the wider repo and these files are the most concrete artifact available for the AI LEGO side of the peer-product boundary.
- I assumed 'Project' in doc 07's Relationship graph list and 'Project' in doc 08/12's tenancy hierarchy are being used loosely/ambiguously rather than deliberately as two named-identically-but-distinct concepts; the blueprint never states either way.
- I assumed the HCI 'Consent' entity and AI LEGO's sketched 'Data Subject' / 'Global Privacy Engine' concept (from AI LEGO's own Master Plan sections referenced inside personal-data-redacted-event.schema.yaml) are meant to describe the same real-world subject (a person about whom personal data is processed), even though neither document cross-references the other.
- I assumed HCI's core state model is intended to be at least partially event-sourced given Invariant 6 and the bitemporal requirement (P0-02), rather than pure CRUD-with-manual-versioning; the blueprint does not state this explicitly either way, and I flagged the ambiguity itself as the finding rather than asserting one answer.

---

## Open Risks Flagged by This Reviewer

- If DOM-01 (Tenant/Workspace conflict) is not resolved before Wave 1, both HCI and AI LEGO risk building incompatible tenant-scoping code that later requires a live-data migration to reconcile -- exactly the kind of destructive, hard-to-rollback migration doc 01's 'Definition of architecture failure' forbids.
- If DOM-04/DOM-05 (Consent, DataSubjectRequest) remain unresolved past P0-01 ERD freeze, HCI may ship a production system profiling non-consenting third parties with no structural way to honor a correction/dispute/access request -- a genuine legal exposure risk in multiple jurisdictions, not merely a design nicety.
- If DOM-02 (Evidence/Claim naming collision) is not resolved before the integration adapter (systems/hci30/integrations/cognitive-os/) is coded, an implementer (human or AI) may accidentally treat AI LEGO's execution-Evidence as admissible HCI domain evidence, silently violating the 'AI results cannot self-admit as HCI facts' invariant stated in doc 22's Wave 10 acceptance criteria.
- This review did not examine the AI_LEGO specs/execution/, specs/security/, or specs/jurisdiction/ directories in depth (only evidence/, decision/, domain/, governance/ were opened) -- there may be additional domain-overlap findings in those areas that a full cross-repo audit would surface but that fell outside this lens's time budget.
