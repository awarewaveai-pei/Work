# 22 Open Human Decisions

> 42 individual `requires_human_decision=true` findings across the 9 independent reviews plus one operator-raised post-package addition, consolidated into 24 distinct decisions (many reviewers independently flagged the same underlying question). These are not analysis gaps — more research will not resolve them. Each is a genuine value trade-off, legal-risk-tolerance call, or product-direction choice that only the operator can make. Full reasoning and evidence for each lives in the numbered review file cited; this page is the decision-ready index.
>
> **Not a to-do list in priority order by default** — Section A are the ones with the highest cost-of-delay (see `17_TECH_DEBT_PREVENTION.md` §A for why); Section B can wait for a natural trigger point without penalty.

---

## Section A — Decide before Wave 1 domain-model / schema freeze (cheap now, expensive after real data exists)

### HD-00 — Is HCI-30 ever meant to assess Organizations/Groups as the Subject, not just individual Persons — and does the Requester's own party-type (individual / corporate team / group) need to shape which Trust Domains apply?
**Question**: `Organization` is declared as a core domain entity (02:33, 07:11) but the Evidence schema is hard-coded to `person_id` (07:78-100, verified sole occurrence) with no `organization_id`/`subject_type`, and the product's own mission language ("Who is this person?", "understanding people...") is entirely person-framed. Separately, nothing pairs the Requester's own role in the relationship (an individual evaluating a co-founder vs. a corporate procurement team evaluating a vendor organization) with which analysis dimensions should apply — doc 08's edition tiers describe account size, not relationship role.
**Why human**: This is a real product-scope decision (does HCI-30 ever do company-vs-company or group-vs-group due diligence, not just person-vetting), not an engineering detail — engineering can build any of the three options below, but only the operator can decide which future the product is for.
**Options**: (A) scope permanently to individual-Person subjects only, correct the entity list to demote `Organization` to attribute-only. (B) generalize now — polymorphic `subject_type: PERSON | ORGANIZATION` + `subject_id`, plus a `requester_context` role field on the Case/Engagement aggregate (HD-10). (C) **recommended** — keep Person-only functionality for V1, but design the `subject_type`/`subject_id` column shape into the Wave-1 ERD now as a forward-compatible stub (nullable, defaults to `PERSON`), so the decision to actually build organization-assessment can be made later without a costly retrofit.
**Source**: Operator-raised 2026-08-29, verified and formalized as DOM-12 · `05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-12 · not part of the original 9-reviewer independent pass — added out-of-band with the same evidentiary bar, not backfilled to look pre-existing.

### HD-01 — Reconcile the three incompatible "Tenant" definitions
**Question**: Does AI LEGO's ACCEPTED ADR-003 Tenant (3-level, no Organization) become the one platform-wide Tenant, does the already-shipped `portal.aware-wave.com` `organizations` table become it, or do they stay deliberately separate?
**Why human**: This is a real product-boundary choice with a live-code consequence (`organization_product_subscriptions.external_tenant_id` already exists, nullable, unenforced, waiting for an answer), not something more analysis resolves.
**Options**: (A) promote ADR-003's Tenant, retrofit `organizations` as an adapter — cleanest long-term, one migration now while cheap. (B) declare `organizations` (portal layer) the platform Tenant, rename ADR-003's internal concept to avoid the collision — keeps already-tested shipped code as source of truth. (C) do nothing until a real integration forces the question — cheapest today, highest risk of the field calcifying by accident.
**Source**: A DOM-01, B CI-9/CI-12, D D-08, G G-01 · `05`, `06`, `08`, `11` · Risk register RISK (Medium-High) · Convergence CM-01

### HD-02 — Scope the "Consent" entity (three different meanings currently collapsed into one word)
**Question**: Does "Consent" mean tenant-internal authorization-to-investigate, actual third-party data-subject consent, or a data source's terms of use — or all three as distinct fields?
**Why human**: A legal-risk-tolerance call about what the product will and won't claim to have obtained, not an engineering question.
**Options**: (A) narrow scope to tenant-internal authorization only, declare subject consent out of scope with a documented lawful-basis policy instead. (B) build the full shared Data-Subject-rights registry AI LEGO's own Master Plan already sketches. (C) model three distinct fields rather than one bare entity.
**Source**: A DOM-04 · `05`

### HD-03 — Researched-Person rights channel (single most consequential gap in the whole blueprint)
**Question**: What mechanism, if any, lets the profiled third party (never a tenant, never logs in, never consents) learn a dossier exists, see it, dispute a claim, or request correction/erasure?
**Why human**: This is CONSENSUS across four independent reviewers via four non-overlapping methods (domain-entity gap, security-sequencing conflict, red-team attack, live GDPR research) — see Convergence CM-04 — and it is a scope/liability-tolerance decision, not a technical one.
**Options**: (A) full `DataSubjectRequest` entity with lifecycle + lineage into evidence versioning, elevated to P0. (B) explicitly declare out-of-scope for V1 and document why (a legitimate choice, but must be a stated decision, not silence). (C) route entirely through tenant-side manual process outside HCI's system of record — weakest, breaks the audit/lineage guarantee doc 01 requires elsewhere.
**Source**: A DOM-05, C SEC-02, H RT-01, I REG-02/REG-03 · `05`, `07`, `12`, `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY` · Risk register RISK (Critical) · Convergence CM-04

### HD-04 — Identity-resolution match confirmation: threshold and ownership
**Question**: What specifically confirms `MATCH_CONFIRMED` for a RESTRICTED-classified subject, and who/what owns that threshold?
**Why human**: E's independent verdict calls this "the highest-severity unresolved risk in the entire HCI-30 product concept" — a wrong match directly defames an innocent, non-consenting third party with no visibility into the system. The recommended answer (deterministic ID match or explicit human confirmation, never an LLM confidence score alone) is a policy commitment the operator must own, not a tunable parameter to leave to whoever writes the code.
**Options**: Effectively binary — (A) mandate deterministic/human-confirmed match only for RESTRICTED subjects (recommended by both reviewers who touched this). (B) allow high-confidence LLM match alone — explicitly rejected by both E and H as the direct cause of the product's largest defamation exposure.
**Source**: B CI-8, E C6, H RT-05 · `05`, `06`, `09`, `12` · Risk register RISK (Critical) · Convergence CM-05

### HD-05 — Make RLS mandatory (not "where appropriate") and add the missing CI-blocking cross-tenant test
**Question**: Commit to RLS as a hard requirement for every tenant-owned table, with an automated test that actually attempts a cross-tenant read (not just checks a `tenant_id` column exists)?
**Why human**: This is a security-posture commitment with real engineering cost attached (writing and maintaining the test suite) that the operator should explicitly own given the blast radius (a single leaked `service_role` key or missed policy exposes every tenant's RESTRICTED data at once).
**Options**: Effectively binary — (A) mandatory RLS + CI-blocking test (recommended, CONSENSUS across B/C/H). (B) keep "where appropriate" — no reviewer defends this option once the single-shared-Postgres-instance reality is accounted for.
**Source**: B CI-4, C SEC-06, H RT-03 · `06`, `07`, `12`, `13` · Risk register RISK (Critical) · Convergence CM-02

### HD-06 — Bitemporal schema scope (which tables get the full valid-time/system-time split)
**Question**: Full bitemporal treatment everywhere is over-engineering for a solo-operator team; zero bitemporal treatment breaks the product's core "what did we know when" promise. Where exactly is the line?
**Why human**: A cost/completeness trade-off the mission brief itself frames as requiring judgment ("the line has to be drawn by whoever owns the Wave 1 domain ERD").
**Recommendation (from Reviewer B, not yet operator-ratified)**: Full treatment for Evidence/Claim/Assessment/Decision (the four tables backing every "why did we conclude this" explanation); simple insert-only elsewhere (search jobs, source snapshots, identity candidates).
**Source**: B CI-1, H RT-14 · `06`, `12` · Risk register RISK · Convergence CM-03

### HD-07 — Immutable evidence vs. right-to-erasure: adopt crypto-shredding now
**Question**: Ratify crypto-shredding (destroy the encryption key, keep tombstoned metadata) as the schema-level answer to the WORM-vs-erasure tension, before Wave 1 schema freezes?
**Why human**: A legal-mechanism choice (does deleting a key satisfy "erasure" in the applicable jurisdictions?) that the operator, not the architecture, must be comfortable defending.
**Options**: (A) crypto-shredding (recommended, CONSENSUS B+D, and the only option compatible with both Invariant 6 and erasure obligations simultaneously). (B) literal storage-level WORM (infeasible today — no S3-Object-Lock-class storage exists in the verified infra). (C) narrow WORM scope to non-personal audit metadata only, keep personal evidence conventionally deletable — weakens the tamper-evidence guarantee for the data that matters most.
**Source**: B CI-7, D D-07 · `06`, `08` · Risk register RISK · Convergence CM-06

### HD-08 — Publish the deterministic / probabilistic / LLM-assisted / human-only field policy
**Question**: Ratify an explicit, field-by-field enumeration of which decisions must never be made by an LLM alone (identity match, evidence admission-state transitions, retention/deletion enforcement, the final PROCEED/PAUSE/EXIT decision)?
**Why human**: Without an explicit ratified policy, individual implementers will each make ad hoc calls — exactly what doc 16 itself warns against ("create an ADR rather than silently inventing behavior").
**Recommendation**: Adopt Reviewer E's proposed enumeration (see `09_AI_INTELLIGENCE_REVIEW.md` C5) and reuse AI LEGO's existing A0-A4/R0-R4 gating machinery rather than inventing a parallel one.
**Source**: E C5 · `09`

### HD-09 — Extract the shared Epistemic/Provenance/Decision-Authority kernel, or accept duplicate governance
**Question**: Pull HCI's Fact/Observation/Interpretation/Hypothesis model and AI LEGO's already-ACCEPTED epistemic_type/Decision schemas into one shared, versioned kernel — or let both tracks continue independently?
**Why human**: This is the central "should HCI-30 and AI LEGO share anything" question, and the independence-verdict synthesis (see below) concluded the top-level domain split should stay independent while this specific Foundation-layer primitive should not — a scoped judgment call the operator should ratify explicitly given how many downstream chapters assume one answer or the other.
**Recommendation**: Extract a small, versioned kernel into `shared/platform` or `shared/contracts`; each product vendors/pins a specific version (preserves "HCI works without AI LEGO"); add a CI contract test if full extraction is deferred.
**Source**: A DOM-02/03, E C1/C2/C3 · `05`, `09`, Independence Verdict (see `00_EXECUTIVE_REVIEW.md` §Independence) · Convergence CM-10, CM-17

### HD-10 — Add a Case/Engagement aggregate, or accept unbounded replay scope
**Question**: Does a due-diligence effort get its own bounded aggregate (purpose, risk_level, evidence refs, decisions, lifecycle), distinct from the billing-scoping "Project" concept — or does replay (doc 13) have to reconstruct against a Person's entire eternal history?
**Why human**: A genuine domain-modeling trade-off with a stated fallback cost (doc 13's replay requirement becomes unsatisfiable without it) that the ERD owner should decide deliberately, not by omission.
**Options**: (A) distinct Case/Engagement aggregate, referencing but separate from tenancy Project (recommended). (B) merge into Project itself — simpler, but re-couples domain data to the tenancy control plane doc 07 says HCI must not own. (C) defer, leave `case_id` an opaque string until Wave 4 — cheapest short-term, leaves replay unsatisfiable in the interim.
**Source**: A DOM-06 · `05`

---

## Section B — Genuine trade-offs, no forcing function yet (decide when convenient, not urgent)

### HD-11 — Physical isolation of HCI's Postgres data from the shared automation-tooling cluster
**Question**: Does HCI-30's RESTRICTED-classified data live in the same physical Postgres cluster as unrelated, lower-sensitivity automation data (n8n) already running on the shared self-hosted Supabase instance, or is it physically isolated as a compensating control?
**Source**: B CI-9 · `06`

### HD-12 — Key rotation / compromise-response runbook: pull into P0 or accept the current P1 sequencing
**Question**: Field-level encryption of RESTRICTED evidence is a Day-1 requirement; the plan for what happens if a key/KMS credential is compromised is currently P1-Enterprise. Pull a *minimal* rotation/compromise runbook forward, even while the full BYOK/enterprise key hierarchy stays P1?
**Recommendation**: Yes — this is flagged as cheap to do narrowly (a runbook, not new infrastructure) and closes the specific gap where encryption exists with no compromise-response plan during the lowest-operational-maturity build phase.
**Source**: H RT-07, C SEC-08 · `07`, `12` · Risk register RISK

### HD-13 — Enterprise BYOK/dedicated-DB sales claims vs. actual infra readiness
**Question**: Should Enterprise sales materials referencing BYOK or dedicated-DB be explicitly blocked until P1-04 (key architecture) is actually built and tested?
**Source**: C SEC-08 · `07`

### HD-14 — Multi-region trigger condition
**Question**: Ratify "a signed enterprise/Group contract with a data-residency clause" as the explicit, named trigger for building real multi-region infrastructure (vs. the current implicit phase-ordering)?
**Recommendation**: Yes, per `13_ARCHITECTURE_OPTIONS_MATRIX.md` §3c — keep the cheap schema stubs now, state honestly to customers that enforcement isn't built yet.
**Source**: D D-13 · `08`, `13`

### HD-15 — AI coding agents' standing infrastructure credentials, applied to future RESTRICTED HCI data
**Question**: The current operating pattern (Claude/Codex retain routine SSH/root/DB access to the production stack, under documented governance rules) is real today. Does this pattern apply unmodified once RESTRICTED HCI person data lives on the same infrastructure, or does that data warrant a narrower access model?
**Why human**: Explicitly flagged as unverified extrapolation, not a settled fact — the present-day pattern is real, but whether it should extend to this specific, higher-sensitivity data class has not been decided anywhere.
**Source**: C SEC-12 · `07` · Assumption register ASM (UNVERIFIED)

### HD-16 — Public-intelligence Claim/Source ownership: tenant-scoped copies or globally shared records?
**Question**: If two tenants research the same public figure, are Claims/Sources deduplicated/shared (efficient, but complicates per-tenant deletion) or tenant-scoped copies (clean deletion, wasteful re-scraping)?
**Why human**: 07's evidence table has `tenant_id`; 06's claim/source objects don't — an already-existing silent inconsistency sitting directly under a customer-facing deletion promise. Doc 16's Open Decisions list omits this question entirely.
**Options**: (A) tenant-scoped copies with tenant-local corroboration graphs. (B) shared global records with reference-counted, tenant-scoped visibility (deletion only removes the tenant's link, not the underlying record).
**Source**: C SEC-14, H RT-10 · `07`, `12`

### HD-17 — Sanctions/export-control screening ownership
**Question**: 09 delegates cross-border/sanctions screening to AI LEGO's jurisdiction module; 02 simultaneously forbids AI LEGO from owning HCI's Person data. Who screens a research subject who turns out to be sanctioned?
**Source**: H RT-15 · `12`

### HD-18 — Bulk-export prevention control (not just detection)
**Question**: Add a preventive control (step-up auth, size threshold, delayed-release window) for RESTRICTED-data exports above a threshold, rather than relying on a post-hoc audit alert alone?
**Recommendation**: Yes, for Enterprise-tier exports specifically, to avoid adding friction to the low-risk majority of usage.
**Source**: H RT-08 · `12` · Risk register RISK

### HD-19 — Wave 6 fetch/scan worker: reuse Trigger.dev, or build a network-isolated sandboxed runner
**Question**: This is a genuine, unresolved **DISAGREEMENT** between two independent reviewers, not a converged recommendation. D recommends reusing the existing self-hosted Trigger.dev instance to avoid duplicating queue/retry/dashboard machinery, with a caveat that a specific isolation limitation might force a dedicated runner. C independently specifies the fetch step needs network isolation (no route to the docker-internal bridge network, DNS-rebind protection) because an SSRF-capable job on the verified single-box baseline can reach internal container endpoints, not just the public internet. **Neither reviewer verified whether Trigger.dev's actual sandboxing model satisfies C's isolation requirement.**
**Why human**: This cannot be resolved by more independent review — it requires someone to actually test Trigger.dev's isolation properties against C's stated requirements (`NEEDS_PROTOTYPE` / `NEEDS_BENCHMARK`, not `NEEDS_HUMAN_DECISION` in the strict sense, but the operator must commission the test).
**Source**: D D-05, C SEC-05 · `07`, `08` · Convergence CM-18 (DISAGREEMENT)

### HD-20 — EU AI Act / FCRA jurisdiction and use-case scoping ADR
**Question**: Will HCI-30 be marketed/sold for EU-linked or US-employment-adjacent use cases? If so, a conformity/compliance program is triggered; if not, the product should say so explicitly and restrict accordingly.
**Why human**: A market-strategy decision no reviewer can make — the legal exposure is real and confirmed by live regulatory research, but which markets to pursue is a business call.
**Source**: I REG-01, C SEC-01, F F8 · `07`, `10`, `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY` · Risk register RISK

### HD-21 — Controller/processor determination for the profiled Person
**Question**: Per processing activity, is Aware Wave a data processor, controller, or joint controller with respect to the third-party subject (not the paying tenant)? Needed for the customer DPA template.
**Source**: I REG-02 · `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY`

### HD-22 — AI LEGO usage metering/billing attribution clause
**Question**: Add an explicit clause to the Integration Contract requiring each Cognitive-OS execution invoked on behalf of an HCI tenant to be metered against that tenant's own verified Cognitive-OS subscription (not a trusted-by-convention string), before the `organizations` billing substrate becomes a de facto shared coupling point by default?
**Recommendation**: Yes — cheap now (one paragraph), forecloses a foreseeable commercial-independence leak later.
**Source**: G G-04 · `11` · Risk register RISK

### HD-23 — Personality/behavioral-method disposition (Big Five instrument, MBTI, Enneagram, Ziwei Dou Shu / Bazi, confidence percentages)
**Question**: A cluster of related method-science decisions: (a) which specific Big Five instrument to use and whether AI-inferred third-party trait estimation should carry a lower evidence grade than self-report; (b) whether to keep MBTI-style typing given trademark exposure and weak validity, or drop it in favor of Big Five; (c) whether Enneagram should carry a formal evidence grade at all; (d) whether Ziwei Dou Shu / Bazi should be removable from any module that can target a named third party (recommended: yes, restrict to clearly-labeled self-only entertainment, never feeding an Assessment/Decision); (e) whether to replace bare numeric confidence percentages with qualitative bands (ICD 203 Words-of-Estimative-Probability convention) until a calibrated model exists.
**Why human**: Each sub-decision is a defensible product-positioning call (what "scientific" means for this brand) that the operator, not a reviewer, should make explicitly rather than by silent inclusion.
**Source**: F F1, F2, F3, F4, F7 · `10_METHOD_SCIENCE_REVIEW.md` for full evidence-grade reasoning per instrument

---

## How to use this file

Each HD-item's "Source" line points to the reviewer(s) and the full-detail file(s) where the complete change-item block (Evidence / Alternatives / Blast radius / Migration impact / Rollback / 30-year consequence / Confidence) lives. This file intentionally does not re-litigate that reasoning — it exists so the operator can work through 23 decisions in one sitting instead of hunting across 12 files for every `requires_human_decision=true` flag.
