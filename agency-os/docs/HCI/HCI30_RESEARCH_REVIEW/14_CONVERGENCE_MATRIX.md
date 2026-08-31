# 14 Convergence Matrix

> Built AFTER all 9 independent reviewers (A-I) completed their work with zero cross-visibility. A dedicated synthesis agent was given all 9 raw outputs simultaneously and instructed to independently re-derive each classification rather than accept reviewer agreement at face value — per the mission rule `AGREE != FACT` / `MAJORITY != CORRECT`. Where a classification note explicitly re-derives the reasoning (not just tallies votes), that is intentional and load-bearing, not decoration.

---

## Legend

| Classification | Meaning |
|---|---|
| **CONSENSUS** | 2+ reviewers independently reached the same finding via non-overlapping evidence paths, AND the synthesis agent independently re-derived the reasoning and confirms it holds. |
| **MAJORITY** | Reviewers converge on the same root problem but frame the consequence or fix differently — not a single identical claim. |
| **DISAGREEMENT** | Reviewers point toward genuinely different implementations/answers; unresolved without further verification. |
| **UNRESOLVED / NEEDS_EVIDENCE / NEEDS_PROTOTYPE / NEEDS_BENCHMARK / NEEDS_HUMAN_DECISION** | Self-explanatory — see individual rows. |

---

## Convergence Rows (19)

### CM-01 — Tenant/Organization model: 3+ incompatible definitions coexist, one already shipped in production

**Classification**: `CONSENSUS`  
**Reviewers involved**: A (DOM-01), B (CI-9, CI-12), D (D-08), G (G-01)

Independently re-derived: A found the abstract conflict (blueprint's 4-level Tenant→Org→Workspace→Project vs AI LEGO's ACCEPTED ADR-003 3-level Tenant→Workspace, no Organization layer) purely from doc-vs-spec reading. G independently found the same class of conflict via a completely different evidence path — direct SQL migration read (0001_core.sql) proving portal.aware-wave.com already ships a third, older 'organizations' model (type in agency/client) with a nullable, unenforced external_tenant_id bridging column, deployed commit 83277d80, 2026-08-29. Two reviewers arriving at the same underlying defect via non-overlapping evidence (doc-analysis vs. shipped-code-forensics) is the strongest possible corroboration available without the human architect adjudicating. B and D independently flag the same unresolved-tier-default symptom from the DB/infra angle. This is not groupthink — it is convergent triangulation.

### CM-02 — RLS mandated only 'where appropriate'; architecture test checks column presence, not enforcement

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-4), C (SEC-06), H (RT-03)

All three cite the identical source lines (11:73-83 hedge language, 13:22-31 column-only test) and reach the identical fix (make RLS mandatory by default + add a CI-blocking cross-tenant-read test). Independently re-derived: given the verified baseline is one shared self-hosted Postgres instance and RLS is the only isolation layer for the Tier A majority of tenants, 'where appropriate' is a discretionary phrase sitting on the single most consequential control in the whole system for RESTRICTED-classified reputational data. This is a textbook single-point-of-failure security anti-pattern, not merely three opinions that happened to agree.

### CM-03 — Bitemporal history schema absent despite Invariant 6's immutability promise

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-1), H (RT-14)

Both cite 01:85-87 and the self-acknowledged gap at 21 P0-02 (67-82), and both note 07's actual fields (assessment_version/valid_until) are system-time only, no valid-time/system-time split. Re-derivable independently: 19's explainability promises and 13's replay requirement both need to answer 'what did we know on date X', which is structurally impossible without a valid-time axis — this is a logical consequence, not an opinion.

### CM-04 — Researched Person (data subject) has no rights/recourse channel — structurally conflicts with Invariant 6

**Classification**: `CONSENSUS`  
**Reviewers involved**: A (DOM-05), C (SEC-02), H (RT-01), I (REG-02/REG-03)

This is the single most independently re-derivable finding across all nine reviews: HCI's core function profiles a named third party who is never a tenant, never logs in, and never consents (04:5), yet DSAR/deletion runbooks are filed under P1-Enterprise-readiness (21:216-230) while real people's data starts flowing as early as Phase 4-5 dogfooding (14:56-73) — several phases earlier. Each reviewer reached this via a different lens (A: missing domain entity; C: sequencing conflict with roadmap; H: no rights channel named anywhere; I: live GDPR Art.15/16/17 research establishing the statutory basis) with zero cross-contamination possible. Re-deriving it myself: the logic holds without needing to trust any single reviewer's judgment call.

### CM-05 — Identity-resolution false-match: no threshold owner, no reversibility, no merge/split audit lineage

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-8), E (C6), H (RT-05)

06 defines match-confidence states but never says who/what confirms MATCH_CONFIRMED or what threshold applies (16:111 lists this as still-open). All three reviewers independently identify that a false positive here (wrong 'John Smith') is a direct defamation vector with no correction path once discovered. E calls this 'the highest-severity unresolved risk in the entire HCI-30 product concept' from the AI-architecture lens; B and H reach the same conclusion from data-model and adversarial lenses respectively. Re-derived: this is the one failure mode that directly and irreversibly harms an innocent third party who has no visibility into the system at all — the reasoning is sound independent of reviewer count.

### CM-06 — WORM/tamper-evidence requirement vs right-to-erasure — architecturally unreconciled

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-7), D (D-07)

Both independently identify that 21's P0-03 (optional WORM/object-lock, hash-chain) and the deletion-certificate/erasure commitments elsewhere are never reconciled, and both independently converge on the same fix: crypto-shredding (destroy the encryption key, keep tombstoned metadata/hash-chain integrity) rather than literal storage-level WORM on personal-data-bearing rows. D additionally verified, via docker-compose inspection, that no S3-Object-Lock-class storage exists in the current infra at all — meaning WORM as literally specified is not currently implementable regardless of the policy question. This is a case where two reviewers reached the same specific proposed solution, not just the same problem statement, a stronger convergence signal than problem-only agreement.

### CM-07 — Single dedicated-server hardware failure is the actual dominant DR risk, never named in the scenario list

**Classification**: `CONSENSUS`  
**Reviewers involved**: D (D-02), H (RT-02)

13's DR scenario list names 'cloud outage' and 'region outage' — categories that do not apply to a bare-metal single OVH box. Both reviewers independently note the mismatch and that no cross-box restore drill is evidenced anywhere (existing scripts appear same-box-verify only). Re-derived: for a single non-elastic dedicated server, total box loss (disk/RAID/motherboard failure — D cites OVH's own 2021 datacenter fire as precedent) is a materially higher-probability event than 'region outage,' so the gap is a real mismatch between stated DR scope and actual topology, not a stylistic quibble.

### CM-08 — Regulated high-stakes decision-support exposure (EU AI Act profiling/Annex III, US FCRA employment screening) entirely unaddressed

**Classification**: `CONSENSUS`  
**Reviewers involved**: C (SEC-01), I (REG-01)

C flags the FCRA gap from the security/privacy lens (11:99-116 contemplates employment/HR decisions with no FCRA awareness); I flags the EU AI Act gap independently via live 2026-08-29 web research (Article 6(3): profiling triggers automatic Annex III high-risk classification with 'regardless of exceptions' language, confirmed against the Act's own text). Two different statutory regimes, two different reviewers, same underlying structural defect: the product's stated purpose (assess reliability/trust/behavior of a named natural person to inform a consequential decision) matches the legal definition of regulated high-risk profiling in at least two major jurisdictions, and zero of the 24 documents mention either regime. This is independently verifiable against the cited legal text, not merely reviewer opinion.

### CM-09 — Privacy-ops artifacts (DPIA, lawful-basis matrix, subprocessor register) sequenced after real third-party data processing begins

**Classification**: `CONSENSUS`  
**Reviewers involved**: C (SEC-03), I (REG-08)

Both independently trace the same cross-document interaction: 21's P1-01 files these artifacts under Enterprise-readiness (post Wave 9), while 14/22's phase roadmap has Public Intelligence (Wave 6) and founder dogfooding on real people (Phase 5) landing several waves earlier. This is a compliance gap that only emerges from reading two documents together — neither document alone shows it — and both reviewers found it independently without seeing each other's work.

### CM-10 — HCI's epistemic ladder / evidence-claim shape / risk-tier machinery duplicates AI LEGO's already-built, ADR-accepted equivalents

**Classification**: `CONSENSUS`  
**Reviewers involved**: A (DOM-02, DOM-03), E (C1, C3)

Both reviewers independently opened the same AI LEGO spec files (epistemic-label.schema.yaml with ADR-004/11-value epistemic_type enum + promotion_redline; decision.schema.yaml; risk-tier.schema.yaml with R0-R4) and reached the same recommendation: extract a shared Foundation-layer kernel rather than let HCI re-derive an incompatible parallel vocabulary. Two reviewers independently citing identical file paths, field names, and ADR numbers without having seen each other's output is strong corroboration that these files genuinely say what both claim. One honest caveat: I did not personally re-open these AI LEGO spec files in this synthesis pass, so this row rests on cross-reviewer corroboration rather than my own direct verification (see assumption register).

### CM-11 — No consent/purpose gate on Person-record creation — architecture permits covert third-party profiling

**Classification**: `CONSENSUS`  
**Reviewers involved**: F (F4, F5), C (SEC-09)

F approaches this from the method-validity/third-party-firewall angle (紫微/八字/MBTI applied to a non-consenting third party with zero predictive validity); C approaches it from product-design angle (HCI Personal + Continuous Monitoring = stalkerware-shaped, no purpose attestation, no volume/anomaly detection). Different lenses, same root structural gap: nothing in the domain model requires a tenant to declare why a Person record is being created, and nothing distinguishes legitimate business due-diligence from ongoing surveillance of a private individual. Re-derived independently: this holds regardless of which specific instrument is the entry point — the gap is the missing gate itself.

### CM-12 — Admin/support break-glass access to RESTRICTED data is a stated principle with zero enforcement mechanism, deferred to P1

**Classification**: `CONSENSUS`  
**Reviewers involved**: C (SEC-07), H (RT-04)

Both cite 11:44-46 ('administrative authority does not automatically imply content access') as prose-only and 21 P1-07 (BREAK_GLASS_ACCESS.md, not yet written, filed under Enterprise-readiness) as the deferred fix, arriving well before Phases 2-5 already hold RESTRICTED data. H adds the sharper point that on the verified single-box baseline, direct Postgres/superuser access bypasses RLS and the application layer entirely — a live, present-tense gap given the current solo-operator-plus-AI-agents reality, not a future-hire hypothetical. Re-derived: the audit-event schema already planned for Wave 2 (11:137-159) covers only application-layer events, so this genuinely is a present gap.

### CM-13 — Key rotation / KMS / BYOK / compromise-response deferred to P1-Enterprise while field-level encryption is required from Day 1

**Classification**: `MAJORITY`  
**Reviewers involved**: C (SEC-08), H (RT-07)

Both flag the same underlying sequencing mismatch (21 P1-04 defers KEY_HIERARCHY/ENVELOPE_ENCRYPTION/CRYPTO_ERASURE while 11 requires field-level encryption immediately) but frame the consequence differently — C frames it as a sold-vs-actual-posture risk for Enterprise sales (BYOK promised, no KMS exists), H frames it as an operational-continuity risk (no compromise-response runbook during the lowest-maturity build phase). Downgraded from CONSENSUS to MAJORITY because the two reviewers point at adjacent but distinct failure consequences of the same root gap rather than converging on one identical claim.

### CM-14 — Prompt injection from untrusted retrieved web content into claim extraction has no stated defense

**Classification**: `CONSENSUS`  
**Reviewers involved**: C (SEC-04), E (C7)

C identifies the gap directly against 06's pipeline description (no content-isolation step stated between retrieval and claim extraction). E independently found that AI LEGO's own drafted threat model (SECURITY_THREAT_MODEL.md TB-1/T2/E4, citing Execution Contract §35 'Policy/System Instructions is UNTRUSTED DATA by default') already analyzes the general form of this exact threat and records it as an unresolved residual risk. This is strong convergence with a bonus: E's finding shows the fix doesn't need to be invented from scratch — a partially-drafted answer already exists one directory over in the same repo.

### CM-15 — 'Modular monolith first' and several specific anti-overengineering deferrals are correctly calibrated, not premature or missing

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-5, CI-11, CI-12), D (D-14), G (G-02, G-05), I (REG-07)

Four reviewers, working in completely different lenses (DB, infra, commercial, regulatory), independently affirm specific instances of correct restraint: defer full event-sourcing/CQRS (B), defer standalone graph DB in favor of relational + Apache AGE later (B), keep modular-monolith-on-existing-box as the load-bearing principle (D), don't build full entitlement/tier machinery before real paying customers exist (G), don't pursue SOC2/ISO27001 certification before Enterprise stage (I). Re-derived: given the verified single-box, solo-operator baseline, every one of these deferrals is the correct call under the mission brief's own anti-overengineering constraint — a rare case where the convergence is a positive finding about V1's judgment, not a defect.

### CM-16 — HCI-30 and AI LEGO should remain independent peer products at the top domain layer, while sharing a Foundation-layer epistemic/decision kernel underneath

**Classification**: `CONSENSUS`  
**Reviewers involved**: A (DOM-11), E (C1)

On first read this can look like disagreement — A explicitly KEEPs the peer-product boundary as designed, while E's central thesis argues there is 'a real, unavoidable shared technical core.' Independently re-deriving both positions shows they are compatible: A's KEEP finding is scoped to the top-level domain-ownership question (Person/Relationship/Trust vs Method/Workflow/Execution — should stay separate), while E's CHANGE recommendation is scoped one layer down (the epistemic-label/evidence-shape/risk-tier primitives underneath both domains should be extracted once, not re-derived twice). Both reviewers explicitly frame their recommendation as vendoring/pinning a shared kernel version while preserving independent failure domains (E cites 10:13-27's 'HCI works without AI LEGO' invariant as a constraint on the extraction, not a reason to reject it). This row exists specifically to prevent the human architect from mis-reading two compatible findings as a conflict requiring adjudication.

### CM-17 — RLS-default tenancy tier for the Personal/Professional/Team majority should be explicitly stated, not left implicit

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-12), D (D-08)

Both independently note 12's Tier A-D list never states a default, and both independently recommend the same fix: explicitly document Tier A (shared DB + RLS, on the already-running self-hosted Supabase instance) as the Day-1 default for the majority customer base, with dedicated-DB reserved for a specific triggered Enterprise need. D additionally verified the Supabase instance's existence directly via docker-compose. Re-derived: leaving this implicit invites exactly the 'DB-per-tenant for extra safety' overreach the anti-overengineering constraint warns against, on infra that cannot elastically absorb that operational cost.

### CM-18 — Wave 6 fetch/scan worker: reuse existing self-hosted Trigger.dev vs. build a network-isolated sandboxed runner

**Classification**: `DISAGREEMENT`  
**Reviewers involved**: D (D-05), C (SEC-05)

D recommends implementing the Wave 6 pipeline as Trigger.dev tasks on the existing self-hosted instance to avoid duplicating queue/retry/dashboard machinery, with a caveat: 'unless a specific limitation... forces a dedicated sandboxed runner.' C independently specifies that the fetch step specifically needs a network-isolated container with egress-only policy, no route to the docker-internal bridge network, and DNS-rebind protection — because the verified single-box baseline means an SSRF-capable fetch job can reach internal container endpoints (Supabase admin API, Trigger.dev internal endpoints, n8n webhook management), not just the public internet. Neither reviewer verified whether the self-hosted Trigger.dev instance's sandboxing model can actually satisfy C's isolation requirement (D flagged this exact gap as an open assumption). This is a genuine unresolved tension: 'reuse existing infra' and 'network-isolate the highest-risk single step' point toward different implementations unless someone verifies Trigger.dev can run tasks inside a network-restricted container — that verification has not happened.

### CM-19 — Enforcement-gap meta-pattern: strong constitutional principles stated in prose with no CI-blocking mechanism, recurring across multiple independent instances

**Classification**: `CONSENSUS`  
**Reviewers involved**: B (CI-4, CI-2), C (SEC-06), H (RT-03, RT-13)

This is a structural pattern each reviewer found while investigating a different specific control — B found it for insert-only ledger immutability (a 'version' column that can still be UPDATEd is not immutability) and RLS; C found it for RLS specifically; H named it as an explicit cross-cutting observation ('a constitution is not a control') and separately for destructive-migration prevention (13:97-111 is policy-only, no migration linter). Re-derived: the common thread — 30-year discipline requires 'prose principle' and 'machine-enforced gate' to be treated as two separate deliverables, and V1 currently only reliably delivers the first — holds up as a genuine architectural observation about the blueprint as a whole, not just a tally of four unrelated findings that happen to share a word.

---

## Synthesis Narrative

## Method

This synthesis treats each of the nine independent reviews as a witness statement, not a vote. Per the mission brief's explicit prohibition on majority-equals-correct, I did not tally agreement counts and declare consensus; for every topic where two or more reviewers touched overlapping ground, I re-derived the underlying reasoning myself from the evidence each reviewer cited (file:line references into the blueprint, and in several cases primary-source citations into the AI LEGO specs directory or live regulatory research) before assigning a classification. Where I could not independently re-verify a claim — most notably the exact ACCEPTED status of AI LEGO's ADR-governed schema files, which I did not re-open in this synthesis pass — I say so explicitly in the assumption register rather than inheriting the reviewers' confidence by default. Nineteen topics rose to the level of a convergence row; roughly a dozen additional single-reviewer findings of real substance (relationship-graph node/role conflation, data-classification/permission-tier naming collision, sync-vs-async integration transport, model/prompt registry duplication, vector-index tenant isolation, bulk-export as detective-only control, synthetic-evidence detection deferred too late, AI-agent-as-insider-threat) did not meet the two-reviewer bar for a convergence row but are folded into the risk register or narrative below because they are high-confidence and well-evidenced even in isolation.

## The headline pattern: four independently re-derivable structural gaps

Four findings surface across four or more independent lenses (domain architecture, database, security/privacy, red-team, and/or regulatory), reached via genuinely non-overlapping evidence paths, and each survives my own re-derivation without needing to trust any single reviewer's judgment call. This is the strongest possible signal nine blind reviews can produce.

First, the researched Person has no rights channel, and this collides directly with Invariant 6's immutable-history promise. Reviewer A found the missing domain entity (no DataSubjectRequest/CorrectionRequest anywhere in the entity list). Reviewer C found the roadmap-sequencing conflict (privacy-ops artifacts filed under Phase 7/P1-Enterprise while real people's data starts flowing in Phase 4-5 dogfooding). Reviewer H found the absence of any named rights/recourse channel at all when hunting adversarially for who gets protected and who doesn't. Reviewer I ran live GDPR research and grounded the finding in Articles 15/16/17 directly. None of these four reviewers saw the others' work. The convergence is not coincidental agreement — it is four different methodologies independently colliding with the same wall, which is exactly what should happen when a gap is real rather than a matter of taste.

Second, RLS is hedged rather than mandatory, and the only documented architecture test checks for a tenant_id column's existence, not that row-level security actually blocks a crafted cross-tenant read. Three reviewers (B, C, H) cite the identical source lines (11:73-83, 13:22-31) and reach the identical fix. Given the verified baseline — one shared self-hosted Postgres instance is the actual, not hypothetical, deployment target for the majority of tenants — this is not a stylistic nitpick; RLS is the only isolation layer that exists today for RESTRICTED-classified reputational data about real people, and a single missed policy or a leaked service_role key would silently pass every documented test while remaining fully exploitable.

Third, identity-resolution false-positive matching has no threshold owner and no correction path. Three reviewers (B, E, H) independently flag this, and Reviewer E — approaching from the AI-architecture lens rather than security or data-modeling — independently ranks it as the single highest-severity unresolved risk in the entire product concept. This is worth sitting with: the product's core function is producing durable, evidence-graded judgments about real, named, often-non-consenting people, and the mechanism that decides "yes, this claim is about the same person you think it's about" has no specified threshold, no required corroboration standard beyond an LLM's self-reported confidence, and no reversal mechanism if it's later discovered to be wrong.

Fourth, and structurally the most expensive to leave unresolved the longer it goes: three incompatible Tenant/Organization definitions coexist in the repository, and one of them is already live in production. This is the rare case where the abstract, doc-only findings from Reviewers A, B, and D (predicting a future conflict between HCI's four-level hierarchy and AI LEGO's ACCEPTED three-level ADR-003 model) turned out to already have a concrete, shipped instantiation that Reviewer G found by reading actual SQL migrations: portal.aware-wave.com deployed three weeks before this review using yet a third "organizations" model that predates and does not match either the blueprint or the AI LEGO ADR. Four reviewers, three independent evidence paths (blueprint prose, AI LEGO's own accepted spec, and live production code), one underlying defect. The good news, which G is careful to note, is that this is currently cheap: zero real external customers exist yet, and portal signup is deliberately kept closed. The reconciling ADR this needs is a documentation task today; it becomes a live-data migration the moment anyone builds a provisioning API against the existing bridge column.

## A genuine positive finding, also convergent

It would be a mistake to read this synthesis as purely a catalog of gaps. Four reviewers working in entirely different lenses — database (B), infrastructure (D), commercial architecture (G), and regulatory standards (I) — independently affirm that V1's specific instances of restraint are correctly calibrated, not accidentally under-engineered and not performatively over-cautious: deferring full event-sourcing/CQRS, deferring a standalone graph database in favor of relational-plus-Apache-AGE later, keeping "modular monolith on the existing box" as the load-bearing infra principle rather than a throwaway line, declining to build full Product/Plan/Feature/Entitlement machinery before any real paying customer exists to differentiate tiers for, and correctly staying out of SOC 2/ISO 27001 certification scope pre-Enterprise. Re-deriving each of these independently against the verified single-box, solo-operator baseline, I agree with all four: this is exactly where the anti-overengineering constraint in the mission brief says effort should not go, and V1's authors reached the same conclusion without being told to.

## Where reviewers found compatible rather than conflicting layers

One pairing initially reads as disagreement and is not: Reviewer A's KEEP verdict on the HCI/AI LEGO peer-product domain boundary, versus Reviewer E's CHANGE recommendation to extract a shared Epistemic/Provenance/Decision-Authority kernel. Re-derived carefully, these operate at different altitudes. A is answering "should Person/Relationship/Trust and Method/Workflow/Execution be one shared domain or two independent domains" — and both A and E agree the answer is two independent domains, with independent failure domains preserved. E is answering a narrower question one layer down: given two independent domains, should the underlying primitives both domains need (what counts as a fact vs. an inference, what shape does an admissible evidence record take, what risk tier gates human review) each be invented twice, or built once and vendored into both? E explicitly frames the recommended kernel as something HCI pins a version of and extends, preserving the "HCI works without AI LEGO" independence invariant A also defends. I flag this pairing explicitly so the human architect doesn't spend cycles adjudicating a conflict that doesn't actually exist between these two reviews.

## Where a real, unresolved tension remains

Only one genuine disagreement — not merely two findings about different things, but two recommendations that point toward different implementations of the same component — survived my re-derivation: Reviewer D's recommendation to implement Wave 6's fetch/scan pipeline as tasks on the existing self-hosted Trigger.dev instance (to avoid duplicating queue/retry/dashboard machinery that already runs on the box) versus Reviewer C's requirement that the fetch step specifically run inside a network-isolated, egress-only container with no route to the docker-internal bridge network (because the verified single-box topology means an SSRF-capable fetch job can otherwise reach Supabase's admin API, Trigger.dev's own internal endpoints, and n8n's webhook management surface — not just the public internet). D explicitly flagged the uncertainty himself: Trigger.dev's actual sandboxing model was not verified against this specific isolation requirement by either reviewer. This is not a case where one reviewer is right and the other wrong; it is a case where "reuse what already works" and "isolate the single riskiest step" are both correct instincts that have not yet been reconciled by anyone checking whether the existing tool can satisfy the isolation requirement. I classify it DISAGREEMENT rather than NEEDS_EVIDENCE because the two recommendations, taken literally, cannot both be followed without a specific verification step neither review performed.

## What this means for sequencing

Reading the risk register against the roadmap chapters (14, 21, 22) that all nine reviewers had access to, a clear pattern emerges independent of any single lens: the blueprint's own P0/P1/P2 prioritization system consistently defers exactly the controls that protect the data its own P0/Wave-1 schedule commits to creating. Key architecture, break-glass access, synthetic-evidence detection, DPIA/subprocessor documentation, and the bitemporal schema itself are all filed under later waves or "Enterprise readiness," while the Evidence/Claim/Assessment core that needs all of them ships in Wave 4, and real third-party data starts flowing in Phase 4-5 — before most of the P1 wave is reached. Reviewer H names this explicitly as a structural pattern rather than sixteen unrelated findings, and re-deriving it against the other eight reviews' independent P0/P1 citations, the pattern holds: it is visible from the database lens (bitemporal, WORM/erasure), the security lens (break-glass, key rotation, DSAR sequencing), the red-team lens (synthetic evidence, RLS enforcement), and the regulatory lens (DPIA, subprocessor register) simultaneously. The single highest-leverage recommendation this synthesis can offer the human architect is not any individual convergence row — it is to treat "does this control protect data that Wave 1-6 already commits to creating" as the sorting question for the P0/P1/P2 backlog, rather than "is this control needed for Enterprise sales," which is the sorting question the current document set appears to have implicitly used.