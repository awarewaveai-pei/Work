# 00 Executive Review — HCI-30 × AI LEGO V1 Independent Architecture Re-Research

> Naming note: the operator renamed the architecture version from "V5" to "V1" at the start of this mission. Every reference to "V1" throughout this package means the current architecture at `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\`, and every "V5" in the original mission spec has been read as "V1" per that instruction.

## What this package is

Nine independent reviewers (Domain Architecture, Database, Security/Privacy, SRE/DevOps, AI/Intelligence, Scientific/Behavioral Methodology, Enterprise/Commercial, Adversarial/Red Team, Regulatory/Standards), each working with zero visibility into the others' output, each required to read all 24 blueprint documents in full and cite `file:line` evidence for every claim, independently analyzed the HCI-30 × AI LEGO V1 blueprint. A tenth pass cross-validated their findings against each other (`14_CONVERGENCE_MATRIX.md`), and an eleventh pass specifically tested whether the Red Team's 16 attack scenarios are actually blocked by anything the other reviewers recommended keeping (`12_RED_TEAM_FAILURE_ANALYSIS.md`, cross-check section). 104 findings resulted: 7 KEEP, 42 CHANGE, 2 REMOVE, 45 ADD (missing), 8 explicitly DEFERRED. 24 require an explicit operator decision (`22_OPEN_HUMAN_DECISIONS.md`).

**One finding (DOM-12) was added after the 9-reviewer pass closed**, raised by the operator on re-reading the package and verified against the source blueprint before being added — see `05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-12 and `22_OPEN_HUMAN_DECISIONS.md` HD-00. It matters enough to call out explicitly here: HCI's entire product framing and its Evidence schema assume the assessed Subject is always an individual Person — `Organization` is declared as a core entity but has no first-class Evidence/Assessment/TrustDomain support (`person_id` is the only subject key anywhere in doc 07), and nothing pairs the Requester's own party-type (individual / corporate team / group) with the target relationship-goal to shape which Trust Domains apply. None of the 9 independent reviewers caught this — a useful, honest data point on this review process's own limits: independence *between* reviewers does not protect against a blind spot baked into the source document's own framing, which every reviewer read before forming an opinion.

**This is a research and design package, not an implementation.** Per the mission's execution limits: no production code was modified, no database was touched, nothing was deployed. `D:\Work\agency-os\systems\` and `shared\` (the eventual HCI/AI LEGO implementation trees) were confirmed by multiple reviewers, independently, to not exist yet — every finding below is cheap to act on now and would be expensive after real code and real customer data exist.

## This package is a critique layered on top of V1 — it is NOT a standalone replacement for it

**This is the single most important thing to understand before using this package to start building.** `HCI_AI_LEGO_Blueprint_v1\` (`D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\`) contains the actual base specification — entity field lists, the full intelligence-methods catalog, the System Constitution's invariants, the API/deployment contract, the UI/explainability spec. This package (`HCI30_RESEARCH_REVIEW\`) does **not** reproduce that content. Every reviewer read all 24 V1 documents in full, but what they wrote down was "here's what's right / wrong / missing / should change," not a copy of V1's actual specification text. A KEEP finding (e.g. `01_V1_KEEP.md` DOM-11) means "this part of V1 is correct and should not be touched" — the content it's referring to still lives *only* in V1; it was deliberately not duplicated here, for the same reason `05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-02 flags duplicating the same concept under the same name in two places as a structural failure mode. Copying V1's content into a second document would have been that exact mistake, made by this package about itself.

**Practically, when you start building: read both directories, not just this one.**

1. Read the relevant V1 chapter(s) for the base specification (entities, fields, invariants, method definitions, API contract — whatever you're implementing).
2. Check `20_V1_TO_V2_CHANGESET.md` for what changes on top of that chapter (edits, new entities, new gates).
3. If the changeset item is flagged `HUMAN`, resolve it via `22_OPEN_HUMAN_DECISIONS.md` before implementing — the recommendation there is a proposal, not a ratified decision.
4. Follow `21_V2_IMPLEMENTATION_ORDER.md` for sequencing.

Reading `HCI30_RESEARCH_REVIEW\` alone would tell you everything that's wrong with V1 and nothing about what V1 actually specifies — you'd know *what* to change without knowing *what you're changing it from*. Reading `HCI_AI_LEGO_Blueprint_v1\` alone would give you the base spec without the 104 findings (24 of them requiring an explicit decision) this review surfaced. You need both, together, for every chapter you touch.

---

## TL;DR

**V1 got the hard calls right.** The peer-product boundary between HCI-30 and AI LEGO, the modular-monolith-first posture, PostgreSQL as the durable data-layer choice, evidence-before-inference, and the refusal to build a universal trust score all survive independent, adversarial re-derivation. Reviewer A's own words: "the central thesis... is correct, not merely asserted." This is not a rubber-stamp finding — every reviewer was explicitly instructed that `AGREE != FACT` and told to re-derive rather than accept V1's framing, and the domain boundary held up against six independently-applied ownership criteria.

**What V1 does not yet have is an enforcement layer to match its principles.** Reviewer H's closing line, independently corroborated by the cross-check against Reviewers B/C/D's KEEP recommendations (zero of 16 red-team attacks were found to be blocked by anything currently in V1): *"V1's principles are consistently ahead of V1's enforcement."* The pattern recurs across a small number of root causes, not 100 unrelated bugs: (1) a researched third party has no rights channel at all — found independently by five different reviewers via five different methods; (2) Row-Level Security is "where appropriate" rather than mandatory, and the only automated test checks for a column's existence, not that isolation actually works; (3) three incompatible "Tenant" definitions coexist in the repo today, one of them already shipped in production code; (4) identity-resolution has no correction path once a wrong person-match is discovered; (5) the single-box infrastructure's dominant disaster-recovery risk (total hardware loss) is never named in the DR scenario list and has never been rehearsed.

**None of the fixes require abandoning V1's architecture or building infrastructure this team doesn't need.** No reviewer recommends Kubernetes, event-sourcing, a graph database, a message broker, or multi-region infrastructure for V1 — several reviewers explicitly confirm V1's restraint on these fronts was correct (`14_CONVERGENCE_MATRIX.md` CM-15) and should stay that way. The fixes are almost entirely: missing domain entities, missing CI-blocking tests for controls V1 already states in prose, and a handful of explicit ADRs to resolve genuine ambiguities before they calcify into shipped code.

---

## The one question the mission brief asks last, answered first

*"If today this HCI system were handed to a completely different set of engineers, AI, cloud providers, and models, would they still be able to understand, maintain, verify, upgrade, and recover it in 2036, 2046, 2056 without a rewrite?"*

**Not yet, on the evidence gathered — but the gap is closable without a rewrite, and the fix list is short and largely cheap right now.** The specific reasons the answer isn't yet YES: (a) the security/privacy enforcement layer is currently prose, and the red-team cross-check found literally nothing in the other reviewers' KEEP recommendations that would stop any of 16 concrete attacks; (b) a wrong person-match today has no correction mechanism, meaning an error made in year 1 has no designed path to being fixed in year 20; (c) the bitemporal history V1's own explainability promises depend on doesn't exist in the schema yet, and retrofitting it after years of system-time-only data would be a genuinely hard migration — exactly the kind of "rewrite" this question is testing for. Every one of these is addressed in `19_PROPOSED_V2_ARCHITECTURE.md` with a path that does **not** touch the parts of V1 that already pass this test (the domain boundary, the PostgreSQL core, the modular-monolith posture, the vendor-neutral principles). Fix the enforcement gap now, while there is no production data, and the honest answer becomes YES.

---

## Independent-vs-shared verdict (the mission's central architectural question)

V1 states HCI-30 and AI LEGO Cognitive Engineering OS are "independent peer products with optional integration." A dedicated synthesis pass re-derived this from scratch against six required criteria (domain ownership, failure independence, commercial independence, data ownership, deployment independence, evolution independence), using Reviewers A/E/G's independent findings as evidence, not as the answer.

**Verdict: `PARTIAL_SHARED_PLATFORM`.** 5 of 6 criteria cleanly support independence — domain ownership, failure independence, commercial independence (at the SKU layer), deployment independence, and evolution independence all hold. **Data ownership does not cleanly support pure independence**: AI LEGO already has ACCEPTED, ADR-governed `Evidence`/`Claim`/epistemic-status schemas, and HCI's blueprint independently re-derives the same concepts under the same names with different shapes — a live naming-collision risk at the integration boundary, not a hypothetical one. The resolution is **not** merging the products and **not** building a shared "God Platform" (explicitly checked against and rejected) — it is extracting a small, versioned Foundation-layer kernel (thin reference types, epistemic/provenance vocabulary, risk-tier ladder, tenant/entitlement substrate) that both products vendor a specific version of, preserving "HCI works without AI LEGO" by construction. Full reasoning: `19_PROPOSED_V2_ARCHITECTURE.md` §1, decision card `22_OPEN_HUMAN_DECISIONS.md` HD-09.

---

## Headline findings (the ones that matter most if you read nothing else)

1. **Researched-Person rights gap** — the third party HCI profiles has no way to learn a dossier exists, dispute it, or correct it, anywhere in 24 documents. Found independently by 4 reviewers via domain-modeling, security-sequencing, red-team, and live-GDPR-research methods respectively. `15_RISK_REGISTER.md` Critical, `22_OPEN_HUMAN_DECISIONS.md` HD-03.
2. **RLS enforcement gap** — "where appropriate" plus a test that only checks a column exists, on a single shared self-hosted Postgres instance holding every tenant's RESTRICTED reputational data. `15_RISK_REGISTER.md` Critical, HD-05.
3. **Triple Tenant definition, one already shipped** — HCI's blueprint, AI LEGO's ACCEPTED ADR-003, and the live `portal.aware-wave.com` `organizations` table (commit `83277d80`, deployed the same day this review ran) are three different things with no reconciling decision. Cheapest fix in this whole package today (zero real customers); expensive after any of the three gets real usage. HD-01.
4. **Identity-resolution has no correction path** — a wrong person-match (two "John Smiths" merged, or one person split) has no lineage, no reversal, no way to retroactively flag downstream Assessments. Independently named "the highest-severity unresolved risk in the entire HCI-30 product concept" by the AI/Intelligence reviewer. HD-04.
5. **Single-server disaster recovery is unrehearsed and unnamed as a scenario** — verified against the actual infrastructure this session worked on directly (`ks-aw-01`, one OVH dedicated box running every AwareWave service). HD in `15_RISK_REGISTER.md`.
6. **Zero of the Red Team's 16 attacks are blocked by anything currently in V1** — the cross-check pass specifically tested this rather than assuming it, and the Security/Privacy reviewer's own KEEP list came back empty. `12_RED_TEAM_FAILURE_ANALYSIS.md`.
7. **HCI-30's core function matches EU AI Act Article 6(3) high-risk profiling and plausibly FCRA consumer-reporting activity**, and neither regulatory regime is named anywhere in 24 documents. Found independently by security review and live regulatory research. HD-20.
8. **The Subject of assessment is architecturally hard-coded to individual Person, despite `Organization` being a declared core entity** — no reviewer caught this because V1's own framing primed every independent reader toward the same assumption. Operator-raised, verified post-package. HD-00, `05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-12.

---

## Where the analysis has known limits

- No implementation code exists yet, so this is a specification review, not a code audit. Reviewer H's own open_risks note explicitly: a second adversarial pass will be needed once Wave 1-4 code actually lands, for code-level risks (SQL injection, auth-bypass bugs) this pass could not evaluate.
- Reviewer I's regulatory research is grounded in live 2026-08-29 web search with cited sources, versions, and dates — but explicitly flags one contradiction (a disputed EU AI Act employment-sector compliance date between two sources) that needs re-verification against the official legal text before any date-sensitive commitment is made.
- The Convergence synthesis pass explicitly did not re-verify every underlying claim itself (e.g. it did not personally re-open AI LEGO's spec files to confirm ADR-acceptance status — see `16_ASSUMPTION_REGISTER.md` ASM rows marked UNVERIFIED) — it re-derived reasoning from what reviewers reported, which is a different and weaker guarantee than independent primary-source verification. Treat UNVERIFIED assumption-register rows accordingly.

---

## How to navigate this package

| If you want... | Read |
|---|---|
| The full disposition of every finding | `01_V1_KEEP.md` → `04_V1_MISSING.md` |
| One reviewer's full reasoning | `05` through `12` (Domain, DB, Security, DevOps, AI, Method-Science, Commercial, Red Team) + `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md` |
| The three-option comparisons the brief required | `13_ARCHITECTURE_OPTIONS_MATRIX.md` |
| Which findings converged across reviewers, and how skeptically that convergence was checked | `14_CONVERGENCE_MATRIX.md` |
| Risks and unverified claims in one place | `15_RISK_REGISTER.md`, `16_ASSUMPTION_REGISTER.md` |
| What debt V1 is about to create vs. correctly deferring | `17_TECH_DEBT_PREVENTION.md` |
| Vendor-replaceability over a 30-year horizon | `18_30_YEAR_REPLACEMENT_ANALYSIS.md` |
| The recommended target architecture | `19_PROPOSED_V2_ARCHITECTURE.md` |
| The concrete diff to apply | `20_V1_TO_V2_CHANGESET.md`, `21_V2_IMPLEMENTATION_ORDER.md` |
| The decisions only the operator can make | `22_OPEN_HUMAN_DECISIONS.md` |

**No V2 change should be implemented from this package without explicit human approval** — this is a review, not an authorization. `22_OPEN_HUMAN_DECISIONS.md` is the starting point for that conversation.
