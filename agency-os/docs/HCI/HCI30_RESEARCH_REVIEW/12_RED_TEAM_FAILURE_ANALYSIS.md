# 12 Red Team Failure Analysis

> Independent analysis by Reviewer H (Adversarial / Red Team). Mandate: not to propose features, only to try to prove the HCI-30 x AI LEGO V1 architecture fails. Followed by a separate cross-check pass (below) that tested whether anything Reviewers B/C/D recommended keeping actually blocks these attacks.

---

## Narrative Analysis

# 12 — Red Team Failure Analysis (HCI-30 × AI LEGO, V1)

## Mandate and method

This is an adversarial review of the HCI-30 × AI LEGO V1 blueprint (`D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\`, chapters 00–23, all read in full). The job was not to improve the design, propose features, or validate its stated principles. The job was to attack it — to find the scenarios under which the architecture, exactly as documented today, fails to protect a real person, a real tenant, or Aware Wave itself, and to say so with a file:line citation, not a hunch.

The verdict up front: **V1 has an unusually strong constitution and an unusually weak enforcement layer.** Chapters 00–02 and 09–10 read like a team that has genuinely internalized "AGREE != FACT" and "no universal trust score." That is real and should be kept. But a constitution is not a control. Sixteen concrete attack paths below succeed against the system *as currently specified*, several of them not because the authors didn't think about the failure mode in the abstract, but because they explicitly deferred the fix to a later wave (P1/P2, Gate C+) while the thing being protected (RESTRICTED-classified dossiers on real, named, non-consenting people) is scheduled to exist from Wave 1. A constitution that says "privacy and legality outrank convenience" (01:89-107) is falsified the first time the implementation schedule puts a paying customer's evidence into production before the backup, key-rotation, or RLS-enforcement work that would actually protect it.

I organize findings by attack class, then map each to a change_item.

## 1. Identity: wrong person, no way back

06 defines identity states (MATCH_CONFIRMED → MATCH_REJECTED, 06:68-76) and says "Ambiguous identity must not enter formal evidence" (06:78). That's a real gate, and it's good. But the document that would define *how confident is confident enough* — the actual thresholds — is explicitly listed as unresolved in 16:111 ("Identity-resolution thresholds"). More importantly, nothing in 06 or 07 describes what happens *after* a match error is discovered. Two entirely plausible, common OSINT failure modes have no protocol:

- Two different real people named "John Chen, finance, Singapore" get silently merged into one Person record because early evidence looked corroborating. Evidence about the honest one starts accumulating disputes that actually belong to the dishonest one.
- One person is split across two Person records (alias, name change, married name) and the system never realizes it's looking at half the picture, understating risk.

07's entity list has no `PersonMergeLog`, `PersonSplitLog`, or any lineage object for identity correction (07:9-34). Given that a wrong match doesn't just corrupt data — it defames an innocent, unrelated real person by attaching someone else's disputes to their name — this is a P0 gap hiding inside what looks like a solved problem.

## 2. Fabricated / synthetic evidence

06's acquisition pipeline (06:15-45) has no authenticity or provenance check step between Retrieval and Claim Extraction. 21 itself names this gap — "Synthetic evidence / content provenance" is filed under **P2-06**, "long-term differentiation" (21:390-395), while Evidence admission is a **P0/Wave-4** deliverable (22:113-136) that ships years before P2 in the dependency order (22:8-23). That scheduling is the finding: the system is designed to accept "Observation" and document evidence from Day 1 with zero deepfake/synthetic-content resistance, in an environment where AI-generated screenshots, fabricated email threads, and cloned voice/video are now trivially producible by anyone motivated to frame a business rival. A malicious contributor (a bad-faith tenant employee, or a hostile third party feeding a tenant's analyst false "evidence") can inject fabricated material that flows Evidence → Claim → Assessment → Decision with nothing in the P0 pipeline built to catch it.

## 3. Malicious tenant / RLS / self-hosted Supabase

This is the most severe infrastructure-level finding because it is not hypothetical future risk — it maps directly onto the *verified current baseline*: one OVH dedicated box, self-hosted Supabase/Postgres, no managed cloud DB. 11:73-83 requires `tenant_id NOT NULL` and RLS "where appropriate" — a hedge word, not a mandate. 13:26-31's architecture test only checks that a tenant-owned table *has* a `tenant_id` column; nothing tests that RLS policies actually block a crafted cross-tenant query, and nothing addresses the single largest real-world Supabase breach vector: a leaked `service_role` key bypasses RLS entirely. HCI's own data classification defaults RESTRICTED (11:59-63) to person-analysis data — meaning the worst-case blast radius of one RLS bug or one leaked service-role secret on this single shared box is every tenant's confidential dossiers on real people, at once. 12's tenant-isolation tiers (12:41-53) describe Tier B/C/D (dedicated DB/app/region) as *options*, not defaults, and nothing says Tier A (shared DB + RLS) is disallowed for the exact RESTRICTED-classified data this product exists to produce.

## 4. Malicious / compromised admin, insider threat

11:44-46 states a principle — "Administrative authority does not automatically imply content access" — with no named mechanism in the current (P0) tier. The actual controls (`BREAK_GLASS_ACCESS.md`, service-account governance) are P1 *file paths that don't exist yet* (21:305-317). On a single shared box, an admin (or attacker with admin credentials) has a route to direct Postgres access that never touches the application layer at all, and 11's audit section (11:139-159) only enumerates *application-layer* events to log — nothing about detecting or alerting on direct DB access outside the app. Given the brief's own stated fact that the operator is currently solo, this isn't abstract: today, one compromised credential or one bad-faith future hire has an undetectable path to every tenant's RESTRICTED data, and no chapter names this as an accepted interim risk, which it should if it's going to remain true for any length of time.

## 5. LLM hallucination presented as fact

10's admission gate (10:81-93) is a real defense — AI LEGO output must pass through HCI validation before becoming a Formal Assessment. But 10's own risk-tiered gate (10:160-176) sets **LOW = single model + deterministic checks**, with no human review requirement at that tier. "Deterministic checks" is never defined anywhere in the 24 documents. A hallucinated claim generated during a LOW-risk case can become an Assessment Candidate without cross-model or human review, and nothing in 07's assessment-versioning fields (07:106-117) or 04's relationship lifecycle triggers a re-evaluation of a case's risk tier as *evidence accumulates* — a slow drip of individually-LOW-risk-cleared hallucinated claims can silently compound into the evidentiary basis for a later HIGH-risk PROCEED/EXIT decision, at which point cross-model review only checks the *new* evidence, not the hallucination sitting quietly in the history.

## 6. Source poisoning / spurious model convergence

09's AGREE != FACT invariant (09:98-102) is genuinely well-designed and I want to credit it: the doc set is unusually alert to the danger of mistaking model agreement for evidence quality, and 19 correctly keeps "Model Agreement" and "Evidence Confidence" as separate displayed numbers (19:84-102). The gap is narrower but real: nothing requires that Model A and Model B's *retrieval* be verifiably independent. If both models call the same underlying search index and land on the same SEO-poisoned or coordinated-fake page, they will "agree" — and the UI will show high Model Agreement — while the actual independent-source count (06:157-168 tracks `source_relationships`/`cites`/`derived_from`, a good mechanism) is never wired into the Model Agreement calculation itself. Two models converging on one poisoned source is not defended against by cross-model review; it's precisely what cross-model review is supposed to catch and currently can't.

## 7. Compromised vendor / vendor shutdown, single point of physical failure

Invariant 4 (01:61-68) and 18's capability-abstraction pattern (18:145-163) are correctly designed to prevent *logical* vendor lock-in. But the actual, verified, current infrastructure is a single OVH dedicated server running everything — app, HCI, Cognitive OS, self-hosted Supabase, and (unstated) backups. 13's DR scenario list (13:142-157) names "cloud outage / region outage" but not "single dedicated server total loss," which is a more severe and more likely failure mode for this specific topology (OVH's own Strasbourg datacenter fire in 2021 is a real, on-the-record precedent for exactly this failure class). 13 says to "consider" offsite and offline/immutable backups (13:129-136, soft language) and that "restore testing is mandatory" — but nowhere in 21's P0 list or 22's Wave 0-7 sequence is a *proven, tested, offsite* backup a blocking gate before real customer RESTRICTED data is admitted. 22's own Gate C (paid Personal/Pro tier, 22:333-335) is the first point that requires a restore test — meaning the architecture as sequenced permits selling a paid product and storing real dossiers on real people before backup recoverability has ever been verified.

## 8. Key compromise

21 P1-04 (21:266-279) defers key hierarchy, rotation, envelope encryption, and crypto-erasure to the *enterprise-readiness* tier — all as file paths not yet written. Meanwhile 11 defaults HCI person-analysis data to RESTRICTED and requires field-level encryption "for highly sensitive notes/evidence" (11:65-70) starting immediately. That is a direct contradiction in priority: the classification that demands strong encryption is P0; the plan for how keys are generated, rotated, and recovered from compromise is P1. If a signing secret or KMS credential is exposed during the P0/Wave-1-7 build (which is exactly when a young system is least operationally mature), there is no documented rotation or compromise-response runbook to invoke, because that runbook doesn't exist until later.

## 9. Mass export / exfiltration

12 requires self-service customer data export (12:131-143) — correct for customer rights — but this is the same code path a malicious tenant admin, a compromised customer session, or an insider would use to exfiltrate an entire tenant's RESTRICTED dossiers in one legitimate-looking API call. 11 treats bulk export only as a **detective** control ("high-risk audit alerts: bulk export," 11:153-159) — an after-the-fact alert, not a preventive one. Nothing specifies a preventive control (export size thresholds requiring pre-approval, step-up authentication, or async delayed release with a cancel window) specifically for exports of RESTRICTED-classified person data, which is exactly the category where a same-day silent exfiltration before any alert fires creates irreversible reputational and legal harm to the profiled individuals, not just to Aware Wave.

## 10. False allegation → legal complaint (the central product risk)

This is, in my judgment, the single most consequential gap in the entire blueprint, and it is a gap in *scope*, not implementation detail. 06 has genuinely good defenses for the *evidentiary* side of allegations — legal-status taxonomy (06:126-138), mandatory counter-search for negative legal/regulatory hits (06:222-234), "Unverified allegation... Decision weight: informational only" (06:201-216). Credit where due: this is thoughtful design.

But every one of those protections runs in one direction: protecting the *tenant/customer* from over-trusting bad evidence. Nowhere in 24 documents is there a mechanism for the **Person being profiled** — who is not the customer, has no account, and by design never knows a dossier about them exists — to be notified, to see what is recorded, to contest a claim, or to request correction or deletion. 21 P1-01's privacy package (`DSAR_RUNBOOK.md`, `DELETION_RUNBOOK.md`, 21:216-227) reads, in context, as being about the *tenant's own account data*, not the third-party subject's data — 02, 04, 07, and 11 never once distinguish "rights of the customer" from "rights of the data subject." A real person incorrectly or unfairly profiled (including via the identity-collision failure in §1 above) has, per this architecture, zero documented recourse. In jurisdictions with data-subject rights regimes this is not merely a UX gap; it is exposure to regulatory complaint and defamation claims that the product's own design gives it no answer for. This should have been an explicit open decision in chapter 16 and it is not present there at all.

## 11. Tenant departure vs. shared public evidence

07's evidence table explicitly carries `tenant_id` (07:84), but 06's claim/source objects (06:170-186) list no `tenant_id` field at all. If public Claims and Sources are deliberately deduplicated/shared across tenants researching the same public figure (a reasonable efficiency design nobody actually states), then 12's tenant-deletion lifecycle (12:145-161) cannot simply delete on request — other paying tenants may still depend on that same Claim/Source. Conversely, if Claims/Sources are *not* shared, re-scraping the same public figure for every tenant is wasteful and undermines the corroboration model in 06. Neither answer is chosen anywhere in the 24 documents, and 16's Open Decisions list — which is otherwise fairly thorough — does not include this question. An undecided data-ownership boundary sitting directly on top of a "customers must be able to delete their data" requirement is a defect, not an open decision that can wait.

## 12. Replay breaks when the model retires

13's Replay section (13:63-75) lists what must be preserved (method versions, Atlas hash, "AI model metadata") but never addresses what happens when the underlying vendor model referenced by that metadata is deprecated or removed by the vendor — a certainty over a 30-year horizon, and already routine on 12-24 month cycles for every current LLM vendor. Preserving a reference to something that can no longer be invoked is not the same as being able to replay it. There is no `REPLAY_UNAVAILABLE` state defined anywhere, and no policy against silently substituting a newer model at replay time (which 13 does correctly prohibit for *live* execution — "never silently substitute forbidden models," 13:172-175 — but that prohibition is not restated for replay).

## 13. Bitemporal gap undermines the system's own "30-year" and "explainability" claims

21 P0-02 (21:67-82) itself flags that bitemporal history (valid-time vs. system-time) is not yet specified, and 07's actual documented schema (07:102-117) only has `created_at`/`valid_until`/`assessment_version` — a system-time-only model. Yet chapter 19 promises "What did we know at the time?" style explainability (19:62-93) and 13 promises historical decision replay (13:63-75) as if this were already structurally supported. It isn't, by V1's own admission. The concrete failure scenario: in a defamation or regulatory discovery process, "what exactly did HCI know, and when, before it recommended EXIT on this person" is precisely the question a court or regulator will ask, and the current data model cannot answer it precisely — only approximately, from creation timestamps that conflate "when we learned it" with "when it happened."

## 14. Enforcement is prose, not machine

13's migration section (13:97-111) correctly bans destructive one-step migrations, and 13:22-31 lists five architecture tests as *examples*. But there is no CI-enforced linter blocking a `DROP COLUMN`/`TRUNCATE` against a flagged critical table, and no CI-enforced RLS cross-tenant query test. Given this same organization's own operating discipline elsewhere (the parent repo's governance explicitly distrusts prose-only rules and mandates "machine gates" precisely because discipline alone fails under context-switching and multi-agent editing), it is a real inconsistency that the HCI blueprint — which handles more sensitive data than almost anything else in this org's portfolio — relies on written policy rather than an enforced gate for its two most catastrophic failure modes (destructive migration, cross-tenant leak).

## 15. Sanctions / export-control blind spot

09 delegates "cross-border data protection, AI regulation, sanctions/trade constraints" to AI LEGO's jurisdiction module (09:77-85). But 02 simultaneously insists HCI Person/Relationship/Trust data must never be owned by AI LEGO (02:112-116). The result: the data that would actually need sanctions/export-control screening (a Person under investigation who turns out to be a sanctioned individual or entity) lives in HCI, but the compliance module that would screen for it lives in AI LEGO and explicitly must not see HCI's data. Nobody owns this. It's simply not addressed as HCI's own concern anywhere in chapters 04-11.

## 16. Bias check is decoration, not a gate

05's bias-check framework (05:79-99) and 19's mirrored UI section (19:153-164) are described with "may expose" — optional report content, not a blocking condition. Nothing in 04's decision-output flow (04:116-127) requires a completed bias review before an EXIT or PROCEED_WITH_CONTROLS decision on a strategic-tier relationship is finalized. A system that documents bias-defense this thoroughly and then never actually requires it to run before high-impact decisions has built a warning label, not a seatbelt.

## Closing assessment

None of these sixteen findings require "more architecture" in the sense the brief warns against — no Kafka, no service mesh, no multi-region. Several of the fixes are genuinely small: a merge/split log table, a preventive export-size threshold, a `REPLAY_UNAVAILABLE` state, a CI migration linter. The pattern across all sixteen is the same: V1's principles are consistently ahead of V1's enforcement, and the implementation sequencing in 21/22 consistently schedules the enforcement for *after* the thing it's supposed to protect is already live. That ordering is itself the finding that matters most — fix the sequencing (pull the P0 boundary in to include the items below) and most of these attacks stop succeeding without adding a single new subsystem.


---

## Attack Scenarios / Change Items (16)

### RT-01 — No rights/recourse channel for the profiled Person (data subject), only for the paying tenant

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | Privacy operations (DATA_INVENTORY, DSAR_RUNBOOK, DELETION_RUNBOOK) are scoped to tenant/customer account data. No document distinguishes the paying customer from the third-party Person being profiled. |
| **Problem** | A real, named, non-consenting person who is the SUBJECT of an HCI dossier has no documented way to learn a profile exists, see what's recorded, contest a claim, or request correction/deletion — even when the claim originated from an identity-collision error or an unresolved allegation. |
| **Evidence** | 02:9-49 (Person defined only as subject, never as rights-holder); 06:126-138, 06:201-234 (allegation handling protects the tenant's evidentiary judgment, not the subject's rights); 21:216-227 P1-01 privacy deliverables (DSAR/DELETION runbooks framed around tenant data); 16:98-122 Open Decisions list has no entry for data-subject rights at all. |
| **Risk if unchanged** | Defamation claims, GDPR-style right-to-erasure/right-to-rectification complaints, and reputational harm to Aware Wave with no documented mitigating process to show a regulator or court. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add an explicit HCI_DATA_SUBJECT_RIGHTS policy distinct from customer DSAR: notice-on-request mechanism, correction/dispute workflow feeding into the Claim contradiction pipeline (06), and a documented deletion-request path for subjects, gated by legal review since full subject notice may itself be commercially/legally complex per jurisdiction. |
| **Why** | This is the single highest legal-exposure gap: the product's core function (profiling real third parties) has an entire class of rights-holder that is architecturally invisible. Waiting until an actual defamation complaint or regulatory inquiry forces the design is the most expensive way to discover this. |
| **Blast radius** | Every Person record in every tenant, retroactively, once any subject asserts a rights claim. |
| **Migration impact** | Requires adding subject-facing request intake and linking it to existing Claim/contradiction workflow (06); no destructive schema change. |
| **Rollback** | N/A — this is an addition, not a reversible change to existing behavior. |
| **30-year consequence** | Data-subject-rights regimes are expanding globally, not contracting; a product with no rights channel for its core subject population becomes progressively less operable in more jurisdictions over 30 years. |
| **Confidence** | High |
| **Requires human decision** | YES |

### RT-02 — Single OVH dedicated server is a catastrophic single point of failure for all RESTRICTED customer data, with no proven offsite/immutable backup gating production use

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | Backups (Primary/Replica/Offsite/Offline-immutable) are listed as things to 'consider'; restore testing is 'mandatory' in principle but is only a Gate C (paid tier) acceptance criterion, not a P0/Wave-1 requirement. |
| **Problem** | Verified current infrastructure is one OVH dedicated server running every service including self-hosted Supabase/Postgres. DR scenarios list 'cloud outage/region outage' but never the higher-likelihood failure of total single-server loss (OVH had a real datacenter fire in 2021). Nothing blocks admitting real paying-customer RESTRICTED data before backup recoverability is actually proven. |
| **Evidence** | 13:127-141 (soft 'consider' language, no blocking requirement); 22:333-335 Gate C is the first point requiring a restore test, after Waves 0-7 (which include the full domain/evidence/assessment core) are already built; 23:1-119 and mission-brief-verified baseline confirm single dedicated box, no documented offsite backup location. |
| **Risk if unchanged** | Total, unrecoverable loss of every tenant's evidence and assessment history from a single hardware/datacenter incident, with no proof recovery was ever possible. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Pull 'proven, tested, offsite (ideally immutable) backup with a passed restore drill' into the P0 gate list (21) and make it a precondition for Wave 4 (Evidence/Claim/Assessment core) going live with any real (non-synthetic) tenant data, not deferred to Gate C. |
| **Why** | This doesn't require new infrastructure complexity (no multi-region, no k8s) — it requires sequencing the one thing that already exists as a stated requirement (restore testing) before the sensitive data it protects goes live, not after. |
| **Blast radius** | All tenants, all data, permanently, in the worst case. |
| **Migration impact** | None to schema; operational/infra work only. |
| **Rollback** | N/A — sequencing change only, no rollback risk introduced. |
| **30-year consequence** | A 30-year system that has never survived a single verified disaster-recovery drill by the time real customer data is trusted to it is not actually a 30-year system yet — it's an assumption wearing that label. |
| **Confidence** | High |
| **Requires human decision** | YES |

### RT-03 — Self-hosted Supabase RLS is 'where appropriate' (hedge), not mandatory, and no live cross-tenant query test exists — service_role key leak bypasses everything

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | tenant_id NOT NULL plus RLS 'where appropriate'; architecture test only checks schema presence of tenant_id, not that RLS actually blocks a crafted cross-tenant read. |
| **Problem** | On the verified single-box self-hosted Supabase baseline, a leaked service_role key (a well-known, common real-world Supabase incident class) or one missed RLS policy bypasses tenant isolation entirely for RESTRICTED-classified dossiers across every paying customer simultaneously. |
| **Evidence** | 11:73-83 ('where appropriate'); 13:22-31 (architecture test example only checks tenant_id column existence, not RLS enforcement under real queries); 12:41-53 (Tier A shared-DB+RLS presented as an option, not disallowed for RESTRICTED data). |
| **Risk if unchanged** | Mass cross-tenant breach of RESTRICTED personal dossiers; regulatory and contractual liability across all customers simultaneously. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Make RLS mandatory (not 'where appropriate') for every tenant-owned table; add a CI-blocking test suite that runs actual cross-tenant read/write attempts against a seeded multi-tenant fixture; add explicit service_role key custody/rotation policy for the self-hosted deployment specifically (distinct from managed-cloud Supabase where Supabase Inc. handles some of this). |
| **Why** | This is the highest-blast-radius technical vulnerability found: one config mistake or one leaked secret exposes every tenant's confidential dossiers at once, and nothing currently machine-tests for it. |
| **Blast radius** | All tenants on the shared instance, in one incident. |
| **Migration impact** | RLS policy authoring across existing tables; test-suite addition; no data migration. |
| **Rollback** | N/A, hardening change. |
| **30-year consequence** | Locks in a permanent single-key-compromise catastrophic-breach shape that only gets worse as tenant count grows. |
| **Confidence** | High |
| **Requires human decision** | YES |

### RT-04 — No detection for a malicious/compromised admin or insider bypassing the application layer via direct DB access

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 'Administrative authority does not automatically imply content access' is stated as a principle; named mechanisms (break-glass, service-account governance) are P1 file paths not yet written. |
| **Problem** | On the single shared box, direct Postgres/superuser access bypasses RLS and the application layer entirely. Audit logging described in 11 only covers application-layer events, not direct DB access. Given the currently solo-operator reality, this is a live, present-tense gap, not just a future-hire risk. |
| **Evidence** | 11:44-46 (principle only); 21:305-317 P1-07 (break-glass access doc doesn't exist yet, filed under enterprise-readiness tier); 11:139-159 (audit event fields are app-layer: who/what/when/before/after — no mention of DB-level session auditing). |
| **Risk if unchanged** | Undetectable insider or compromised-credential exfiltration of all customer RESTRICTED data. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add mandatory query-level audit logging (e.g., pgaudit or equivalent) for any DB session not originating from the application's service role, with alerting on RESTRICTED-table reads outside normal app patterns; document this as an accepted interim risk in chapter 16 until break-glass tooling ships. |
| **Why** | A principle with no technical enforcement and no acknowledged interim-risk status is worse than an acknowledged gap — it lets the org believe the risk is handled when it isn't. |
| **Blast radius** | All tenants; single actor with DB credentials. |
| **Migration impact** | Enable DB-level audit extension; minimal performance overhead to assess. |
| **Rollback** | N/A, additive logging. |
| **30-year consequence** | As the org grows past solo-operator, this becomes the default admin trust model unless explicitly replaced — much harder to retrofit after habits form. |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### RT-05 — No identity merge/split protocol — a wrong person-match has no correction path with lineage

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 06 defines match confidence states and forbids ambiguous identity from entering formal evidence, but 07's entity list has no merge/split/correction-lineage object. |
| **Problem** | Common-name collisions or later-discovered aliases mean two different real people can get merged into one Person record (contaminating an innocent person's trust profile with someone else's disputes), or one person can be split across records (understating risk). No documented recovery mechanism exists once discovered. |
| **Evidence** | 06:68-78 (match states defined, no correction protocol); 07:9-34 (entity list has no PersonMergeLog/PersonSplitLog); 16:111 (identity-resolution thresholds explicitly still undecided). |
| **Risk if unchanged** | Defamation exposure to a real, unrelated, innocent person whose name collided with a subject under investigation. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a PersonMergeLog/PersonSplitLog entity with full lineage (what was merged/split, when, by whom, evidence re-attribution trail) and a correction workflow that can retroactively flag and re-issue any Assessment/Decision that depended on the erroneous match. |
| **Why** | Identity resolution is treated as solved because match-confidence states exist, but the actual dangerous case — correcting a wrong match after evidence has already propagated into formal Assessments — is unaddressed. |
| **Blast radius** | Per-incident, but potentially cascades into multiple downstream Assessments/Decisions before discovery. |
| **Migration impact** | New tables/log entity; no destructive change to existing Person schema. |
| **Rollback** | N/A, additive. |
| **30-year consequence** | Without lineage, historical corrections become undiscoverable audit gaps decades later. |
| **Confidence** | High |
| **Requires human decision** | YES |

### RT-06 — Synthetic/fabricated evidence detection is deferred to P2 while evidence admission is a P0/Wave-4 deliverable

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21 files 'Synthetic evidence / content provenance' under P2 ('world-class differentiation'), while the Evidence/Claim/Assessment core ships in Wave 4, long before P2 in the dependency order. |
| **Problem** | The core pipeline that takes 'Observation' evidence and documents into formal Assessments will, per the documented schedule, have zero deepfake/fabrication resistance for its first several production waves — exactly the period when the system's credibility with early customers is being established. |
| **Evidence** | 21:390-395 (P2-06); 22:8-23 dependency order and 22:113-136 (Wave 4 Evidence/Claim/Assessment core precedes Wave 6 hardened public intelligence and all P2 items). |
| **Risk if unchanged** | Fabricated evidence (deepfake screenshots, cloned voice/video, forged documents) enters the formal evidence chain undetected during the exact phase reputational trust is being built. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Pull a minimum-viable authenticity check (hash/EXIF metadata check, reverse-image/reverse-text search corroboration requirement for high-stakes claims) into Wave 4/P0 scope, deferring only the more advanced synthetic-media-detection tooling to P2. |
| **Why** | Full synthetic-content-provenance tooling is legitimately hard and can wait; a baseline 'does this document/image show signs of fabrication' check is cheap and should not wait for the world-class tier. |
| **Blast radius** | Per-case, but each successful fabrication directly damages a real person's HCI record. |
| **Migration impact** | Pipeline addition in 06's retrieval→claim-extraction stage; no schema break. |
| **Rollback** | — |
| **30-year consequence** | Synthetic content generation only gets cheaper and more convincing; a system whose credibility depends on evidence quality cannot permanently defer this. |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### RT-07 — Key hierarchy, rotation, and compromise-response are P1 (enterprise) deliverables while RESTRICTED data storage and field-level encryption are P0 requirements

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 11 requires field-level encryption for highly sensitive evidence starting immediately; 21 P1-04 defers KEY_HIERARCHY/ENVELOPE_ENCRYPTION/KEY_ROTATION/CRYPTO_ERASURE docs to the enterprise-readiness tier. |
| **Problem** | The system is designed to encrypt RESTRICTED data from Day 1 but has no plan for what happens when a key or KMS credential is compromised during the P0 build phase — the period when operational maturity is lowest. |
| **Evidence** | 11:59-70 (RESTRICTED default + field-level encryption requirement, immediate); 21:266-279 P1-04 (key architecture docs don't exist yet, filed under enterprise tier). |
| **Risk if unchanged** | A key/secret leak during early production has no documented response path, extending exposure time and complicating any legal/regulatory disclosure obligation. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Write a minimal key-rotation and compromise-response runbook as part of P0, even if the full BYOK/enterprise key-hierarchy work stays P1. |
| **Why** | Encrypting data with no rotation/compromise plan is security theater — the encryption requirement and the key-lifecycle plan must ship together. |
| **Blast radius** | All encrypted RESTRICTED fields across all tenants if the compromised key is shared infrastructure. |
| **Migration impact** | Runbook + minimal rotation tooling; no schema change. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | YES |

### RT-08 — Bulk export is only a detective control (post-hoc alert), not a preventive one, for the highest-value exfiltration path

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 12 requires self-service customer data export; 11 lists 'bulk export' only as a high-risk audit alert trigger. |
| **Problem** | The legitimate self-service export API is also the highest-value insider/compromised-account exfiltration path for RESTRICTED dossiers. An alert firing after the export has already completed does not prevent same-day silent exfiltration. |
| **Evidence** | 12:131-143 (export requirement); 11:153-159 (bulk export as after-the-fact alert only, no preventive threshold mentioned). |
| **Risk if unchanged** | Same-day silent bulk exfiltration of an entire tenant's confidential dossiers before any alert is reviewed. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a preventive control for exports above a defined size/sensitivity threshold on RESTRICTED-classified data: step-up authentication, and/or an async delayed-release window with a cancellation/review option for enterprise tenants. |
| **Why** | Detective-only controls are appropriate for low-value data; for data whose exposure creates third-party legal harm (not just the tenant's own risk), prevention has to be in the design, not just observability. |
| **Blast radius** | One tenant's full dataset per incident. |
| **Migration impact** | API-layer control; no schema change. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### RT-09 — LOW-risk case tier allows a single-model hallucination to become an Assessment Candidate with no human review, and no re-evaluation as evidence accumulates

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | Cross-model gate by risk sets LOW = 'single model + deterministic checks' with no human review; nothing revisits a case's risk tier as more LOW-risk-cleared claims accumulate over time. |
| **Problem** | A hallucinated claim generated during a LOW-risk request can enter the evidence base unreviewed, and can later contribute silently to a HIGH-risk decision without itself ever having been cross-model or human reviewed, because only newly-added evidence gets reviewed at the case's current risk tier. |
| **Evidence** | 10:160-176 (risk-tiered gate, LOW tier definition); 'deterministic checks' undefined anywhere in the 24 documents; 07:102-117 (assessment versioning has no accumulated-claim re-audit trigger). |
| **Risk if unchanged** | Compounding, undetected hallucinated evidence feeding eventual high-impact PROCEED/EXIT decisions. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Require at minimum a lightweight human spot-check (not full cross-model review) for any AI-generated claim before it can be admitted as an Assessment Candidate regardless of case risk tier, and add a periodic re-audit of accumulated LOW-risk-cleared claims when a case's risk tier is later elevated. |
| **Why** | The risk-tiering logic optimizes for the risk level of the current request, not the risk level the accumulated evidence base eventually supports — that mismatch is exactly how quietly-wrong conclusions compound. |
| **Blast radius** | Per-case, but systemic if hallucination rates are non-trivial across the LOW-risk-majority of traffic. |
| **Migration impact** | Workflow/process change in 10's admission gate; no schema change. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### RT-10 — Ambiguous tenant ownership of shared public Claim/Source records conflicts with the tenant-deletion lifecycle

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 07's evidence table has tenant_id; 06's claim/source objects list no tenant_id. Whether Claims/Sources are tenant-scoped copies or globally shared/deduplicated across tenants is never decided. |
| **Problem** | 12's tenant-deletion lifecycle assumes clean per-tenant deletion, but if public Claims/Sources are shared across tenants researching the same public figure (a reasonable design nobody actually specified), deleting one tenant's data could either improperly retain data past a deletion request or improperly delete evidence other paying tenants still depend on. |
| **Evidence** | 07:78-100 (evidence_id fields include tenant_id); 06:170-186 (claim object fields do not include tenant_id); 12:145-161 (deletion lifecycle, no shared-entity handling); 16:98-122 (Open Decisions list omits this question entirely). |
| **Risk if unchanged** | Either broken deletion promises (data retained past a lawful request) or broken evidence bases for unrelated paying tenants. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Explicitly decide and document Claim/Source ownership: either (a) tenant-scoped copies with tenant-local corroboration graphs, or (b) shared global records with reference-counted, tenant-scoped visibility and deletion that only removes the tenant's link, not the underlying shared record. |
| **Why** | This is a foundational data-ownership decision sitting directly under a customer-facing deletion promise — it cannot remain implicit once real deletion requests start arriving. |
| **Blast radius** | Any public-figure Claim/Source researched by more than one tenant. |
| **Migration impact** | Schema decision affects 07's recommended relational tables (claims, claim_sources) before Wave 1 implementation — cheap now, expensive after data exists. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### RT-11 — Cross-model 'Agreement' can be spurious when both models retrieve from the same non-independent source

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | AGREE != FACT is a stated invariant and Model Agreement/Evidence Confidence are correctly kept as separate UI numbers, but Model Agreement is never computed with source-independence as an input. |
| **Problem** | If Model A and Model B both retrieve from the same underlying search index and land on the same poisoned/coordinated page, they will report high agreement while independent corroboration is actually zero — exactly the scenario cross-model review exists to catch. |
| **Evidence** | 09:98-102 (AGREE != FACT); 19:84-102 (four confidence concepts kept separate, but no wiring to source-independence); 06:157-168 (source_relationships/cites/derived_from tracked but not connected to the Model Agreement metric). |
| **Risk if unchanged** | False confidence from source-poisoned convergence undermines the exact mechanism (cross-model review) the architecture relies on to catch it. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Feed 06's source-independence tracking (cites/derived_from) into the Model Agreement calculation so agreement sourced from the same non-independent material is flagged distinctly from genuinely independent corroboration. |
| **Why** | The building blocks for the fix already exist in the design (06's provenance tracking) — this is a wiring gap, not a missing subsystem. |
| **Blast radius** | Any case where coordinated or SEO-manipulated content ranks highly. |
| **Migration impact** | Computation/metric change; no schema break. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### RT-12 — Replay has no defined behavior for when the referenced AI model is later retired by the vendor

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 13's Replay section preserves method versions, Atlas hash, and 'AI model metadata,' but never addresses model unavailability at replay time, and doesn't restate the 'never silently substitute' rule for replay specifically. |
| **Problem** | Preserving a reference to a retired/deprecated vendor model is not the same as being able to actually reproduce its output. Over a 30-year horizon, model retirement on 12-24 month vendor cycles is a certainty, not an edge case. |
| **Evidence** | 13:63-75 (Replay preservation list, no unavailability handling); 13:172-175 ('never silently substitute forbidden models' stated for live execution, not restated for replay). |
| **Risk if unchanged** | Historical decisions become silently unverifiable or silently reinterpreted by a different model than the one that actually produced them, exactly when replay is most needed (audits, legal discovery, dispute resolution). |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Define an explicit REPLAY_UNAVAILABLE state distinct from a successful replay, and prohibit silent model substitution during replay just as is already prohibited during live execution. |
| **Why** | This closes a real gap with a small, well-scoped addition — a new terminal state, not new infrastructure. |
| **Blast radius** | Any historical run referencing a since-retired model. |
| **Migration impact** | New enum state in replay result schema; additive. |
| **Rollback** | — |
| **30-year consequence** | Guaranteed to occur repeatedly over the stated 30-year horizon; this is not a tail risk. |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### RT-13 — No CI-enforced machine gate against destructive migrations or cross-tenant queries — enforcement is prose-only

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 13 correctly bans destructive one-step migrations and requires Expand/Contract discipline, but this is written policy, not a blocking CI check; the listed architecture tests are illustrative examples, not a required enforced suite. |
| **Problem** | For the two most catastrophic technical failure modes in this system (irreversible destructive migration on evidence tables; cross-tenant data leak), enforcement depends entirely on an engineer or agent remembering the rule, with no automated gate that fails the build. |
| **Evidence** | 13:97-111 (Expand/Contract policy, no CI enforcement mechanism named); 13:22-31 (architecture tests presented as examples, not a mandated blocking suite). |
| **Risk if unchanged** | One missed review catches a destructive migration too late; evidence with legal/audit significance is irrecoverably altered or lost. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a CI-blocking migration linter that flags DROP/TRUNCATE/ALTER-destructive statements against any table tagged 'critical' or 'evidence', plus the RLS cross-tenant test from RT-03, as required (not optional) gates before merge. |
| **Why** | Prose-only discipline is known to fail under multi-agent, multi-session editing — this is the same category of gap this organization's own broader operating practice treats as unacceptable elsewhere. |
| **Blast radius** | Whatever table the migration touches, permanently. |
| **Migration impact** | Tooling addition to CI; no schema change. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### RT-14 — Bitemporal history is not yet in the documented schema, despite chapters elsewhere promising 'what did we know at time X' explainability and replay

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21 P0-02 itself flags bitemporal modeling as unspecified; 07's actual schema only carries system-time fields (created_at/valid_until/assessment_version), not a valid-time/system-time split. |
| **Problem** | 19 and 13 both describe explainability and replay capabilities that implicitly assume the system can answer 'what did we know on date X, and when did we learn it' precisely — a capability the current 07 schema cannot provide. |
| **Evidence** | 21:67-82 P0-02 (bitemporal gap self-acknowledged); 07:102-117 (assessment versioning fields are system-time only); 19:62-93 and 13:63-75 (explainability/replay promises that assume this capability exists). |
| **Risk if unchanged** | In litigation or regulatory discovery, the system cannot precisely answer 'what did you know and when,' undermining the explainability claims the entire product is positioned on. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Resolve P0-02 before Wave 1 schema implementation (22) rather than treating it as a parallel-track gap item; make 07 the authoritative bitemporal-aware schema before any production data is written, since retrofitting bitemporal modeling onto live evidence tables is materially harder than designing it in from the start. |
| **Why** | This is V1's own acknowledged gap, but its downstream consequence (unanswerable 'what did you know and when' in a legal discovery context) is understated by filing it as one gap item among many rather than a blocking precondition for the domain model chapter it actually invalidates. |
| **Blast radius** | Every historical Assessment/Decision, retroactively, once precise reconstruction is needed. |
| **Migration impact** | Schema-level change to 07's core tables; must happen before Wave 1 data exists to avoid a painful backfill. |
| **Rollback** | — |
| **30-year consequence** | Retrofitting bitemporal modeling after years of system-time-only data exists is far more expensive than designing it in from Wave 1. |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### RT-15 — Sanctions/export-control screening for HCI's own research subjects has no owner

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 09 delegates cross-border/sanctions/jurisdiction handling to AI LEGO's jurisdiction module, but 02 forbids AI LEGO from owning HCI Person/Relationship data — leaving the data that would need sanctions screening (a Person under research) inside HCI, unscreened. |
| **Problem** | Deep due-diligence research on a person or organization that turns out to be sanctioned, or research conducted by/for a tenant in a way that itself violates export-control rules, creates legal exposure for Aware Wave that no chapter assigns ownership to defend against. |
| **Evidence** | 09:77-85 (jurisdiction module owned by AI LEGO); 02:112-116 (AI LEGO must not own HCI Person data) — the two statements together leave a gap with no named owner. |
| **Risk if unchanged** | Potential export-control/sanctions violation exposure from conducting or facilitating research on a restricted individual or entity. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Assign HCI itself a lightweight sanctions/watchlist screening step in the identity-resolution stage (06) for Deep Due Diligence research modes, independent of AI LEGO's broader jurisdiction module. |
| **Why** | This falls squarely in a seam created by the product-boundary rule itself (02) — worth flagging explicitly rather than letting it be silently unowned. |
| **Blast radius** | Per-case, but with regulatory (not just civil) exposure. |
| **Migration impact** | New screening step in 06's identity-resolution pipeline for high-depth research modes; no schema break. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Low |
| **Requires human decision** | YES |

### RT-16 — Analyst bias check is optional report content, not a blocking gate, for high-impact decisions

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | Bias-check fields (confirmation/halo/horn/recency bias) are described as content a report 'may expose,' with no requirement that they be reviewed before an EXIT or PROCEED_WITH_CONTROLS decision on a strategic-tier relationship is finalized. |
| **Problem** | A thoroughly designed bias-defense framework that never actually blocks a high-impact decision functions as documentation of good intent, not a working control. |
| **Evidence** | 05:79-99 (bias-check framework, 'may expose'); 19:153-164 (same framework mirrored in UI spec, still optional); 04:116-127 (decision-output flow has no bias-check precondition). |
| **Risk if unchanged** | High-impact decisions proceed without the one check specifically designed to catch analyst bias, on exactly the decisions where bias has the most consequence. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Require a completed bias-check pass as a precondition for finalizing EXIT or PROCEED_WITH_CONTROLS decisions on Stage 4+ (confidential/strategic) collaborations specifically — not for every low-stakes decision, to avoid overbuilding process for low-risk cases. |
| **Why** | This is a low-cost fix (wiring an existing optional field into an existing decision gate) that closes a real gap between stated principle and actual behavior. |
| **Blast radius** | Per high-impact decision. |
| **Migration impact** | Workflow gate addition in 04's decision flow; no schema break. |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

---
## Open Assumptions Flagged by This Reviewer

- Assumed the described attack surface applies to V1 as a design/specification, not yet as running production code — findings are about what the documented architecture fails to defend against if implemented as written, since no HCI/Cognitive OS runtime code exists yet in the repo beyond this blueprint.
- Assumed the verified current infrastructure baseline (single OVH dedicated server, self-hosted Supabase, no confirmed offsite backup) stated in the mission brief and echoed in chapters 20/23 remains accurate at review time.
- Assumed 'tenant' in this blueprint means a paying HCI customer organization, and 'Person' means an unrelated third-party research subject who is never a tenant — this distinction, while implicit throughout chapters 02-11, is itself part of what RT-01 argues should be made explicit.
- Assumed no separate, unread document elsewhere in the repo (outside the 24-file blueprint directory) already resolves any of these gaps; a brief corroborating grep of the wider repo was not performed beyond the assigned blueprint directory given the scope of this red-team pass.

---
## Open Risks Flagged by This Reviewer

- Identity collision / no merge-split lineage (RT-05) compounds with the data-subject-rights gap (RT-01): a wrongly-merged innocent person has no way to discover the error AND no channel to report it even if they did.
- The single-box infrastructure risk (RT-02) and the RLS/service-role risk (RT-03) are compounding, not independent: a single-server compromise event could combine physical loss with credential exposure in one incident.
- P0/P1/P2 prioritization in chapters 21-22 systematically defers exactly the controls (keys, synthetic-evidence detection, drift monitoring, break-glass access) that protect the RESTRICTED-classified data the same documents require to exist from Wave 1 — this is a structural pattern across many findings, not sixteen unrelated issues.
- No red-team finding here addresses code-level implementation risk (SQL injection, auth bypass bugs, etc.) because no implementation exists yet to review — a second adversarial pass will be needed once Wave 1-4 code actually lands.

---

## Cross-Check: Do Any Other Reviewers' KEEP Recommendations Actually Block These Attacks?

> A separate adversarial pass, given Reviewer H's full output plus the KEEP-only items from Reviewers B (Database), C (Security/Privacy), and D (SRE/DevOps), instructed to be skeptical by default and require a concrete technical mechanism before crediting a KEEP recommendation with blocking an attack.

| # | Attack Scenario | Nearest KEEP Item | Survives Attack? |
|---|---|---|---|
| 1 | RT-01: No rights/recourse channel for the profiled Person (data subject) | none — no KEEP addresses this | ❌ stands unmitigated |
| 2 | RT-02: Single OVH box, no proven offsite backup gating production use | none — no KEEP addresses this | ❌ stands unmitigated |
| 3 | RT-03: RLS 'where appropriate' + no cross-tenant CI test + service_role key leak bypasses everything | B — 'DB-per-tenant correctly rejected for shared tiers, formalized' | ❌ stands unmitigated |
| 4 | RT-04: No detection for malicious/compromised admin bypassing app layer via direct DB access | none — no KEEP addresses this | ❌ stands unmitigated |
| 5 | RT-05: No identity merge/split protocol with correction lineage | none — no KEEP addresses this | ❌ stands unmitigated |
| 6 | RT-06: Synthetic/fabricated evidence detection deferred to P2 while evidence admission is P0 | none — no KEEP addresses this | ❌ stands unmitigated |
| 7 | RT-07: Key rotation/compromise-response deferred to P1 while field-level encryption is P0 | none — no KEEP addresses this | ❌ stands unmitigated |
| 8 | RT-08: Bulk export is detective-only, not preventive, for the highest-value exfiltration path | none — no KEEP addresses this | ❌ stands unmitigated |
| 9 | RT-09: LOW-risk tier allows unreviewed single-model hallucination with no re-audit as evidence accumulates | none — no KEEP addresses this | ❌ stands unmitigated |
| 10 | RT-10: Ambiguous tenant ownership of shared public Claim/Source records vs. tenant-deletion lifecycle | B — 'DB-per-tenant correctly rejected for shared tiers, formalized' | ❌ stands unmitigated |
| 11 | RT-11: Cross-model 'Agreement' can be spurious when both models retrieve from the same non-independent source | none — no KEEP addresses this | ❌ stands unmitigated |
| 12 | RT-12: Replay undefined when the referenced AI model is later retired by the vendor | none — no KEEP addresses this | ❌ stands unmitigated |
| 13 | RT-13: No CI-enforced gate against destructive migrations or cross-tenant queries — enforcement is prose-only | D — 'Modular monolith first principle correct, should be made load-bearing (tied to real tooling)' | ❌ stands unmitigated |
| 14 | RT-14: Bitemporal history missing from schema despite explainability/replay promises | none — no KEEP addresses this | ❌ stands unmitigated |
| 15 | RT-15: Sanctions/export-control screening for HCI research subjects has no owner | none — no KEEP addresses this | ❌ stands unmitigated |
| 16 | RT-16: Analyst bias check is optional report content, not a blocking gate | none — no KEEP addresses this | ❌ stands unmitigated |

### Detailed reasoning per attack

**RT-01: No rights/recourse channel for the profiled Person (data subject)** — B's KEEP is about DB-per-tenant tiering; D's KEEP is about modular-monolith decomposition style; C has zero KEEP items. None of these touch data-subject rights, DSAR scoping, or correction/dispute workflows. The gap between customer-DSAR and subject-rights is architectural/legal, not infrastructural — nothing kept as-is even operates in that layer. Attack stands fully unmitigated.

**RT-02: Single OVH box, no proven offsite backup gating production use** — Neither B's tenancy-tier KEEP nor D's monolith-first KEEP says anything about backup/DR sequencing, restore-drill gating, or infrastructure redundancy. D's KEEP is explicitly about avoiding premature service decomposition, which is orthogonal to whether a restore-tested offsite backup exists before real RESTRICTED data is admitted. No mechanism blocks this attack.

**RT-03: RLS 'where appropriate' + no cross-tenant CI test + service_role key leak bypasses everything** — This is the closest thing to an on-topic KEEP, but check the actual mechanism: B's item only proposes writing down that dedicated-DB-per-tenant is rejected for shared tiers — it does not make RLS mandatory (vs. 'where appropriate'), does not add a CI-blocking cross-tenant query test, and says nothing about service_role key custody/rotation. Formalizing the shared-DB decision, if anything, cements the exact topology RT-03 attacks rather than hardening it. No concrete control blocks the leaked-key or missing-policy scenario.

**RT-04: No detection for malicious/compromised admin bypassing app layer via direct DB access** — No KEEP item from B, C, or D mentions DB-level audit logging (pgaudit or equivalent), break-glass tooling, or service-account governance. This is squarely a security/privacy-and-DB-ops control and the security reviewer (C) produced zero KEEP items. Attack stands.

**RT-05: No identity merge/split protocol with correction lineage** — Neither tenancy tiering nor monolith-first architecture has any bearing on Person-record merge/split lineage or retroactive Assessment correction. This is a domain-model gap in chapter 07 untouched by any KEEP item.

**RT-06: Synthetic/fabricated evidence detection deferred to P2 while evidence admission is P0** — No KEEP item discusses evidence provenance, authenticity checks, or pipeline sequencing between P0 and P2. The scheduling defect H identifies is untouched by anything recommended for preservation.

**RT-07: Key rotation/compromise-response deferred to P1 while field-level encryption is P0** — Key hierarchy and rotation is core security/privacy territory — exactly where C's KEEP list is empty. B and D's KEEP items (tenancy tiers, monolith style) have no relationship to cryptographic key lifecycle. Attack stands.

**RT-08: Bulk export is detective-only, not preventive, for the highest-value exfiltration path** — No KEEP item proposes or preserves any preventive export control (step-up auth, size threshold, delayed release). This is an application/API-layer control absent from all three KEEP lists.

**RT-09: LOW-risk tier allows unreviewed single-model hallucination with no re-audit as evidence accumulates** — This concerns HCI's cross-model review/risk-tiering workflow, not database tiering or service decomposition. None of the three reviewers' KEEP items operate at this layer at all.

**RT-10: Ambiguous tenant ownership of shared public Claim/Source records vs. tenant-deletion lifecycle** — Superficially adjacent (both about tenancy/data-ownership), but the mechanisms don't overlap: B's KEEP addresses whether tenants get dedicated databases at the infrastructure-tier level; RT-10 is about whether individual Claim/Source entities are tenant-scoped copies or globally shared records referenced by multiple tenants, and how deletion should behave against shared records. Formalizing the DB-tier decision says nothing about entity-level ownership or reference-counted deletion. The open decision RT-10 flags in chapter 16 remains genuinely unresolved.

**RT-11: Cross-model 'Agreement' can be spurious when both models retrieve from the same non-independent source** — This is a metric/computation gap in the AI LEGO confidence-scoring pipeline. No KEEP item from B, C, or D touches model-agreement computation or source-independence wiring.

**RT-12: Replay undefined when the referenced AI model is later retired by the vendor** — No KEEP item discusses replay semantics, model deprecation handling, or a REPLAY_UNAVAILABLE state. Outside the scope of all three reviewers' preserved items.

**RT-13: No CI-enforced gate against destructive migrations or cross-tenant queries — enforcement is prose-only** — Closest available KEEP, but read the mechanism carefully: D's own item admits the principle is currently 'aspirational prose... not yet load-bearing' and recommends it become tied to tooling — it is not itself a description of an existing enforced gate. It concerns service-decomposition discipline (avoid premature microservices), not migration linting or RLS query testing. If anything, D's own language ('prose, not yet load-bearing') independently corroborates RT-13's exact diagnosis (enforcement is prose, not machine) rather than refuting it. No CI-blocking migration linter or cross-tenant test exists in any KEEP item.

**RT-14: Bitemporal history missing from schema despite explainability/replay promises** — Purely a data-model gap in chapter 07's schema design. No KEEP item from any reviewer touches valid-time/system-time modeling.

**RT-15: Sanctions/export-control screening for HCI research subjects has no owner** — A compliance-ownership seam between HCI and AI LEGO's jurisdiction module. Not addressed by DB-tiering or monolith-architecture KEEP items, and the security/privacy reviewer (whose domain this most belongs to) kept nothing.

**RT-16: Analyst bias check is optional report content, not a blocking gate** — A decision-flow gating gap in chapter 04. No KEEP item from B, C, or D discusses bias-check enforcement or decision-output preconditions.


### Cross-check synthesis

Zero of Reviewer H's sixteen attack scenarios are blocked or even partially mitigated by anything Reviewers B, C, or D recommended keeping as-is. That is the headline finding of this cross-check, and it holds up under the 'concrete technical mechanism' test rather than a surface topic-match test: in the two cases where a KEEP item shares a subject area with an RT scenario (B's tenancy-tier item touching RT-03 and RT-10; D's modular-monolith item touching RT-13), close reading shows the KEEP item does not actually supply the missing control. B's item proposes writing down that dedicated-DB-per-tenant is rejected for shared tiers — a naming/documentation move, not a change to RLS enforcement, service_role key custody, or Claim/Source entity-ownership semantics. D's item is explicit that the modular-monolith principle is currently 'aspirational prose' that needs to be 'tied to real tooling' — which is an admission that no enforced gate exists yet, the same gap RT-13 names directly. Neither KEEP item, read for mechanism rather than topic, changes the outcome of the attack it's nearest to.

The more structurally important signal is what the KEEP lists contain in aggregate: one item from B, one from D, and nothing at all from C. That asymmetry is not noise. C is the Security/Privacy reviewer, and eight of Reviewer H's sixteen scenarios sit squarely in security/privacy territory — RT-01 (data-subject rights), RT-03 (RLS/service-role compromise), RT-04 (insider/admin bypass), RT-06 (evidence authenticity), RT-07 (key lifecycle), RT-08 (exfiltration prevention), RT-09 (hallucination governance), and RT-15 (sanctions screening). If any existing control in the V1 blueprint were actually adequate against these attack classes, the reviewer whose entire mandate is security and privacy would be the one most likely to have found it and flagged it for preservation. C found nothing. An empty KEEP list from the domain-matched reviewer is not merely 'no additional evidence' — it is itself evidence, converging independently with H's red-team conclusion that the current architecture has essentially no operative security control worth defending, only a well-written set of principles describing what a future control should do.

This convergence needs to be handled carefully given the standing rule that AGREE != FACT and MAJORITY != CORRECT. The four reviewers did not reach the same conclusion by cross-influencing each other or by defaulting to a shared assumption — they used different methods aimed at different layers (H ran attack-scenario simulation against the full document set; B reviewed schema and tenancy design; C reviewed security and privacy controls; D reviewed SRE/infrastructure posture) and each independently produced almost nothing to defend. That is a meaningfully different situation from four reviewers converging on a shared belief; it is four independent methodologies failing to find counter-evidence to a specific, falsifiable set of claims. The claims survive not because reviewers agree, but because nothing offered actually contradicts them at the mechanism level.

The pattern across the two non-empty KEEP items reinforces H's own top-line diagnosis rather than undercutting it. Both B's and D's kept items describe something that is correctly decided in principle but not yet load-bearing in practice — exactly the 'principles ahead of enforcement' shape that Reviewer H identifies as the systemic defect running through all sixteen findings (see H's closing assessment: 'V1's principles are consistently ahead of V1's enforcement'). B's item literally says the correct call was made but 'never stated or justified anywhere in V1.' D's item literally says the correct principle exists but is 'stated as an isolated line rather than the load-bearing header it deserves to be.' Both are, in effect, additional instances of the same failure class H is attacking — a good idea recorded in prose with no mechanism forcing compliance — rather than counterexamples to it. If anything, cross-referencing them against the red team makes the case stronger, not weaker: even the reviewers assigned to defend the database and infrastructure layers could only point to two places where the documentation was incomplete, not two places where an actual control was already working.

Practical implication for the blueprint's disposition tracking: none of Reviewer H's sixteen RT items should be downgraded, closed, or marked as addressed on the strength of the B/C/D KEEP lists. All sixteen dispositions H already assigned (mostly ADD or CHANGE, several requires_human_decision=true) remain fully live and should be treated as such in chapter 16's Open Decisions and chapter 21/22's P0/P1/P2 sequencing. The specific risk H calls out explicitly — that P0/P1/P2 prioritization systematically defers the controls (keys, synthetic-evidence detection, break-glass access, RLS enforcement, backup verification) that protect the RESTRICTED-classified data the same documents require to exist from Wave 1 — is not just uncontradicted by this cross-check, it is corroborated by the near-total absence of anything in the other three reviews that claims those controls already exist. A blueprint with a strong constitution and an admittedly thin enforcement layer, reviewed by three independent domain specialists who could between them find only two documentation gaps worth 'keeping as a correct call' and one whose own security specialist found nothing to keep at all, is exactly the shape Reviewer H describes: a system whose stated values are real and whose machinery to enforce them, as of V1, is not.