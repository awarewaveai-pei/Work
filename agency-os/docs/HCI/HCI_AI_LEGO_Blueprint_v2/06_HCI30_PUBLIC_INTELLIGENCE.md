# 06 — HCI-30 Public Intelligence & Evidence Acquisition

## Purpose

Add lawful public-information research about a Subject without turning HCI into a rumor engine or secret surveillance platform.

## System name

Recommended module:

```text
Public Intelligence & Evidence Acquisition Layer
```

## Pipeline

```text
Subject (Person; pending Organization, see 02)
↓
Identity Resolution
↓
Content Isolation & Authenticity Check      -- new in V2, see below
↓
Search Planning
↓
Multi-source Retrieval (network-isolated)   -- hardened in V2, see below
↓
Source Quality Assessment
↓
Deduplication
↓
Claim Extraction
↓
Entity/Event Resolution
↓
Cross-source Corroboration (source-independence-aware)  -- hardened in V2, see below
↓
Contradiction Detection
↓
Timeline
↓
Achievement / Contribution / Concern Analysis
↓
Synthesis
↓
Citation Graph
```

## Identity resolution is mandatory

Before admitting search results, maintain:

```text
name
alternative_names
native_name
romanized_names
known_aliases
country
city
current_company
previous_companies
job_title
industry
education
official_website
known_social_accounts
```

Identity states:

```text
MATCH_CONFIRMED
MATCH_HIGH_CONFIDENCE
MATCH_POSSIBLE
MATCH_AMBIGUOUS
MATCH_REJECTED
```

Ambiguous identity must not enter formal evidence.

> **RESOLVED (`HD-04=A`, ADR-0015)** — `MATCH_CONFIRMED` requires deterministic identifier evidence or explicit human confirmation with evidence. An LLM confidence score alone is prohibited. The local synthetic schema/test skeleton enforces this narrow admission gate; the production identity pipeline and lower-confidence scoring remain open.

## Content isolation & authenticity check *(new section in V2)*

Two hardening requirements added between Identity Resolution and Search Planning:

1. **Untrusted-content isolation**: fetched web content must be treated as untrusted data by default at the point it enters claim extraction — wrapped, never concatenated directly into a prompt that also carries system instructions, with output-schema validation and a secondary pass flagging instruction-like phrases for human review. An adversary who anticipates being researched can plant instruction-like text on a page they control; nothing in V1 defended against this. AI LEGO's own drafted threat model (`SECURITY_THREAT_MODEL.md` TB-1/T2/E4) already analyzes this exact threat class — build on it rather than re-deriving from zero. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-04, `HCI30_RESEARCH_REVIEW/09_AI_INTELLIGENCE_REVIEW.md` C7.
2. **Minimum-viable authenticity check**: a baseline check (hash/EXIF metadata check, reverse-image/reverse-text search corroboration requirement for high-stakes claims) runs before evidence admission. Full synthetic-media-detection tooling stays a later-phase differentiator (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P2-06) — but a baseline "does this document/image show signs of fabrication" check is cheap and must not wait for that tier, since the Evidence/Claim/Assessment core ships far earlier than P2 in the roadmap. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-06.

> ✅ **RESOLVED (`HD-19`, 2026-09-02) — ADR-0029**: build a dedicated, network-isolated fetch runner for the Wave 6 fetch step; Trigger.dev orchestrates (enqueue/status/retry) but never executes the outbound fetch itself. No route to the docker bridge, egress-only, DNS-rebind protection, SSRF payload corpus — all open implementation gates, blocking before Wave 6's fetch/scan pipeline may be built. See `governance/ADR-0029-isolated-fetch-worker-not-trigger-dev.md`.

## Balanced search planner

Search families should include both favorable and unfavorable dimensions:

```text
Identity
Career
Achievements
Contributions
Recognition
Business
Disputes
Criticism
Legal
Regulatory
Failures
Counter-evidence
Resolution
```

Never search only for negative terms after a user forms a suspicion.

**KEEP, unchanged from V1**: this balanced-search-planner and mandatory-counter-search design (see §Mandatory Counter-Search below) correctly implements structured-intelligence-analysis debiasing doctrine and is the single best-designed part of the public intelligence spec — explicitly protect it from any future simplification pass. Full reasoning: `HCI30_RESEARCH_REVIEW/10_METHOD_SCIENCE_REVIEW.md` F10.

## Claim categories

Avoid simple Positive/Negative. Use:

```text
Achievements
Contributions
Recognition
Leadership
Innovation

Disputes
Criticism
Failures
Legal Matters
Governance Concerns

Resolved Matters
Unresolved Matters
Disputed Claims
```

Legal status must preserve distinctions:

```text
Allegation
Investigation
Charge
Trial
Judgment
Appeal
Settlement
Dismissal
Acquittal
```

## Source quality

Recommended hierarchy:

```text
S1 Primary authority
S2 Direct primary source
S3 High-quality independent journalism
S4 Professional / industry source
S5 General web
S6 Social / forum / weak lead
```

Important: a company website may reliably prove that a company **made a claim**, but not necessarily that the claim is objectively true.

## Source independence

URL count is not independent-source count.

Track:

```text
source_relationships
cites
derived_from
original_source
```

**Changed in V2 — wired into the cross-model agreement metric**: this source-independence tracking must feed directly into the "Model Agreement" confidence metric computed elsewhere in the integration contract (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Confidence Separation). Without this wiring, two models that both retrieve from the same underlying search index and land on the same SEO-poisoned or coordinated-fake page will report high agreement while genuinely independent corroboration is zero — exactly the failure mode cross-model review exists to catch and, unwired, cannot. The building blocks (this tracking) already existed in V1; this is a wiring gap, not a missing subsystem. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-11.

## Claim object

A claim should retain:

```text
claim_id
person_id / organization_id       -- see 02/07 for the pending Subject-type generalization
tenant_id                         -- new in V2, see below
claim_text
claim_type
event_date
status
confidence
source_ids[]
independent_source_count
contradicting_source_ids[]
review_status
```

> ✅ **RESOLVED (`HD-16`, 2026-09-02) — ADR-0026**: Option A — Claim, Source, and SourceSnapshot are tenant-scoped records, `tenant_id NOT NULL`, ADR-0016's forced-RLS pattern, never shared or deduplicated at the record level. Storage duplication is an accepted cost; a byte-level dedup layer for raw snapshot bytes only MAY be added later without changing record ownership. Schema (`sources`/`source_snapshots` tables) and cross-tenant negative tests are open implementation gates. See `governance/ADR-0026-claim-source-tenant-ownership.md`.

## Search result admission states

```text
DISCOVERED
MATCHED
VERIFIED
ACCEPTED
ACTIVE
REJECTED
```

Raw web result must never automatically become formal HCI Evidence.

## Negative evidence rules

Example: a forum post says "John is a fraud."

Allowed output:

```text
Unverified allegation located.
Source quality: low.
Independent corroboration: none.
Decision weight: informational only.
```

Forbidden:

```text
Fraud Risk = HIGH
```

## Mandatory counter-search

If a negative legal/regulatory result appears, automatically look for: dismissed, acquitted, settled, appeal, judgment, resolution, response.

## Timeline

Build a dated career/event timeline.

## Citation requirements

Reports should include: (1) inline source references per claim; (2) full source appendix with URL, title, publisher, author, publication date, retrieval date, type, quality.

## Multi-language research

Support native name, transliteration, simplified/traditional variants, language-specific public records, jurisdiction-specific registries.

## Research modes

```text
Quick Search
Standard Research
Deep Due Diligence
Continuous Monitoring
```

Depth must be proportional to collaboration risk.

**New in V2 — purpose attestation required before Continuous Monitoring / Deep Due Diligence**: a required purpose-attestation field is captured at Person-record creation, and `Continuous Monitoring` mode specifically is restricted to Team/Enterprise tiers with an explicit ToS acknowledgment, backed by volume/anomaly detection feeding a trust-and-safety queue — without this, the combination of the HCI Personal single-user private vault (`08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`) and unrestricted Continuous Monitoring is structurally capable of enabling covert surveillance of a non-consenting private individual regardless of intended use. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-09.

## HCI report structure

```text
Executive Overview
Identity Confidence
Career Timeline
Major Achievements
Notable Contributions
Recognition
Business / Organizational Relationships
Publicly Documented Disputes
Legal / Regulatory Matters
Resolved Issues
Unresolved Claims
Contradictions in Sources
Current Public Profile
Evidence Gaps
Source Quality Summary
Full Source Appendix
```

**New in V2**: exported reports carry mandatory legal disclaimers and a purpose-reassertion statement on every export, to reduce the risk of a report being extracted from HCI and used for reputation-laundering purposes outside the system's own evidentiary discipline. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-10.

## Public reputation vs direct experience

Never average them blindly.

Example:

```text
Public Reputation: Strong
Direct Collaboration Reliability: Weak
DIVERGENCE DETECTED
```

## Raw content storage *(new section in V2)*

Raw retrieved content (HTML/text snapshots) must not land in Postgres `text`/`bytea` columns as the default. Store raw snapshots in object storage; Postgres holds only a hash + metadata reference. This keeps the transactional database small and fast to back up, and avoids TOAST-storage/autovacuum degradation on the widest, most frequently-scanned table in the system as research volume grows. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-6.
