# Regulatory / Standards Research (Supplementary) — Reviewer I

> Not one of the 22 numbered deliverables in the original mission spec, but preserved as a standalone supplementary document because it is primary research (with sourced citations) that materially informs `07_SECURITY_PRIVACY_REVIEW.md`, `15_RISK_REGISTER.md`, and `22_OPEN_HUMAN_DECISIONS.md`. Independent analysis, same isolation guarantee as the other 8 reviewers.

---

## Narrative Analysis

# Reviewer I — Regulatory / Standards Research on HCI-30 (V1 Blueprint)

## Method and scope

I read all 24 files in `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\` in full (00 through 23, plus `manifest.json`'s listed order), and I ran live web research (retrieval date **2026-08-29**, matching the session's current date) against the specific standards and regulations named in my brief: NIST CSF, NIST SSDF, NIST AI RMF (+ GenAI Profile), OWASP ASVS, OWASP API Security Top 10, OWASP Top 10 for LLM Applications, ISO/IEC 27001, ISO/IEC 42001, SOC 2 Trust Services Criteria, GDPR (Art. 22 focus), and the EU AI Act risk tiers. I did not rely on memorized/stale knowledge for any version number, date, or classification rule — every factual claim about a standard below traces to a search or fetch performed in this session, and I say so explicitly where a source's date was itself uncertain or where two retrieved sources disagreed, rather than resolving the disagreement by guessing.

The headline finding is structural, not a list of missing checkboxes: **HCI-30's core function, as specified in `06_HCI30_PUBLIC_INTELLIGENCE.md` and `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, is a textbook match for the EU AI Act's legal definition of "profiling."** The Act defines profiling as "any form of automated processing of personal data to evaluate personal aspects relating to a natural person — in particular to analyse or predict aspects concerning work performance, economic situation, health, personal preferences, interests, **reliability, behaviour**, location or movements" (Article 4(4), cross-referenced via the retrieved summary of Article 6 from artificialintelligenceact.eu). Compare that verbatim to `04_HCI30_PRODUCT_SPEC.md:72-85`, which lists HCI-30's "Core analysis dimensions" as including "Integrity consistency," "Reliability / fulfillment," "Predictability" — and to the entire `06_HCI30_PUBLIC_INTELLIGENCE.md` pipeline, which exists specifically to "analyse or predict" a real named person's reliability and behavior from public evidence. This is not an edge case the product might drift into; it is the product's stated mission ("Human Collaboration Intelligence" — `02_PRODUCT_BOUNDARIES.md:13`).

## Why this matters more than a routine gap-analysis item

Under Article 6(3) of the EU AI Act (Regulation (EU) 2024/1689), AI systems that would otherwise qualify for a narrow-task exemption from Annex III high-risk status **lose that exemption automatically the moment they perform profiling of natural persons** — the fetched text states this "shall always be considered to be high-risk" override applies "regardless of the paragraph 3 exceptions." This is a harder trigger than most Annex III categories, which at least allow a documented self-assessment escape hatch (Article 6(4)) for systems that don't materially influence outcomes. Profiling has no such escape hatch. Separately, and independently, `11_SECURITY_PRIVACY_GOVERNANCE.md:99-116` ("Employment / HR boundary") explicitly contemplates HCI supporting "Hire / Fire / Promotion / Compensation" decisions with human review — which lands squarely in **Annex III, point 4** (employment, worker management, access to self-employment), one of the Act's most heavily scrutinized categories, independent of the profiling override.

None of the 24 blueprint files mention "AI Act," "high-risk AI," "Annex III," "conformity assessment," or "notified body" anywhere. I confirmed this by reading every file, not by grep — I want to be explicit that this is a positive absence I verified through full reading, per the brief's evidentiary standard. The nearest the blueprint gets is `21_HCI_TOP_TIER_GAP_ANALYSIS.md:249-251` (P1-02), which lists target alignment standards as "ISO/IEC 27001:2022, NIST CSF 2.0, NIST SSDF, OWASP ASVS 5.0, OWASP API Security Top 10, ISO/IEC 42001:2023 where applicable, NIST AI RMF / GenAI Profile where applicable." This is a genuinely good list — better than most early-stage blueprints — but it is entirely a **security-control-catalog** list. It does not include a single **AI-specific product-classification or data-protection regulation** (no AI Act, no GDPR Article 22, no DPIA trigger, no data-subject-rights-for-non-customers concept). Security controls and legal product classification are different questions; V1 has started answering the first and has not yet asked the second.

I classify this MUST, not SHOULD, for one reason: the classification decision itself (not full compliance) costs almost nothing to make now and is expensive to retrofit later. Deciding "we will not market or knowingly sell HCI-30 for use in EU employment/HR decisions, and we will document this scope restriction in the product boundary docs and in customer contracts" is a one-paragraph ADR today. Discovering the classification after an EU enterprise customer has already deployed HCI-30 for candidate screening — requiring retroactive risk-management-system documentation, technical documentation, logging redesign for 6-month retention (Article 26(6)), and possibly conformity assessment — is a multi-month, multi-hundred-thousand-euro program. This is precisely the "30-year replacement test" logic the mission brief asks for, applied to a legal boundary rather than a vendor: cheap now, ruinous later, and the fix is a decision plus a paragraph, not a rewrite.

I want to be equally clear about what I am **not** recommending: I am not recommending Aware Wave build a full EU AI Act conformity program today. The company is a solo operator on a single OVH dedicated server, currently in the "Phase 5 — Personal product / founder dogfooding" stage of its own roadmap (`14_ROADMAP_AND_DEFINITION_OF_DONE.md:68-73`). Full conformity assessment, EU database registration, and a Fundamental Rights Impact Assessment program (Article 27 — which, per my retrieval, applies only to public bodies and to private entities "providing public services," not to a generic SaaS vendor, per artificialintelligenceact.eu's Article 27 summary) would be wildly disproportionate at this stage and I explicitly classify them **NOT_APPLICABLE now / FUTURE** at Enterprise-wave maturity. What is MUST *now* is the **scoping decision and its documentation** — not the compliance program.

## GDPR: the profiled person is not the customer, and V1 has not addressed them

The second major structural gap is subtler and, I believe, more novel than the AI Act point: **every privacy-operations artifact in the V1 blueprint is written from the perspective of the paying tenant as the data subject, not from the perspective of the researched Person.**

Look at `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:130-161` ("External sharing," "Export," "Account termination") and `21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-230` (P1-01 Privacy operations: `DSAR_RUNBOOK.md`, `DELETION_RUNBOOK.md`, `CONSENT_AND_NOTICE_MODEL.md`). Every one of these describes rights and workflows for the **customer/tenant** — the account holder exporting or deleting *their own account's* data. But HCI-30's actual sensitive personal data is about the **Person entity being researched** (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:36-46`, which correctly and admirably distinguishes `User != Person` — this distinction is architecturally excellent and is exactly the right foundation to build data-subject-rights logic on, but the blueprint stops at defining the distinction and never builds the rights workflow on top of it). That Person — e.g., a startup founder or business partner being vetted per `04_HCI30_PRODUCT_SPEC.md`'s stated use case — is, under GDPR, a **data subject** with rights against whoever controls their data, and they typically have no account, no login, no visibility into HCI-30, and never gave consent to being profiled.

Under GDPR (Regulation (EU) 2016/679), Article 15 (access), Article 16 (rectification), Article 17 (erasure), and Article 21 (objection) all belong to that third-party Person, not to the tenant who commissioned the research. My retrieval on Article 17 confirms erasure "is not absolute" and can be refused for, among other grounds, "the establishment of legal claims" — so HCI-30 is not necessarily obligated to delete evidence a customer needs for a real collaboration decision, but it **is** obligated to have a defined, defensible process for handling such a request, and V1 currently has none. Worse, `06_HCI30_PUBLIC_INTELLIGENCE.md`'s claim categories explicitly include "Disputes," "Criticism," "Legal Matters," "Allegation" (lines 102-138) about a **named real person** — this is reputationally consequential content the data-subject-accuracy principle (GDPR Art. 5(1)(d), "kept accurate and ... every reasonable step... to erase or rectify") applies to directly, and it is also the exact fact pattern that generates defamation exposure if an "Allegation" claim is later shown to be false and Aware Wave (or its customer) acted on it without adequate corroboration controls. To V1's credit, `06:201-235` ("Negative evidence rules," "Mandatory counter-search") already builds real technical mitigations against exactly this risk — decision-weight suppression for uncorroborated claims, automatic counter-search for dismissal/acquittal/settlement — which is good, evidence-literate design. But mitigating the *epistemic* risk (is the claim true) is not the same as building the *legal* workflow (how does the named person contest, correct, or request erasure of what HCI-30 holds about them), and only the first exists today.

This also raises a question V1 has not asked at all: **who is the GDPR controller for the profiled Person's data** — the tenant-customer who initiated the research, or Aware Wave, whose own systems perform identity resolution, claim extraction, and synthesis (i.e., exercise independent processing decisions, not just storage)? `11_SECURITY_PRIVACY_GOVERNANCE.md:117-125` frames Aware Wave purely as a processor of "customer data," which is a reasonable default for the tenant's own evidence/notes, but does not obviously hold for the Public Intelligence pipeline, where Aware Wave's AI actively decides what to extract, corroborate, and synthesize about a third party who has no contractual relationship with anyone in the chain. This is a genuine "joint controller" or "independent controller" question with real liability consequences (GDPR Art. 26 joint-controller arrangements, Art. 82 liability), and I could find no trace of it being asked anywhere in the 24 files. I flag it MUST, `requires_human_decision: true`, because the resolution is a business/contractual choice (how Aware Wave's terms of service and customer DPAs allocate controller responsibility), not something I can resolve analytically.

Regarding Article 22 specifically (the lens I was asked to focus on): my retrieval confirms the prohibition applies to decisions "based **solely** on automated processing... that produce[] legal effects... or similarly significantly affect[]" the data subject, with three narrow lawful-basis exceptions, and that even where an exception applies, the data subject retains "the right to human intervention, to express their view, and to contest the decision." HCI-30's own constitution is unusually well-aligned with this already — Invariant 2 in `01_SYSTEM_CONSTITUTION.md:39-56` ("AI is non-authoritative... may not unilaterally... make high-impact final decisions") and the entire "human final decision" principle repeated throughout the blueprint essentially pre-empt Article 22 applying at all, *if genuinely implemented as specified*. That is a real strength, and I want to name it as such rather than only listing gaps: **V1's core design philosophy already does the hard part of Article 22 compliance by construction, for the tenant-customer's own decision.** What remains is (a) a DPIA, which my retrieval confirms is a hard requirement whenever Article-22-scope processing is contemplated even if an exception is later invoked, and (b) documenting the lawful basis and notice given to the profiled Person specifically (not the tenant), which is a distinct and currently-absent artifact from the `CONSENT_AND_NOTICE_MODEL.md` placeholder that only speaks to the customer relationship.

## Standards-by-standards MUST / SHOULD / FUTURE / NOT_APPLICABLE classification

**EU AI Act (Regulation (EU) 2024/1689)** — MUST *the scoping decision*, NOT_APPLICABLE *the compliance program*, at current stage. Retrieved via artificialintelligenceact.eu (fetched 2026-08-29): Article 6(3) profiling override triggers automatic Annex III high-risk status; Annex III point 4 covers employment/HR uses that V1 already contemplates. High-risk Chapter III obligations apply from **2 December 2027** (Annex III) / **2 August 2028** (Annex I) per the article-6 page I fetched, reflecting a "Digital Omnibus" postponement passed July 2026 from an original August 2026 date. I note a genuine source conflict here worth flagging rather than silently resolving: a second retrieved source (an HR-compliance blog, undated relative to the amendment) states employment-specific obligations apply "from 2 August 2026" — this almost certainly reflects the pre-Digital-Omnibus deadline and is likely stale, but I cannot fully reconcile the two retrieved sources with certainty, and I am saying so rather than picking one. Whichever date is correct, both are years away, which supports my NOT_APPLICABLE-for-now judgment on the *program*, while the *classification decision* costs nothing and should happen now.

**GDPR (Regulation (EU) 2016/679)** — MUST. Not a future consideration; it applies today to any EU-linked natural person HCI-30 researches, regardless of company size or maturity stage (GDPR has no small-business carve-out for processing of this sensitivity). Article 22, Article 16/17, Article 35 (DPIA) all apply now in principle; what's missing is not "GDPR readiness" broadly (V1's `07` bitemporal/versioning design and `11`'s classification/audit design are already unusually GDPR-literate for an architecture-stage document) but specifically the **third-party-data-subject** rights workflow and the **controller/processor determination**, both entirely absent.

**OWASP Top 10 for LLM Applications (2025 edition)** — SHOULD now, MUST before Wave 6 (Hardened Public Intelligence) ships. Retrieved list: LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses (partial list per retrieved sources; full ten not confirmed in what I retrieved, and I am not inventing the remaining two). `21_HCI_TOP_TIER_GAP_ANALYSIS.md:184-209` (P0-08 threat model) already independently arrives at "web prompt injection," "source poisoning," "tool-based exfiltration" — genuinely good instinct — but the security-control-baseline target list at P1-02 (line 249-251) never names this OWASP catalog even though it names OWASP ASVS and OWASP API Security Top 10 right next to it. This is a cheap, high-value addition: add one line to an already-planned document.

**OWASP ASVS 5.0.0** (released 30 May 2025 per retrieval) and **OWASP API Security Top 10 (2023 edition** — no 2025 refresh found in my search) — SHOULD now, becoming MUST once `api.aware-wave.com`/`portal.aware-wave.com` are customer-facing at commercial scale (V1's own Wave 3/Phase 6). Already correctly named in P1-02; no change needed beyond confirming they stay current.

**ISO/IEC 42001:2023** (AI management system standard, published Dec 2023 per retrieval) — SHOULD *adopt the structure informally now*, NOT_APPLICABLE *formal certification* until Enterprise wave. This is a genuine "buy don't build" opportunity: ISO 42001's AIMS structure (policy, risk assessment, impact assessment, lifecycle controls) is close to a ready-made scaffold for the risk-management-system and technical-documentation obligations the EU AI Act imposes on providers of high-risk systems (Article 16 territory, not directly researched here but adjacent). Already correctly hedged "where applicable" in V1; I recommend moving the *informal adoption* earlier without changing the *certification* timeline.

**NIST AI RMF 1.0 (AI 100-1, Jan 2023)** + **GenAI Profile (NIST-AI-600-1, released 26 July 2024 per retrieval)** — SHOULD. Voluntary, US-origin, no legal force, but free, mature, and vendor-neutral. My retrieval notes AI RMF 1.0 is under revision as part of a White House AI Action Plan with updates possibly forthcoming — I flag this as a live document to re-check, not a fixed target. V1's already-planned P2-02 "Model/prompt/retrieval governance" wave (`21:344-358`) would benefit from being explicitly organized around the RMF's four functions (Govern/Map/Measure/Manage) rather than an ad hoc list — same content, better external legibility for enterprise security questionnaires, essentially free to adopt as a naming convention.

**NIST CSF 2.0** (released 26 February 2024 per retrieval) — SHOULD, as an organizing vocabulary, not a new build. V1's existing AGENTS.md-level operational risk tiers and R0-R4 discipline already substantively cover much of Identify/Protect/Detect/Respond; CSF 2.0's new "Govern" function maps well onto the AO governance model already in place. Low priority; already named correctly in P1-02.

**NIST SP 800-218 (SSDF) v1.1** (Feb 2022 per retrieval; a v1.2 draft exists as of Dec 2025 per retrieval but is not yet final) — SHOULD, largely already covered in substance by P1-03's SBOM/SAST/DAST/signing plan; recommend explicit citation for traceability only.

**SOC 2 Type II** (AICPA 2017 Trust Services Criteria with Oct 2022 revised points of focus, confirmed as still the operative standard in 2026 per retrieval) — **NOT_APPLICABLE now, FUTURE at Enterprise wave.** V1 correctly does not mention SOC 2 anywhere, and I confirm that silence is *correct*, not a gap — pursuing a formal Type II audit as a solo operator with no enterprise customers yet would be badly premature and is exactly the kind of "300% complexity for 2% risk reduction" the mission brief warns against. The one thing worth doing now, cheaply, is designing the audit-event schema already specified at `11_SECURITY_PRIVACY_GOVERNANCE.md:137-159` (who/what/when/where/before/after/reason/request_id/session_id) so that it is *already* SOC2-shaped — it already is, reasonably well — rather than retrofitting immutable logging later. I list this as a KEEP disposition: confirming the current absence of a SOC 2 program is the right call, not a finding requiring a new artifact.

**ISO/IEC 27001:2022** — same logic as SOC 2: NOT_APPLICABLE (certification) now, already correctly named as a target-alignment reference (not a certification commitment) in P1-02, no change needed.

## Cross-border data and the single-server reality

`12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:55-65` specifies a `data_residency_policy` / `allowed_regions` / `ai_processing_regions` schema at the tenant-settings level. This is good forward design, but the verified infrastructure baseline for this session (single OVHcloud dedicated server, no second region, no managed multi-region DB) means this schema currently describes a capability that does not exist yet. That is not itself a defect — V1 elsewhere (`23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`) is admirably disciplined about not conflating architecture-document aspiration with deployed truth — but the specific combination of (a) "AI processing regions" as a first-class residency field and (b) an actual architecture where AI processing necessarily fans out to third-party LLM providers (OpenAI/Anthropic-class, per Invariant 4's anti-lock-in stance) whose own regional processing terms are not controlled by Aware Wave, means a **subprocessor and cross-border-transfer matrix** is a real near-term need, not a someday-multi-region need. `21_HCI_TOP_TIER_GAP_ANALYSIS.md:225` already lists `CROSS_BORDER_TRANSFER_MATRIX.md` and `SUBPROCESSOR_REGISTER_SCHEMA.md` as P1 artifacts — correctly identified, but currently unwritten, and I'd argue this one specifically should not wait for the full P1 "Enterprise commercial readiness" wave, because it's needed the moment any EU-linked Person's data touches a non-EU LLM API call, which could be true starting in Phase 4/5 dogfooding, long before Enterprise readiness.

## What I am deliberately not flagging

Per the anti-overengineering constraint, I am not recommending: Day-1 SOC 2, Day-1 ISO 27001/42001 certification, Day-1 AI Act conformity assessment, a Day-1 Fundamental Rights Impact Assessment program (Article 27 does not apply to a generic SaaS vendor per my retrieval), or a Day-1 multi-region data residency build-out. All of these are correctly deferred by V1's own P1/Enterprise-wave sequencing, and my review affirms that sequencing rather than trying to pull everything forward. The two things I am pulling forward are the ones that are (a) nearly free to do now (a scoping ADR, a subprocessor matrix, one line added to an existing document) and (b) expensive specifically *because* of delay (retrofitting logging/rights workflows after a real EU customer or a real profiled EU person exists). That asymmetry — not "more compliance is always better" — is the basis for every MUST classification above.


---

## Change Items (8)

### REG-01 — EU AI Act high-risk profiling classification: no scoping decision or documentation exists

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 11_SECURITY_PRIVACY_GOVERNANCE.md and the entire 24-file blueprint never mention 'AI Act', 'high-risk AI', 'Annex III', or 'conformity assessment'. 11_SECURITY_PRIVACY_GOVERNANCE.md:99-116 ('Employment / HR boundary') explicitly contemplates HCI supporting Hire/Fire/Promotion/Compensation decisions with human review. |
| **Problem** | HCI-30's core function (04_HCI30_PRODUCT_SPEC.md:68-85 analysis dimensions incl. 'Reliability', 'Predictability'; the entire 06_HCI30_PUBLIC_INTELLIGENCE.md pipeline) matches the EU AI Act's statutory definition of 'profiling' verbatim ('analyse or predict aspects concerning ... reliability, behaviour' of a natural person). Under Article 6(3), profiling triggers automatic Annex III high-risk classification with no exemption escape hatch. The Employment/HR boundary section independently triggers Annex III point 4 (employment/worker-management). No ADR or policy scopes which markets/use-cases the product will and won't support in light of this. |
| **Evidence** | artificialintelligenceact.eu, 'Article 6: Classification Rules for High-Risk AI Systems' (fetched 2026-08-29): '...shall always be considered to be high-risk where the AI system performs profiling of natural persons ... regardless of the paragraph 3 exceptions.' Profiling defined as processing to 'analyse or predict aspects concerning ... reliability, behaviour...'. Cross-referenced against 04_HCI30_PRODUCT_SPEC.md:68-85 and 11_SECURITY_PRIVACY_GOVERNANCE.md:99-116. |
| **Risk if unchanged** | If an EU enterprise customer deploys HCI-30 for candidate screening or employment decisions before this is scoped, Aware Wave becomes a 'provider' of an unclassified high-risk AI system with no risk-management system, no technical documentation, no 6-month log retention design (Article 26(6)) — full retroactive remediation under regulatory scrutiny, not a planned build. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Write a one-page ADR now (Wave 0, alongside the other 8 ADRs already planned in 17_REPOSITORY_LAYOUT_AND_PATHS.md:216-229) that explicitly decides and documents: (a) whether HCI-30 will be marketed/sold for EU-linked employment/HR use cases, (b) whether Aware Wave will restrict such uses contractually for EU tenants until a conformity program exists, (c) that this decision is revisited before Wave 9 (Enterprise readiness). Do not build the full conformity-assessment program now. |
| **Why** | The classification decision is nearly free today (a documented scoping choice); retrofitting logging/technical-documentation/human-oversight-design after an EU enterprise customer has already deployed HCI-30 for HR use is a multi-month, expensive program. Regulation source: Regulation (EU) 2024/1689 (EU AI Act), Article 6(3) and Annex III point 4; Chapter III obligations apply from 2 December 2027 (Annex III) per artificialintelligenceact.eu (fetched 2026-08-29), reflecting a July 2026 'Digital Omnibus' postponement from an earlier August 2026 date. Note: a second retrieved source (undated HR-compliance blog) cites 'from 2 August 2026' for employment specifically, likely reflecting the pre-amendment deadline; I could not fully reconcile the two sources and flag this discrepancy rather than resolve it by assumption. |
| **Blast radius** | Product scope / go-to-market decision; does not require code changes now, only a documented business boundary. |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | A scoping ADR written now costs an afternoon and can be revised. Discovering the classification via an EU regulator inquiry after enterprise sales have already happened costs months of remediation and potential market exclusion in the EU. |
| **Confidence** | High |
| **Requires human decision** | YES |

### REG-02 — No controller/processor determination for the profiled Person (the actual GDPR data subject)

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 11_SECURITY_PRIVACY_GOVERNANCE.md:117-125 ('Customer data ownership') frames Aware Wave purely as processor of 'customer data'. 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:36-46 correctly distinguishes User != Person but does not extend that distinction into a controller/processor analysis. |
| **Problem** | GDPR's actual data subject for HCI-30's sensitive processing is the researched Person, not the paying tenant. Aware Wave's own AI systems (identity resolution, claim extraction, synthesis in 06_HCI30_PUBLIC_INTELLIGENCE.md) exercise independent processing decisions about that third party, which raises a real joint-controller or independent-controller question distinct from the tenant's own evidence/notes. No artifact in the blueprint asks this question. |
| **Evidence** | GDPR Regulation (EU) 2016/679, Art. 4(7)-(8) controller/processor definitions and Art. 26 joint controllers (general knowledge of the regulation's structure, not from a specific 2026 search result); cross-referenced against 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:36-46 and 11_SECURITY_PRIVACY_GOVERNANCE.md:117-125, which never raise this distinction. |
| **Risk if unchanged** | Ambiguous liability allocation if a profiled Person brings a GDPR complaint or defamation claim; Aware Wave may be treated as joint controller by a regulator by default in the absence of a documented DPA position. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Produce a short Data Protection Roles Memo (fits naturally into the already-planned 21_HCI_TOP_TIER_GAP_ANALYSIS.md P1-01 privacy path, e.g. alongside PURPOSE_AND_LAWFUL_BASIS_MATRIX.md) that determines, per processing activity (customer evidence entry vs. AI-driven public-intelligence synthesis), whether Aware Wave is processor, controller, or joint controller, and reflect the answer in the customer DPA template. |
| **Why** | This is a foundational legal-structural question that determines who bears GDPR liability (Art. 82) for a mis-profiled or defamed Person, and it changes what customer contracts must say. It cannot be resolved by engineering alone. |
| **Blast radius** | Legal/contractual (DPA template, ToS); does not require domain-model changes given 07's User != Person split already provides the technical foundation. |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### REG-03 — Data-subject-rights workflow (access/rectification/erasure/objection) is scoped only to the tenant customer, never to the profiled Person

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:130-161 (External sharing, Export, Account termination) and 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-230 (P1-01: DSAR_RUNBOOK.md, DELETION_RUNBOOK.md, CONSENT_AND_NOTICE_MODEL.md) all describe rights/workflows for the account-holding tenant. |
| **Problem** | The Person entity being researched (04_HCI30_PRODUCT_SPEC.md use case: vetting a business partner) is a GDPR data subject with rights under Art. 15/16/17/21, typically has no account, no login, and never consented. 06_HCI30_PUBLIC_INTELLIGENCE.md:102-138 explicitly stores 'Disputes', 'Criticism', 'Allegation' claims about this named real person -- exactly the reputationally consequential content GDPR's accuracy principle (Art. 5(1)(d)) and rectification right (Art. 16) apply to, with adjacent defamation exposure if an uncorroborated allegation is acted on. No runbook, endpoint, or process exists for this data subject to exercise any right. |
| **Evidence** | gdpr-info.eu Art. 17 (retrieved 2026-08-29): erasure 'not absolute', may be refused for e.g. 'establishment of legal claims', but requires a defensible process regardless. Cross-referenced against 06_HCI30_PUBLIC_INTELLIGENCE.md:102-138, 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:36-46, 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:130-161, 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-230. |
| **Risk if unchanged** | A profiled Person who discovers they are the subject of an HCI-30 dossier and requests access/correction/deletion has no defined process; ad hoc handling under regulatory or legal pressure is worse than a pre-built runbook. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Extend the already-planned P1-01 privacy artifacts (DSAR_RUNBOOK.md, DELETION_RUNBOOK.md) to explicitly cover a second workflow: third-party subject-access/rectification/erasure/objection requests from a researched Person, including how such a request is routed to the tenant(s) holding evidence about them, how a rectification claim is recorded without silently deleting the original observation (07's fact/observation/interpretation separation already supports this -- use it), and what the refusal grounds (legal-claims establishment) look like in HCI's own terms. |
| **Why** | This is the single largest privacy-operations gap because it affects a person who has no visibility into the product at all and cannot be discovered by testing the customer-facing UI -- it requires deliberately designing for an absent, non-paying stakeholder. |
| **Blast radius** | Adds one new workflow to an already-planned P1-01 artifact set; does not touch domain model (07's Fact/Observation/Interpretation/Hypothesis separation already provides the mechanism for recording a correction without destroying evidence lineage). |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### REG-04 — GDPR Article 22 / DPIA trigger not named despite the constitution already substantively satisfying it

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 01_SYSTEM_CONSTITUTION.md:39-56 (Invariant 2, 'AI is non-authoritative') and repeated 'human final decision' language throughout; 21_HCI_TOP_TIER_GAP_ANALYSIS.md:224 lists a DPIA_TEMPLATE.md placeholder under P1 with no content and no trigger criteria tied to profiling specifically. |
| **Problem** | GDPR Art. 22 prohibits decisions based solely on automated processing that significantly affect a person, with a right to human intervention/contestation even under an exception. HCI-30's 'AI is non-authoritative' design already substantively pre-empts Article 22 applying to the tenant's own decision -- a genuine strength worth naming explicitly rather than leaving implicit. What's missing: (a) a DPIA is required whenever Art.-22-scope processing is contemplated, even if never actually 'solely automated', and no DPIA trigger or template currently exists with content; (b) the lawful basis and notice for the profiled Person specifically (distinct from the tenant) is undefined. |
| **Evidence** | secureprivacy.ai, 'GDPR Article 22 and Automated Decision-Making' (retrieved 2026-08-29): qualified prohibition on decisions 'based solely on automated processing... that produces legal effects... or similarly significantly affects' the data subject; 'Any Article 22-scope processing requires a DPIA'. Cross-referenced against 01_SYSTEM_CONSTITUTION.md:39-56 and 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-230. |
| **Risk if unchanged** | Cannot answer an enterprise procurement or regulator's DPIA request; V1's own P1-01 already anticipated the need but left it as an unfilled path. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Give DPIA_TEMPLATE.md real content now (it is currently an empty path placeholder), with an explicit trigger rule: any HCI-30 workflow that could influence a collaboration/employment/financial decision about a real person requires a completed DPIA before that workflow processes an EU-linked Person, referencing the existing human-review invariant as the primary mitigation already in place. |
| **Why** | The hard legal requirement (DPIA) is independent of whether the human-in-the-loop design actually avoids Art. 22 liability -- regulators and auditors will ask for the DPIA regardless. This is cheap to template now against Wave 4/5 (Evidence/Claim/Assessment core, Intelligence math v1) before those subsystems freeze their design. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### REG-05 — OWASP Top 10 for LLM Applications not cited despite an untrusted-web-content-to-AI pipeline that is its textbook use case

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21_HCI_TOP_TIER_GAP_ANALYSIS.md:249-251 (P1-02) names ISO/IEC 27001:2022, NIST CSF 2.0, NIST SSDF, OWASP ASVS 5.0, OWASP API Security Top 10, ISO/IEC 42001:2023, NIST AI RMF/GenAI Profile as target-alignment standards, but never names the OWASP Top 10 for LLM Applications. Separately, P0-08 (lines 184-209) independently lists threats including 'web prompt injection' and 'source poisoning' without citing the standard that catalogs these. |
| **Problem** | 06_HCI30_PUBLIC_INTELLIGENCE.md's entire pipeline (Multi-source Retrieval -> Claim Extraction -> Synthesis) feeds untrusted web content into AI processing -- the exact scenario the OWASP LLM Top 10 exists to catalog mitigations for (prompt injection, sensitive info disclosure, data/model poisoning, excessive agency, system prompt leakage). P0-08 shows the right instinct but reinvents a subset of a standard catalog ad hoc rather than citing and mapping against it. |
| **Evidence** | genai.owasp.org, 'OWASP Top 10 for LLM Applications 2025' (retrieved 2026-08-29): 2025 edition categories retrieved include LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses (full ten-item list not fully confirmed in retrieved sources; not asserting items 9-10 without a source). Cross-referenced against 21_HCI_TOP_TIER_GAP_ANALYSIS.md:184-209, 249-251. |
| **Risk if unchanged** | P0-08's threat model may have blind spots (e.g. no explicit system-prompt-leakage or supply-chain-of-models coverage) that a standard checklist would have caught for free. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add 'OWASP Top 10 for LLM Applications (2025)' to the P1-02 target-alignment list (one line, same document already being written) and re-map the P0-08 threat-model items (SSRF, prompt injection, source poisoning, tool-based exfiltration) against the standard's numbered categories so control coverage is auditable against a named external standard rather than only an internally-authored list. |
| **Why** | Near-zero cost (one line in an already-planned document) with real payoff: gives enterprise security reviewers and future auditors a citable mapping instead of an ad hoc list, and surfaces any category P0-08 missed (e.g. LLM03 Supply Chain, LLM07 System Prompt Leakage are not currently named anywhere in the threat-model list). |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### REG-06 — ISO/IEC 42001 (AI management system) correctly deferred for certification but not yet adopted informally as governance scaffolding

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 21_HCI_TOP_TIER_GAP_ANALYSIS.md:249-251 names ISO/IEC 42001:2023 'where applicable' inside the P1 (Enterprise commercial readiness) wave, alongside P2-02 (Model/prompt/retrieval governance: MODEL_REGISTRY.md, PROMPT_REGISTRY.md, DRIFT_MONITORING.md, MODEL_CHANGE_GATE.md). |
| **Problem** | Full ISO 42001 certification is correctly not needed yet -- but the underlying AI-management-system structure (risk assessment, impact assessment, lifecycle controls for AI systems) is exactly the shape of governance the already-planned P2-02 wave needs, and building P2-02 without reference to the standard risks reinventing a worse, less externally-legible version of the same thing. |
| **Evidence** | iso.org / KPMG Switzerland summary (retrieved 2026-08-29): ISO/IEC 42001:2023 published Dec 2023, defines requirements for establishing and continually improving an AI management system covering 'risk assessment to effective treatment of these risks' for any organization that 'develops, provides, or uses AI'. Cross-referenced against 21_HCI_TOP_TIER_GAP_ANALYSIS.md:249-251, 344-358 (P2-02). |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | When P2-02's governance documents are actually written, structure them loosely around ISO 42001's AIMS categories (policy, objectives, risk/impact assessment, lifecycle controls) even without pursuing certification, so a future certification effort is a documentation exercise rather than a redesign. |
| **Why** | This is a 'buy the mental model, don't buy the certificate' recommendation -- zero cost difference in the work already planned, meaningful difference in whether that work is reusable later. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### REG-07 — SOC 2 Type II and formal ISO/IEC 27001 certification correctly absent from V1 at current stage -- confirming, not flagging

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | V1 does not mention SOC 2 anywhere in any of the 24 files. ISO/IEC 27001:2022 appears only as a target-alignment reference inside P1-02, not a certification commitment. |
| **Problem** | None -- this is a confirmation, not a defect. Given the verified infrastructure baseline (single OVH dedicated server, solo operator, no enterprise customers, Phase 5 dogfooding stage per 14_ROADMAP_AND_DEFINITION_OF_DONE.md:68-73), pursuing a formal SOC 2 Type II audit (which tests controls over a 6-12 month observation period per retrieval) or ISO 27001 certification now would be the '300% complexity for 2% risk reduction' pattern the review brief explicitly warns against. |
| **Evidence** | surecloud.com / knowlee.ai SOC 2 summaries (retrieved 2026-08-29): operative standard remains the AICPA 2017 Trust Services Criteria with Oct 2022 revised points of focus; a Type II report 'tests whether controls operated effectively over a period of 6-12 months' -- inherently unsuited to a pre-enterprise, pre-customer stage. Cross-referenced against 14_ROADMAP_AND_DEFINITION_OF_DONE.md:68-96 (Phase 5-7 sequencing) and the absence of SOC 2 anywhere in 11_SECURITY_PRIVACY_GOVERNANCE.md or 21_HCI_TOP_TIER_GAP_ANALYSIS.md. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Keep SOC 2 and formal ISO 27001 certification out of scope until Wave 9 / Phase 7 (Enterprise). The one preparatory action worth taking now, essentially free: keep the audit-event schema already specified at 11_SECURITY_PRIVACY_GOVERNANCE.md:137-159 (who/what/when/where/before/after/reason/request_id/session_id) as the implementation target so logging does not need retrofitting when a real audit eventually happens. |
| **Why** | V1's own instinct to omit this was correct; the review's job here is to confirm that instinct with external evidence so a future reader doesn't mistake the silence for an oversight. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### REG-08 — Cross-border transfer / subprocessor matrix needed sooner than the P1 'Enterprise readiness' wave implies

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:55-65 specifies a data_residency_policy/ai_processing_regions tenant-settings schema. 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-227 (P1-01) lists CROSS_BORDER_TRANSFER_MATRIX.md and SUBPROCESSOR_REGISTER_SCHEMA.md as artifacts inside the Enterprise-readiness wave. |
| **Problem** | The verified current infrastructure is a single OVH dedicated server with no second region -- the multi-region schema in 12 currently describes an undeliverable capability, which is not itself wrong (V1 is disciplined about not conflating aspiration with deployed truth per 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md), but the more urgent and currently-real issue is different: AI processing necessarily fans out to third-party LLM providers (01_SYSTEM_CONSTITUTION.md Invariant 4's anti-single-vendor-lock-in stance implies multiple providers, likely including non-EU-based ones) the moment any EU-linked Person's data is processed -- which could happen as early as Phase 4/5 dogfooding, long before the Enterprise wave where the transfer matrix is currently scheduled. |
| **Evidence** | General GDPR cross-border transfer requirement (Chapter V, Art. 44-49) is well-established law, not from a specific 2026 search result in this session. Cross-referenced against 01_SYSTEM_CONSTITUTION.md:61-68 (Invariant 4), 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:55-65, 21_HCI_TOP_TIER_GAP_ANALYSIS.md:216-227, and the verified single-server infrastructure baseline stated in this review's mission brief. |
| **Risk if unchanged** | Undocumented cross-border transfer of an EU Person's profiled data via a US-based LLM subprocessor, discoverable only in hindsight during an incident or DSAR. |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Pull SUBPROCESSOR_REGISTER_SCHEMA.md and a minimal CROSS_BORDER_TRANSFER_MATRIX.md forward from the P1 Enterprise wave to whenever the first LLM API call touches an EU-linked Person's data (likely Phase 4/5), even in skeleton form (list current subprocessors: which LLM providers, which search providers, their processing regions). Leave the full multi-region tenant-settings implementation in 12 at its current Enterprise-wave timing -- only the documentation of the already-real subprocessor exposure needs to move earlier. |
| **Why** | The underlying legal exposure (personal data of an EU person leaving the EU via an LLM API call) is not gated by the company's own roadmap phases; it starts the moment the feature is used, not when the company decides it's 'Enterprise-ready'. |
| **Blast radius** | — |
| **Migration impact** | — |
| **Rollback** | — |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

---
## Open Assumptions

- Aware Wave's actual target customer base includes EU-based tenants and/or EU-linked profiled Persons; if the company deliberately and verifiably restricts HCI-30 to non-EU markets/subjects only, several MUST items downgrade to FUTURE. This scoping decision was not found documented anywhere in the 24 blueprint files, so I assumed EU exposure is plausible rather than assuming it away.
- The EU AI Act compliance-deadline conflict I flagged (Dec 2027 per artificialintelligenceact.eu vs. Aug 2026 per a second, undated source) was not resolved in this session; I treated the more recently-amendment-aware source as more likely authoritative but did not verify against the official consolidated legal text.
- I did not verify whether Aware Wave's actual OVH server's physical jurisdiction (France, per the .eu TLD in the hostname) has any bearing beyond what's stated in 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md -- I treated the hostname as inconclusive for data-residency purposes, consistent with V1's own Rule 4 in that same document.
- OWASP Top 10 for LLM Applications 2025's full ten-item list was only partially confirmed (8 of 10 items) in retrieved search snippets; I did not fabricate the remaining two and flagged this explicitly rather than guessing.

---
## Open Risks

- No artifact anywhere in the 24-file blueprint addresses the GDPR rights of the profiled Person as distinct from the paying tenant -- this is the single largest gap found and affects a stakeholder who cannot easily self-advocate (no login, no visibility into the product).
- The EU AI Act classification question is a live legal-scope decision, not an engineering task; if left undecided, the company risks discovering its regulatory status only after an enterprise deal is already signed.
- Controller/processor role for AI-driven public-intelligence synthesis about third parties is undetermined and has direct liability consequences that current customer contracts (not reviewed in this pass) may not reflect.
- Two retrieved sources disagreed on a key EU AI Act employment-sector compliance date; this should be re-verified against the official consolidated legal text before any date-sensitive commitment is made to a customer or regulator.