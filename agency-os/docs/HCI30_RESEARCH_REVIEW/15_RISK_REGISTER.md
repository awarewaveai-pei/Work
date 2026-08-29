# 15 Risk Register

> Consolidated from all 9 independent reviewers' `open_risks` plus the Convergence synthesis pass. Ordered roughly by severity (Critical -> High -> Medium), not by discovery order. Every row names its source reviewer(s) so the human architect can trace back to the full reasoning in the individual review files (05-11) and the Red Team file (12).

---

## RISK-01

**Severity**: Critical — direct defamation/reputational-harm exposure to an innocent, non-consenting third party who has no visibility into the system.  
**Likelihood**: High if Wave 4-6 ship as currently specified — 06 defines match-confidence states but never names who/what confirms MATCH_CONFIRMED or at what threshold (16:111 open).  
**Source reviewers**: B (CI-8), E (C6), H (RT-05)

**Risk**: Identity-resolution false-positive match attributes one real person's disputes/allegations/legal history to a different real person sharing a name/employer/location, with no reversibility or audit trail once discovered.

**Mitigation**: Mandate MATCH_CONFIRMED for RESTRICTED subjects requires a deterministic unique-identifier match or explicit human confirmation with shown corroborating fields — never an LLM confidence score alone. Add a PersonMergeLog/PersonSplitLog entity with full lineage and a retroactive re-flag workflow for Assessments/Decisions built on a later-corrected match.

## RISK-02

**Severity**: Critical — statutory exposure under GDPR-class regimes (Art. 15/16/17) plus general defamation/due-process risk; affects a stakeholder who cannot self-advocate.  
**Likelihood**: High — this is a scheduling certainty given the current roadmap ordering, not a speculative edge case.  
**Source reviewers**: A (DOM-05), C (SEC-02), H (RT-01), I (REG-02, REG-03)

**Risk**: The researched Person (data subject) has no access/correction/erasure channel, and this structurally conflicts with Invariant 6's immutable-history promise; real third-party data begins flowing (Phase 4-5 dogfooding) well before privacy-ops artifacts land (P1-Enterprise wave).

**Mitigation**: Elevate a minimal Researched-Person Rights process to P0 before Wave 4/6: documented Invariant-6 exception (corrections/erasure create a new version AND suppress the prior version from reads/exports), a lightweight intake channel, and a Data Protection Roles memo determining Aware Wave's controller/processor status for AI-driven synthesis about third parties.

## RISK-03

**Severity**: Critical — a single missed policy or a leaked service_role key exposes every paying tenant's RESTRICTED reputational data simultaneously.  
**Likelihood**: Medium-High — this class of Supabase incident (service_role key leak, one missed RLS policy) is a well-documented real-world failure mode, and nothing currently blocks it from passing all stated architecture tests.  
**Source reviewers**: B (CI-4), C (SEC-06), H (RT-03)

**Risk**: RLS is hedged as 'where appropriate' rather than mandatory, and the only automated architecture test checks for a tenant_id column, not that RLS actually blocks a crafted cross-tenant read — on a single shared self-hosted Postgres instance holding RESTRICTED-classified data for every tenant.

**Mitigation**: Make RLS mandatory-by-default for every tenant-owned table with any exception requiring a reviewed waiver; add a CI-blocking test that connects as a tenant-scoped non-superuser role and asserts zero cross-tenant rows for every RESTRICTED table on every migration.

## RISK-04

**Severity**: High — total loss of all RESTRICTED customer data with no proven recovery path onto a freshly provisioned box.  
**Likelihood**: Low-probability per year but non-negligible over a 30-year horizon (OVH's own 2021 datacenter fire is cited precedent); currently unrehearsed, so actual recovery time is unknown.  
**Source reviewers**: D (D-02), H (RT-02)

**Risk**: Single dedicated-server (ks-aw-01) hardware failure is the actual dominant DR risk for all AwareWave services including future HCI-30, but the documented DR scenario list only names cloud/region outage, and no cross-box restore drill is evidenced.

**Mitigation**: Add 'single dedicated-server hardware/host failure' as a named DR scenario; require a rehearsed cross-box restore drill (not same-box verify) as a P0/Wave-1 gate rather than a Gate-C (paid-tier) acceptance criterion.

## RISK-05

**Severity**: Medium-High — cheap to fix today (zero real external customers, portal signup deliberately closed), but becomes a live-data migration problem the moment any of the three gets real usage.  
**Likelihood**: Medium — will become load-bearing production behavior automatically the first time a provisioning API is built against organization_product_subscriptions.external_tenant_id, absent deliberate intervention.  
**Source reviewers**: A (DOM-01), B (CI-9, CI-12), D (D-08), G (G-01)

**Risk**: Three incompatible 'Tenant' definitions coexist across the blueprint (4-level Tenant/Org/Workspace/Project), AI LEGO's ACCEPTED ADR-003 (3-level, no Organization layer), and the already-shipped portal.aware-wave.com 'organizations' table — with no reconciling ADR.

**Mitigation**: Write a single reconciling ADR now, while the tables have zero real external customers: either extend AI LEGO's Tenant with an optional Organization layer, or explicitly scope 'organizations' down to legacy WP-agency semantics and define a new platform-wide Tenant separately.

## RISK-06

**Severity**: Medium-High — if coded as literally specified before a policy decision, requires a costly re-architecture of the evidence-integrity layer once real customer data exists in it.  
**Likelihood**: Medium — depends on whether P0-03 (tamper-evidence) is implemented before this tension is resolved.  
**Source reviewers**: B (CI-7), D (D-07)

**Risk**: WORM/tamper-evidence requirement for Evidence records and statutory erasure/correction rights are architecturally unreconciled, and the storage layer needed for literal WORM (S3 Object Lock class) doesn't exist in current infra.

**Mitigation**: Design crypto-shredding into the schema from Wave 1: per-record/per-Person encryption key reference plus tombstoned_at; erasure destroys only the key, hash-chain metadata survives for audit. Pull CRYPTO_ERASURE.md forward from P1/Wave 9.

## RISK-07

**Severity**: High — potential to discover regulatory status only after an enterprise deal or EU customer relationship is already committed.  
**Likelihood**: Medium — contingent on whether Aware Wave actually sells into EU markets or supports US employment-decision use cases, which is not itself decided in the blueprint (flagged as an open assumption by both reviewers).  
**Source reviewers**: C (SEC-01), I (REG-01, REG-04)

**Risk**: HCI's stated core function (assessing reliability/trust/behavior of a named natural person to inform a consequential decision) matches the EU AI Act's statutory definition of high-risk 'profiling' (Art. 6(3), Annex III) and plausibly the US FCRA definition of consumer-reporting-agency-adjacent activity for employment use — neither is named anywhere in the 24-document corpus.

**Mitigation**: Write a one-page ADR now scoping which jurisdictions/use-cases (EU-linked subjects, US employment decisions) are in vs. out of scope until a conformity program exists; give DPIA_TEMPLATE.md real trigger-rule content now rather than leaving it an empty P1 placeholder.

## RISK-08

**Severity**: Medium-High — live, present-tense insider-access gap given the current solo-operator-plus-AI-agents operating reality, not a future-hire hypothetical.  
**Likelihood**: Medium — depends on operational discipline alone until a technical control exists.  
**Source reviewers**: C (SEC-07), H (RT-04)

**Risk**: Admin/support break-glass access to RESTRICTED data has a stated principle ('administrative authority does not imply content access') but zero enforcement mechanism, deferred to P1-Enterprise; on the verified single-box baseline, direct Postgres/superuser access bypasses RLS and the application layer entirely today.

**Mitigation**: Pull a minimal break-glass mechanism (time-bound elevation + mandatory justification + audit event) into Wave 2, reusing the audit schema already planned there rather than waiting for Wave 9. Add DB-session-level audit logging (e.g. pgaudit) for any non-application-role connection.

## RISK-09

**Severity**: Medium-High — direct manipulation of the evidence base at the point of ingestion.  
**Likelihood**: Medium — requires a moderately sophisticated adversary but the attack surface (any page HCI's retrieval step fetches) is broad and public.  
**Source reviewers**: C (SEC-04), E (C7)

**Risk**: An adversary who anticipates being researched can plant instruction-like text on a page they control; the claim-extraction pipeline has no stated defense distinguishing untrusted fetched content from instructions.

**Mitigation**: Require content-isolation as a Wave 6 acceptance criterion: fetched text always wrapped as untrusted data, output-schema validation, secondary pass flagging instruction-like phrases for human review. Build on AI LEGO's already-drafted TB-1/T2/E4 threat-model entries rather than re-deriving from zero.

## RISK-10

**Severity**: Medium — brand-credibility, legal (trademark, potential stalking-adjacent misuse), and ethical exposure.  
**Likelihood**: Medium — enabled by default on the lowest-friction (Personal) tier with no attestation or anomaly monitoring.  
**Source reviewers**: F (F2, F4, F5), C (SEC-09)

**Risk**: No purpose/consent gate exists at Person-record creation; combined with non-scientific self-reflection instruments (紫微/八字 zero empirical validity, MBTI trademark exposure) and the HCI Personal edition's single-user private vault + Continuous Monitoring mode, the architecture is capable of enabling covert surveillance of a non-consenting private individual regardless of intended use.

**Mitigation**: Add a required purpose-attestation field at Person-record creation; restrict Continuous Monitoring/Deep Due Diligence to Team/Enterprise with ToS acknowledgment; add volume/anomaly detection feeding a trust-and-safety queue. Separately, remove or firewall 紫微/八字/MBTI from any module that can target a named third party.

## RISK-11

**Severity**: Medium — commercial-integrity risk (sold-vs-actual posture) plus operational-continuity risk during early build.  
**Likelihood**: Low-Medium — contingent on Enterprise sales timing and on an actual key-compromise event.  
**Source reviewers**: C (SEC-08), H (RT-07)

**Risk**: Key rotation, KMS, BYOK, and compromise-response are P1-Enterprise deliverables while field-level encryption of RESTRICTED evidence is a Day-1 requirement — no plan exists for what happens if a key/KMS credential is compromised during the lowest-operational-maturity build phase, and Enterprise BYOK/dedicated-DB sales claims currently outrun actual infra.

**Mitigation**: Write a minimal key-rotation/compromise-response runbook as part of P0 even while full BYOK/enterprise key-hierarchy work stays P1; explicitly block Enterprise sales referencing BYOK/dedicated-DB until P1-04 is built and tested.

## RISK-12

**Severity**: Medium — technical-debt/coordination risk, not a safety incident by itself, but compounds into DOM-02's naming-collision risk (bare 'Evidence' meaning two different things across the integration adapter).  
**Likelihood**: High that divergence continues absent an explicit decision, since nothing currently forces either team to check the other's specs.  
**Source reviewers**: A (DOM-01, DOM-02, DOM-03), E (C1, C2, C3)

**Risk**: HCI's Foundation-layer primitives (epistemic status ladder, Evidence/Claim shape, cross-model risk-gate taxonomy, model/prompt registry) are being independently re-derived in the blueprint while AI LEGO already has ACCEPTED, ADR-governed equivalents (or, for model registry, an equally-unresolved parallel gap) — reconciliation cost grows every week both tracks continue independently.

**Mitigation**: Extract a small, versioned Epistemic/Provenance/Decision-Authority kernel into shared/platform now, before Wave 1 domain-model freeze on the HCI side and before further specs/ work accumulates on the AI LEGO side; build one model/prompt registry, not two.

## RISK-13

**Severity**: Medium — credibility/trust risk with sophisticated buyers; directly contradicts 06's own forbidden-output rule ('Fraud Risk = HIGH' banned) applied inconsistently elsewhere in the same document set.  
**Likelihood**: High if 19's UI spec ships as currently written, since no calibration work is scheduled before it.  
**Source reviewers**: F (F6, F7)

**Risk**: Numeric confidence percentages (43%, 68%, 95%) and ordinal bias self-ratings (Confirmation bias: MEDIUM) are rendered in the UI spec without any documented calibration model — 16 itself lists 'Confidence algorithm v1' as still unresolved — creating false-precision stacking that undermines the system's own stated evidentiary discipline.

**Mitigation**: Replace bare percentages with qualitative bands (ICD 203 Words-of-Estimative-Probability convention) until Confidence Algorithm v1 ships with documented backtesting; replace ordinal bias self-ratings with binary process-discipline checks the document already does correctly elsewhere (e.g. 'Counter-search performed: YES/NO').

## RISK-14

**Severity**: Medium — operational risk of pushing the shared box into WARN/CRIT capacity zone faster than anticipated, degrading co-tenant production services (WordPress, Supabase, n8n, etc.).  
**Likelihood**: Medium — depends on Public Intelligence pipeline volume once live, currently unbudgeted.  
**Source reviewers**: D (D-09 capacity note, D-05, D-06)

**Risk**: Adding HCI-30's Public Intelligence async fetch/scan pipeline to the already resource-monitored single box (60%/60% memory/disk thresholds specifically because it is a single shared box) has no defined capacity budget.

**Mitigation**: Define an explicit capacity budget for HCI-30's Wave 6 worker before it ships; reuse existing Trigger.dev + observability stack rather than adding new standing infrastructure.

## RISK-15

**Severity**: Medium — commercial-architecture risk; would undermine the otherwise-strong domain-independence finding (A-DOM-11) at the billing layer.  
**Likelihood**: Medium — contingent on which team builds the provisioning/metering API first and whether G-01's ADR lands before that happens.  
**Source reviewers**: G (G-04), corroborated by G-01's precedent finding

**Risk**: No commercial-independence answer for AI LEGO usage metering/billing attribution — the likely default outcome, given the confirmed precedent of underspecified areas being filled by reusing the nearest existing mechanism (G-01), is that the organizations/organization_product_subscriptions table becomes a de facto shared billing substrate, coupling the two products commercially even though their domain/DB separation is clean.

**Mitigation**: Add an explicit clause to the Integration Contract (10): each Cognitive OS execution invoked on behalf of an HCI tenant must be metered/billed against that tenant's own verified Cognitive OS subscription, not a trusted-by-convention tenant_context string.
