# 06 DATABASE ARCHITECTURE REVIEW: Database / Data Architecture Review

> Independent analysis by Reviewer B (Database / Data Architecture) — part of the HCI-30 x AI LEGO V1 architecture re-research. This reviewer worked in isolation from the other 8 reviewers; any agreement with other reviewers noted elsewhere in this package (see `14_CONVERGENCE_MATRIX.md`) was independently re-derived, not copied.

---

## Narrative Analysis

# Database Architecture Review — HCI-30 × AI LEGO Blueprint V1

**Lens**: PostgreSQL, RLS, bitemporal modeling, immutable history, event history, audit, claims, evidence, graphs, indexes, partitioning, retention, backup, data portability.

**Method**: Full read of all 24 files in `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1\` (00 through 23), cross-checked against the actual current infrastructure baseline (`agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`) and confirmed there is no `systems/hci30/` implementation directory yet — this is a pre-code architecture review of a specification, not a code audit. Doc 21 (Gap Analysis) already rates V1's own "Executable domain specification" at 4.5/10, which matches what I found: strong *principles*, almost no *schema*.

---

## 1. Overall verdict

V1's data philosophy is unusually good for a pre-implementation document: it explicitly separates Fact/Observation/Interpretation/Hypothesis (07:50-76), refuses a universal trust score, insists two evidence ledgers stay distinct (HCI domain evidence vs AI LEGO execution evidence, 10:95-109), and states Invariant 6 — "Historical truth is immutable... corrections create new versions and retain lineage" (01:85-87). That is the correct *intent* for a system whose entire value proposition is "what did we know, and why, and when."

But intent is not schema. Doc 21 already self-diagnoses this (P0-02 "Bitemporal history" is listed as unresolved, 21:67-82). My job as the DB reviewer is to (a) confirm that diagnosis is correct and not cosmetic, (b) give the concrete mechanism V1 is missing, (c) find the growth/partitioning/retention risks V1 hasn't looked at yet, (d) answer the graph-DB-when question explicitly, and (e) produce the 3-option DB architecture comparison and RLS-vs-DB-per-tenant evaluation the brief requires.

Bottom line recommendation: **PostgreSQL modular monolith (Option A)** — one Postgres instance (or tightly-coupled primary+replica pair), schema-per-bounded-context, insert-only ledger tables for Evidence/Claim/Assessment/Decision, RLS as the default multi-tenant boundary, no graph DB and no dedicated event store on day 1. This matches the actual infrastructure reality (single OVH dedicated box, self-hosted Postgres, solo operator, `agency-os/AGENTS.md` "Simple Core + Strong Contracts + Replaceable Edges") far better than anything more exotic, provided the missing schema-level mechanisms below are added before Wave 1 code is written — not after.

---

## 2. Which data is append-only, and is V1's schema actually append-only?

HCI's core value is defensibility: "why did we conclude this, and could we prove what we knew on date X." That requires three specific things V1 currently only asserts in prose:

1. **Evidence, Claim, Assessment, Decision, Observation rows must be physically insert-only.** 07:78-100 lists an `evidence` fields set that *includes* a `version` column, and 07:102-117 lists `assessment_version` / `evidence_cutoff` / `valid_until` for assessments — but the "Recommended relational tables" list at 07:144-179 shows flat table names (`evidence`, `assessments`, `decisions`, `observations`) with no `_history`, no separate insert-only ledger + "current pointer" view, and no statement that UPDATE/DELETE are forbidden at the database level. A `version` column on a mutable row is not the same guarantee as an immutable row — an application bug, a bad migration, or a compromised service account can still silently `UPDATE evidence SET raw_observation = ...` and the `version` column just increments quietly. Invariant 6 (01:85-87) is a promise the current schema sketch cannot keep.
2. **Audit trail (11:137-159) needs the same treatment** — it lists the right *fields* (who/what/when/where/before/after/reason/request_id/session_id) but never states the audit table itself is insert-only and separately protected (11:159 even lists "audit deletion attempt" as a high-risk alert to *detect*, which implicitly admits deletion is technically possible today).
3. **Public Intelligence's raw material (search results, source snapshots, claims) needs the same discipline**, and 06/07 already get this partly right — `search_result admission states` (06:188-197: DISCOVERED → MATCHED → VERIFIED → ACCEPTED → ACTIVE → REJECTED) is a good state machine, but the *raw retrieved content* underneath a `source_snapshot` is never described as content-addressed/immutable (see §4 below).

**Recommended fix**: In PostgreSQL this is cheap and well-understood — `REVOKE UPDATE, DELETE` on the application role for these tables, enforce via a `BEFORE UPDATE/DELETE` trigger that raises an exception (defense in depth beyond just grants, since owners/superusers bypass grants), and model "correction" as a new row with a `supersedes_id` pointer plus a `corrected_reason`. A `_current` view or materialized view resolves "give me the latest state" without ever allowing a destructive write. This is a well-trodden pattern (event-sourcing-adjacent, but far short of full event sourcing) and costs almost nothing operationally on a single Postgres instance.

---

## 3. Bitemporal modeling — confirmed gap, concrete fix

21:69-74 correctly distinguishes VALID TIME (when the real-world fact was true) from SYSTEM TIME (when HCI learned/stored/changed it) and states the expected result: "replay can answer 'what did HCI know on date X?'" This is the right ask. But nothing in 07 (my primary document) or 13 (replay/rollback) specifies *how*. 13:63-75 ("Replay") lists what a replay must preserve (evidence version, method version, policy version, Atlas hash, model metadata) but that's about reproducing an *execution*, not about answering "what was the state of Person X's Financial Trust domain as HCI understood it on 2027-03-01" — a pure data-layer question that has nothing to do with AI LEGO at all.

Concretely, HCI does **not** need full 6NF/Snodgrass-style bitemporal tables everywhere — that is over-engineering for a single-operator team. What it needs, scoped correctly:

- **Evidence, Claim, Assessment, Decision** (the four tables that back every "why did we conclude this" explanation, per 19:62-82 "Explainability button") need real bitemporal columns: `valid_from`, `valid_to` (real-world applicability window, nullable/open-ended) and `system_recorded_at`, `system_superseded_at` (when HCI's row set changed). PostgreSQL range types (`tstzrange`) plus a `GiST` exclusion constraint on `(subject_id, valid_range)` where relevant gives you both the temporal query performance and a hard DB-level guarantee against overlapping "currently true" facts about the same subject.
- Everything else (search_jobs, source_snapshots, identity_candidates) can stay simple insert-only with `created_at` — full bitemporal modeling there buys nothing because those aren't "facts about a person that can be superseded," they're research artifacts.

This is a scoping judgment call (which tables get full bitemporal treatment vs. simple insert-only) with real cost implications — I flag it `requires_human_decision=true` below (CI-1) precisely because doing it everywhere is expensive over-engineering and doing it nowhere breaks the product's core promise, and the line has to be drawn by whoever owns the Wave 1 domain ERD (P0-01, 21:44-65).

---

## 4. Which tables will become huge, and what happens to them on a single box?

V1 never estimates growth or specifies partitioning anywhere in 07, 12, or 13 — this is the single largest concrete operational risk I found, because it is invisible until it isn't: Postgres on a single OVH dedicated server degrades gracefully for a long time and then falls off a cliff (index bloat, autovacuum starvation, seq-scan-on-huge-table) with no elastic remediation available (there is no "just add a read replica in another AZ" — it's one box, confirmed by 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:9-15 and cross-checked against `AWAREWAVE_STACK_QUICKREF.md`, which shows the same single host already running 29 containers across 7 service groups).

Ranked by expected growth rate, given the pipelines described in 06 and the entity list in 07:144-179:

1. **`observations` / `evidence`** — every interaction, every claim admission, every research finding writes here. Unbounded, tenant-multiplied, append-only (see §2). This is the table the whole system's credibility depends on, and it will be the largest core-domain table within the first year of real usage across even a handful of Team/Enterprise tenants.
2. **`web_sources` / `source_snapshots`** — 06:15-46 pipeline (multi-source retrieval → dedup → claim extraction) means every research run can generate dozens to hundreds of source rows, and a "Deep Due Diligence" mode (06:259-263) run repeatedly (06's "Continuous Monitoring" mode) turns this into the fastest-growing table in the system by an order of magnitude. **07 never specifies where the actual retrieved content (raw HTML/text) is stored** — if it lands in a Postgres `text`/`bytea` column (the naive default), TOAST storage + autovacuum on a wide, frequently-scanned table will be the first thing that visibly hurts on this box.
3. **`claims` / `claim_sources` / `claim_contradictions`** — grows with (2), fan-out per source.
4. **`audit` (11:137-159)** — every high-value action, forever, on RESTRICTED-classification data (11:59-63). This table is *supposed* to grow forever — that's the point of an audit log — which makes it the canonical partitioning candidate.
5. **AI LEGO `execution_runs` / replay metadata** (adjacent, owned by the other product per 02:75-96, but sharing the same physical Postgres host per current infra) — every cognitive workflow run persists Atlas hash, model metadata, convergence data (09:69-76, 13:63-75). Out of my direct HCI ownership scope, but it competes for the same disk I/O and autovacuum workers.

**Fix, all covered under one recommendation**: native PostgreSQL **range partitioning by time** (monthly or quarterly) on `evidence`, `observations`, `web_sources`, `source_snapshots`, `claims`, and `audit`, with retention-policy-driven partition detachment (07:211-222 already declares that every data category *must* have a `retention_policy` — partitioning is the mechanical enforcement of that principle: dropping a detached partition is O(1) and doesn't require a table-wide `DELETE` that would fight autovacuum on a live table). For multi-tenant tables where a handful of Enterprise tenants dominate volume, consider a secondary hash-partition-by-tenant layer so one noisy tenant's due-diligence binge can't degrade query latency for every other tenant sharing the same monthly partition.

Separately: **source snapshot raw content must not live in the primary Postgres row store at all.** Store it in object storage (the current infra already has this pattern available via the self-hosted Supabase Storage container, per `AWAREWAVE_STACK_QUICKREF.md:79`) with the Postgres row holding only a content hash, size, MIME type, and storage key. This keeps the transactional database small, fast to back up, and fast to `pg_dump`/restore — which matters a great deal on a single box with no managed elastic storage tier.

---

## 5. RLS vs. DB-per-tenant

11:73-83 states tenant tables must have `tenant_id NOT NULL` and be "protected by DB-level Row Level Security **where appropriate**" — that hedge ("where appropriate") is the whole problem. 12:41-53 lists four isolation tiers (A: shared app + shared DB + RLS; B: shared app + dedicated DB; C: dedicated app + dedicated DB; D: dedicated region/customer cloud) but never commits which HCI edition (08:6-14, Personal→Group/Private) maps to which tier. 08:56-58 only says Enterprise gets a "dedicated DB **option**" — optional, not mandated, and no threshold is given for when it becomes mandatory.

Given HCI person-analysis data is RESTRICTED by default (11:59-63) and routinely contains unresolved allegations, legal-matter status, and financial-trust judgments about real named people — this is exactly the kind of data where a cross-tenant RLS policy bug is a defamation-adjacent incident, not just an inconvenience. "Where appropriate" is not a decision; it's a deferral of a decision that should be made now, in the domain ERD wave (21 P0-01), not discovered later.

My recommendation, and why RLS should still be the *default* rather than DB-per-tenant everywhere:

- **Shared tiers (Personal/Professional/Team, i.e. Tier A)**: RLS is correct and DB-per-tenant would be actively harmful given the actual infra. On a single OVH dedicated box with one Postgres instance and a solo operator, DB-per-tenant means N separate databases each needing their own connection pool slot, their own migration run, their own backup/restore cycle, and their own monitoring — this multiplies operational surface area linearly with customer count on infrastructure that cannot elastically absorb it. RLS with well-tested policies (mandatory automated test, not just a column-presence test — see below) is the correct choice here, and it is what the existing self-hosted Supabase stack is already built around.
- **Enterprise/Group/Private tiers (08:45-82, Tier B/C/D)**: dedicated DB (or dedicated instance/container) is correct — but it needs to be a *hard entitlement*, decided as part of the plan/edition definition (08:106-129 Entitlement architecture already has the right abstraction — `Product/Plan/Feature/Entitlement/Limit` — dedicated-DB should be one more `Entitlement` there, not a footnote), not an ad hoc "option" resolved per customer negotiation.

**The test gap matters as much as the policy gap.** 13:26-31 lists "tenant-owned entity must have `tenant_id`" as an architecture test — good, but that only verifies the *column* exists, not that an RLS *policy* is defined and *enabled* (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) and actually blocks cross-tenant reads under a non-superuser role. A table can pass the current test and still be wide open. This needs its own automated test: connect as a real tenant-scoped role, attempt to read another tenant's row, assert zero rows returned — for every RESTRICTED table, in CI, on every migration.

I am **not** recommending DB-per-tenant as the universal default — that would be over-engineering relative to the stated Personal/Professional/Team majority of the customer base and relative to the single-box reality. This is a hybrid model (RLS for shared tiers, dedicated DB as a paid entitlement for Enterprise+), which is what 08 and 12 are gesturing at without committing to.

---

## 6. Does HCI need a graph database — and when?

07:181-209 correctly identifies that HCI's data has graph structure: Person↔Organization↔Project↔Investor↔Partner↔Supplier↔Client↔Advisor↔Introducer relationships, and a claim provenance graph (Person → role_in → Organization → involved_in → Event → supported_by/contradicted_by → Source). But the recommended implementation (07:144-179) is flat relational tables (`organization_hierarchy`, `relationships`, `event_people`, `event_organizations`, `claim_sources`, `claim_contradictions`) with no adjacency/traversal strategy specified, and no document anywhere states a trigger condition for adopting a real graph database. The mission brief specifically asks for a *when*, not a *maybe* — here it is:

**Stay relational (with recursive CTEs) until at least one of these becomes true in production**:
- Relationship-network questions ("show every path connecting Person A and Person B within 4 hops," "who introduced whom, transitively") become a **core, latency-sensitive product feature** rather than an occasional analyst query — i.e., it's in the p95 UI path, not a background report.
- Recursive CTE query p95 latency on the real relationship graph exceeds your UI latency budget (pick a number now, e.g. 300-500ms) at realistic production row counts, measured, not guessed.
- You need graph *algorithms* — centrality, community detection, risk-weighted shortest path — that Postgres recursive CTEs genuinely cannot do efficiently, as opposed to simple traversal, which they can.

**Intermediate step before a separate graph database**: Apache AGE (a graph extension that runs *inside* PostgreSQL, openCypher query support, same backups, same transactions, same box) gets you graph query ergonomics without a second database, a second backup pipeline, or a second vendor dependency. This is the correct Day-1-to-Day-1000 answer for a single-operator team on a single box. A standalone graph database (Neo4j/Memgraph) should be treated as a Wave 12+ "30-year resilience/ecosystem" decision (21 P3, 22 Wave 12), gated behind the measured trigger conditions above — not adopted speculatively.

---

## 7. The unresolved tension: immutable evidence vs. right to erasure

This is the most consequential gap I found and it does not appear anywhere in 07, 11, or 21 as a *named* tension, even though the pieces are all present separately: Invariant 6 (01:85-87) says never overwrite history; 07:211-222 says every data category needs a `deletion_policy`; 11 (Security/Privacy) discusses customer data ownership (11:117-126) and prohibits things like covert scoring, but never discusses an individual data *subject's* (the Person being analyzed, who is frequently not the customer/tenant) right to correction or erasure under GDPR-class regimes; 21:266-279 (P1-04) lists `CRYPTO_ERASURE.md` as an artifact to write *eventually*, filed under enterprise key-architecture hardening, disconnected from the domain model doc.

The real problem: HCI's core defensibility promise ("what did we know and why") requires that Evidence/Claim/Assessment rows about a Person are *never deleted*, ever — that's what makes a Decision explainable and auditable five years later. But the Person being analyzed is frequently a data subject with statutory rights (right to rectification, and in some jurisdictions right to erasure/right to be forgotten) that HCI does not control away by being a B2B tool — subject-access and correction obligations can attach regardless of who the paying customer is, and the product markets itself explicitly around handling "allegations," "legal matters," and "unresolved claims" (06:102-138) about identifiable real people. If a Person successfully compels deletion of a specific false claim, and the domain model has no mechanism except "delete the row" (which breaks Invariant 6 and destroys the audit trail for every Decision that referenced it) or "keep the row forever" (which is a legal violation), the system has no correct move — because nobody designed one.

**This needs to be resolved at the schema level before Wave 1, not bolted on in Wave 9 (Enterprise, 22:242-263).** The standard, correct pattern is crypto-shredding / tombstoning: encrypt sensitive evidence payloads with a per-record (or per-Person) data encryption key; on erasure, destroy only the key (not the row) — the row's *metadata* (that evidence existed, its timestamp, its role in past Decisions, its correction lineage) survives for audit purposes, but its *content* becomes permanently unrecoverable. This satisfies both Invariant 6 (nothing is silently rewritten — the tombstone event is itself an immutable, logged fact) and erasure obligations (the sensitive content is genuinely gone). 21 already names the right artifact (`CRYPTO_ERASURE.md`) — it just needs to be pulled forward and referenced directly from the domain model doc, and the `evidence`/`claims`/`observations` schema needs an explicit `encryption_key_ref` + `tombstoned_at` design from day one, because retrofitting per-record encryption onto an existing large table later is a genuinely painful, high-risk migration.

---

## 8. Three-option DB architecture comparison

| Dimension | **A. PostgreSQL modular monolith** (one instance, schema-per-bounded-context, insert-only ledgers) | **B. PostgreSQL + dedicated event store** (full event-sourcing/CQRS; all state changes flow through an immutable event log with projected read models) | **C. PostgreSQL + graph DB** (relational core + Neo4j/Memgraph for relationships/claims) |
|---|---|---|---|
| **Complexity** | Low-moderate. One query language, one transaction model, one connection pool. | High. Two paradigms (event log + projections), eventual consistency between write model and read models, replay tooling to build/rebuild. | Moderate-high. Two databases, two schemas to keep in sync, cross-DB joins done in application code. |
| **Correctness** | Strong — ACID transactions across all domain writes in one place; foreign keys and check constraints enforce invariants natively. | Strong for "what happened," weaker for "is the current state consistent right now" (projection lag is a real failure mode). | Weak at the boundary — nothing enforces referential integrity between the relational DB and the graph DB; a person deleted in one can silently orphan edges in the other. |
| **Maintainability** | High — one skill set (SQL/Postgres), one thing to monitor, one backup pipeline. Matches the actual team (solo operator + AI agents). | Low for a small team — event sourcing is one of the highest-cost-to-learn, highest-cost-to-debug patterns in the field; "replay to reconstruct state" bugs are notoriously hard to diagnose. | Low-moderate — two operational surfaces, two sets of migrations, two things that can drift out of sync. |
| **Blast radius** | Contained to one instance; mitigated further by RLS + insert-only ledgers + partitioning (§2-4). | An event-log corruption or bad projection replay can corrupt *every* downstream read model simultaneously — larger blast radius than A. | A graph-DB outage takes down relationship/claim-graph features independently (good isolation) but a sync bug between the two stores can silently produce wrong answers in *either* store without either one reporting an error. |
| **Vendor lock-in** | Very low — PostgreSQL is a 30-year-proven, license-free, single-vendor-independent standard (Invariant 4, 01:61-68 already names "a single proprietary vector database" as forbidden lock-in; the same logic applies to a proprietary event store or graph vendor). | Depends on implementation — if using a dedicated commercial event-store product, real lock-in; if hand-rolled on Postgres tables, lower lock-in but bespoke and undocumented outside this team. | Real — Cypher/graph-vendor-specific query logic becomes load-bearing product logic that isn't portable. |
| **Cost (current infra)** | Fits the existing single self-hosted Postgres reality with zero new infrastructure. | Meaningfully higher — needs either a new component (EventStoreDB-class product) or substantial in-house engineering to build event-sourcing discipline correctly, on a box that is already running 29 containers. | Meaningfully higher — a second stateful service to run, monitor, back up, and secure on the same single dedicated server that already hosts everything else. |
| **Operations** | One thing to operate; existing runbooks/backup tooling extend naturally. | New operational discipline required (projection rebuild runbooks, event schema versioning, replay tooling) that does not exist in this org today. | New backup/restore/DR runbook needed for a second stateful system; current infra baseline (23) has no such runbook. |
| **Migration cost (later, if needed)** | Low to escalate *into* B or C later for a *specific* narrow slice (e.g., only the intelligence-scoring recompute path becomes event-sourced; only relationship traversal moves to Apache AGE first, inside the same Postgres instance) — because A's insert-only ledger tables are already "event-log-shaped" and can be replayed into a projection without a rewrite. | High to retrofit down to A if event-sourcing turns out to be premature — application code is now structurally coupled to the event/projection pattern everywhere. | Moderate — extracting graph queries into Apache AGE (inside Postgres) first, and only moving to a standalone graph DB if AGE's traversal performance is proven insufficient, avoids most of this cost. |
| **30-year durability** | Highest — PostgreSQL's own 30-year track record, the team's existing operational competence, and the smallest surface area to keep correct over decades. | Uncertain — event-sourcing systems that outlive their original author team are notoriously hard to hand off; replay logic embeds assumptions that rot silently. | Uncertain — depends entirely on the chosen graph vendor's own 30-year survival, which is a much shorter track record than PostgreSQL's. |

**Recommendation: Option A**, with two narrow, explicitly-scoped escalation paths kept open rather than adopted wholesale:
1. The insert-only ledger design for Evidence/Claim/Assessment/Decision (§2) is *already* the useful 80% of event-sourcing's value (immutable history, replay-able state reconstruction) without CQRS's projection-consistency complexity — so Option B's core benefit is mostly captured inside Option A once §2/§3 are implemented. Full event-sourcing (a dedicated event store, projections, replay-to-rebuild-state-from-scratch) should be explicitly **deferred** and only revisited if a specific, narrow need proves itself — e.g., the intelligence math versioning work in Wave 5 (22:137-155) needs to recompute historical confidence scores under a new model version across the *entire* evidence history, which is exactly the kind of problem full replay-from-events solves well. That's a candidate for a narrow, bounded event-sourced subsystem later — not a whole-system rewrite now.
2. Apache AGE inside the same Postgres instance is the correct graph answer today (§6); a standalone graph database is explicitly gated behind measured trigger conditions, not adopted speculatively.

---

## Summary of concrete asks (see change_items for full detail and evidence)

1. Define bitemporal columns for Evidence/Claim/Assessment/Decision specifically (not universally) — scoping decision needed.
2. Make insert-only/append-only ledger enforcement a DB-level mechanism (REVOKE + trigger), not a prose promise.
3. Add time-range partitioning + retention-driven partition detachment for evidence/observations/web_sources/source_snapshots/claims/audit.
4. Move raw source-snapshot content out of Postgres rows into object storage; Postgres holds hash + metadata only.
5. Make RLS enforcement (policy-enabled + cross-tenant-read-blocked) a mandatory automated test, not just a column-presence test.
6. Formally map HCI edition → tenant-isolation tier as an Entitlement, not an "option."
7. State the graph-DB trigger condition explicitly; adopt Apache AGE (in-Postgres) before any standalone graph database.
8. Resolve the immutable-evidence-vs-right-to-erasure tension at the domain-model layer via crypto-shredding, before Wave 1 schema is finalized.
9. Add reversible, audited identity merge/split at the schema level to bound false-attribution risk.
10. Decide whether HCI's Postgres data lives in the same physical cluster as unrelated lower-sensitivity automation data (n8n) already running on the shared self-hosted Supabase instance, or is physically isolated as a compensating control.
11. Write an explicit ADR committing to Option A (Postgres modular monolith) with the two narrow escalation paths above, so no future contributor re-litigates this from scratch.


---

## Change Items (12)

### CI-1 — No bitemporal schema mechanism despite Invariant 6 immutability promise

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 01_SYSTEM_CONSTITUTION.md:85-87 states 'Do not overwrite history. Corrections create new versions and retain lineage.' 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:102-117 lists assessment_version/model_version/policy_version/evidence_cutoff/valid_until but no valid-time vs system-time columns. 21_HCI_TOP_TIER_GAP_ANALYSIS.md:67-82 (P0-02) already lists 'Bitemporal history' as an unresolved P0 item with expected result 'replay can answer what did HCI know on date X' — but no document specifies the actual columns/constraints. |
| **Problem** | Without explicit valid_from/valid_to (real-world truth window) and system_recorded_at/system_superseded_at (when HCI's belief changed) columns, 'what did we know on date X' (required by 19:108-116 'What would change my mind' and 13:63-75 Replay) cannot actually be answered from the data — it can only be approximated by reading application logs, which is not audit-grade. |
| **Evidence** | 01_SYSTEM_CONSTITUTION.md:85-87; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:102-117,144-179; 21_HCI_TOP_TIER_GAP_ANALYSIS.md:67-82; 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:63-75 |
| **Risk if unchanged** |  |
| **Alternative A** | Bitemporal on all tables (correctness-maximal, expensive, over-engineered) |
| **Alternative B** | Bitemporal on Evidence/Claim/Assessment/Decision only (recommended) |
| **Alternative C** | No bitemporal columns, rely on audit log reconstruction (fails the 'what did we know' replay promise) |
| **Recommended** | Add explicit bitemporal columns (tstzrange valid time + system time) scoped to Evidence, Claim, Assessment, Decision only (not universally) as part of the Wave 1 Domain ERD (21 P0-01). Use PostgreSQL range types + GiST exclusion constraints to prevent overlapping 'currently true' facts about the same subject. |
| **Why** | These four tables are the ones every explainability/replay claim in the product (19, 13) actually depends on; universal bitemporal modeling on every table (search_jobs, source_snapshots, etc.) would be over-engineering with no product payoff. |
| **Blast radius** | Schema-only change if done at Wave 1; expensive retrofit if deferred past first production data. |
| **Migration impact** | None if done before Wave 1 code exists (confirmed: no systems/hci30/ directory exists yet). |
| **Rollback** | N/A pre-implementation; columns can be dropped if unused before any production data lands. |
| **30-year consequence** | Without this, every 'why did we conclude X' answer HCI ever gives is unverifiable after the fact, undermining the entire explainability/defensibility value proposition documented in 19. |
| **Confidence** | High |
| **Requires human decision** | YES |

### CI-2 — Insert-only ledger design asserted in prose, not enforced in schema

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:78-100 (evidence fields incl. 'version') and :144-179 (flat table list: evidence, assessments, decisions, observations with no _history/ledger suffix). 11_SECURITY_PRIVACY_GOVERNANCE.md:137-159 lists audit fields but :159 lists 'audit deletion attempt' as something to detect, implicitly admitting deletion is possible. |
| **Problem** | A 'version' column on a row that can still be UPDATEd is not immutability — an app bug, bad migration, or compromised service account can silently rewrite history and the version counter just increments. This directly contradicts Invariant 6 (01:85-87). |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:78-100,144-179; 11_SECURITY_PRIVACY_GOVERNANCE.md:137-159; 01_SYSTEM_CONSTITUTION.md:85-87 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | REVOKE UPDATE/DELETE at the DB role level for Evidence/Claim/Assessment/Decision/Audit, backed by a BEFORE UPDATE/DELETE trigger that raises an exception (defense in depth against superuser/owner bypass). Model corrections as new rows with a supersedes_id pointer; expose a _current view for latest-state reads. |
| **Why** | This is the mechanical implementation of a promise V1 already makes but cannot currently keep at the database layer; it is cheap on a single Postgres instance and closes a real tamper/bug risk on RESTRICTED-classification data. |
| **Blast radius** | Contained to write-path code for four tables; no read-path impact. |
| **Migration impact** | Low if implemented before Wave 4 (Evidence/Claim/Assessment core, 22:113-135). |
| **Rollback** | Revoke the trigger/grants; straightforward to disable if it blocks a legitimate emergency fix (with audit trail of the exception). |
| **30-year consequence** | Without DB-level enforcement, 'immutable evidence' is a policy that erodes silently over 30 years of team turnover and emergency hotfixes. |
| **Confidence** | High |
| **Requires human decision** | NO |

### CI-3 — No partitioning or retention-enforcement strategy for high-growth tables

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:144-179 lists evidence/observations/claims/web_sources/source_snapshots/audit as flat tables with no partition strategy mentioned anywhere in 07, 12, or 13. 07:211-222 states every data category 'must have' a retention_policy but no mechanism is specified. |
| **Problem** | These are the fastest-growing tables in the system (every research run, every interaction, every audit event writes here), running on a single non-elastic OVH dedicated box (confirmed: 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:9-15, corroborated by AWAREWAVE_STACK_QUICKREF.md showing 29 containers already sharing this host). Unbounded table growth without partitioning degrades gracefully until it doesn't (autovacuum starvation, index bloat, seq-scan-on-huge-table) with no elastic remediation available. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:144-179,211-222; 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:9-15; agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md (29 containers on one host, corroborating evidence) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Native PostgreSQL range partitioning by month/quarter on evidence, observations, web_sources, source_snapshots, claims, audit; retention policy enforcement becomes 'detach + archive/drop old partition' rather than a table-wide DELETE. Consider a secondary hash-by-tenant_id layer for tables where a handful of Enterprise tenants dominate volume. |
| **Why** | This is the mechanical enforcement of the retention_policy principle 07 already declares, and it is the specific technique that avoids the operational cliff a single non-elastic Postgres instance will otherwise hit. |
| **Blast radius** | Contained to DDL for six tables; requires care in Wave 1 (before data exists) since partitioning an existing large table later is a heavier migration. |
| **Migration impact** | Trivial if done at Wave 1 (no data yet); expensive if deferred past first production data ingestion. |
| **Rollback** | Partitioned tables can be reorganized, though it is nontrivial once populated — this is exactly why it belongs in Wave 1, not retrofitted. |
| **30-year consequence** | Without this, the single-box Postgres instance is the most likely single point of catastrophic performance failure in the whole 30-year system. |
| **Confidence** | High |
| **Requires human decision** | NO |

### CI-4 — RLS mandated only 'where appropriate'; no edition-to-isolation-tier mapping; test only checks tenant_id column presence

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 11_SECURITY_PRIVACY_GOVERNANCE.md:73-83 says tenant tables need tenant_id NOT NULL and RLS 'where appropriate' (hedge). 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:41-53 lists 4 isolation tiers but never maps HCI editions to them. 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:56-58 only offers Enterprise a dedicated-DB 'option', no threshold. 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:26-31 architecture test only verifies tenant_id column exists, not that an RLS policy is enabled and actually blocks cross-tenant reads. |
| **Problem** | HCI person-analysis data defaults to RESTRICTED classification (11:59-63) and routinely contains unresolved allegations/legal-status/financial-trust judgments about real named people — a cross-tenant RLS bug here is a defamation-adjacent incident, not an inconvenience. 'Where appropriate' defers a decision that needs to be made before Wave 1, and a column-presence test can pass while RLS is completely unenforced. |
| **Evidence** | 11_SECURITY_PRIVACY_GOVERNANCE.md:59-63,73-83; 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:27-53; 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:45-58,106-129; 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:26-31 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Make RLS mandatory (not optional) for all Tier A (shared) tenants; add an explicit Entitlement (per 08's own Product/Plan/Feature/Entitlement model, 08:106-129) for dedicated-DB Enterprise/Group tiers rather than an ad hoc 'option'. Add a real automated test: connect as a tenant-scoped non-superuser role, attempt cross-tenant read, assert zero rows, for every RESTRICTED table, in CI, on every migration. |
| **Why** | Closes both a technical gap (untested RLS) and a commercial-model gap (undefined isolation entitlement) with one coherent fix; RLS remains the correct default for shared tiers given the single-box infra reality (see DB-per-tenant evaluation in narrative). |
| **Blast radius** | Test-suite and governance-doc change; no schema rewrite needed if tenant_id already exists per-table. |
| **Migration impact** | Low — this formalizes and tests an already-intended boundary. |
| **Rollback** | N/A — this is additive test coverage and policy clarification. |
| **30-year consequence** | An untested tenant boundary on RESTRICTED personal-reputation data is the kind of gap that stays invisible for years until one incident ends the company's enterprise trust story permanently. |
| **Confidence** | High |
| **Requires human decision** | YES |

### CI-5 — Graph DB trigger condition never defined despite explicit graph-shaped data model

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:181-209 describes relationship graph (Person/Company/Project/Investor/Partner/Supplier/Client/Advisor/Introducer) and claim graph (Person→role_in→Organization→involved_in→Event→supported_by/contradicted_by→Source) conceptually, but recommends only flat relational tables (144-179) with no traversal strategy and no document states when a dedicated graph database becomes justified. |
| **Problem** | The brief explicitly requires a stated trigger condition, not a 'maybe someday.' Left undefined, this becomes either premature adoption (over-engineering, extra vendor, extra ops surface on a single-box team) or a late scramble once relationship-network features are already load-bearing in the UI. |
| **Evidence** | 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:181-209; 21_HCI_TOP_TIER_GAP_ANALYSIS.md (no mention of graph DB anywhere in P0-P3); 22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md Wave 12 (303-323, only mentions LEGO runtime/data portability, not graph DB) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Stay relational with recursive CTEs; adopt Apache AGE (in-Postgres graph extension) as the intermediate step once multi-hop relationship queries appear in the product. Define the explicit trigger: (1) relationship-path queries become a latency-sensitive core UI feature rather than a background report, (2) recursive CTE p95 latency exceeds a defined budget (e.g. 300-500ms) at real production volume, or (3) graph algorithms (centrality, weighted shortest path) become core to risk scoring. Only escalate to a standalone graph database (Neo4j/Memgraph) if AGE's performance is measured and proven insufficient. |
| **Why** | Matches the anti-overengineering constraint directly while still giving a concrete, measurable escalation path rather than leaving it open-ended. |
| **Blast radius** | None now; contained to a documented decision plus later extension config if triggered. |
| **Migration impact** | None now; AGE-in-Postgres avoids a second database entirely when/if triggered. |
| **Rollback** | N/A — this is a documented decision, not a running system change. |
| **30-year consequence** | Without a stated trigger, the team either wastes early effort standing up a graph DB nobody needs yet, or gets blindsided later when relationship-network UX becomes core and the flat-table queries fall over. |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### CI-6 — Raw source-snapshot content storage medium unspecified — risk of large blobs inside primary Postgres row store

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 06_HCI30_PUBLIC_INTELLIGENCE.md:15-46 (retrieval pipeline) and 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:144-179 list source_snapshots as a table but never specify where retrieved raw content (HTML/text) is physically stored. |
| **Problem** | If raw snapshot content defaults into a Postgres text/bytea column (the naive default for a team without an explicit decision), TOAST storage plus autovacuum on a wide, frequently-written table will be one of the first visible performance failures on the single-box Postgres instance, and will bloat pg_dump/backup time significantly. |
| **Evidence** | 06_HCI30_PUBLIC_INTELLIGENCE.md:15-46; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:144-179,163-178; AWAREWAVE_STACK_QUICKREF.md:79 (Supabase Storage container already exists on the same host and can be reused) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Store raw snapshot content in object storage (Supabase Storage, already running on the same infra); Postgres row holds only content hash, size, MIME type, and storage key reference. |
| **Why** | Keeps the transactional database small and fast to back up; reuses infrastructure that already exists rather than adding a new component. |
| **Blast radius** | Contained to the public-intelligence ingestion write path (Wave 6, 22:157-188). |
| **Migration impact** | Trivial if decided before any snapshot data is written; expensive migration to move large blobs out of Postgres later. |
| **Rollback** | N/A pre-implementation. |
| **30-year consequence** | Undecided storage medium for the fastest-growing, highest-churn table category is the most likely near-term cause of a visible performance incident on shared infrastructure. |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### CI-7 — Immutable-evidence-vs-right-to-erasure tension is unresolved at the domain-model layer

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 01_SYSTEM_CONSTITUTION.md:85-87 (never overwrite history) vs 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:211-222 (every data category must have a deletion_policy) are never reconciled. 21_HCI_TOP_TIER_GAP_ANALYSIS.md:266-279 (P1-04) lists CRYPTO_ERASURE.md as an artifact but files it under enterprise key-architecture hardening (Wave 9), disconnected from the domain model doc, and 11_SECURITY_PRIVACY_GOVERNANCE.md never discusses the analyzed Person's (not the paying tenant's) statutory correction/erasure rights at all. |
| **Problem** | HCI's core defensibility promise requires Evidence/Claim/Assessment rows about a Person are never deleted. But the Person being analyzed is frequently a data subject with statutory rights (rectification, and in some jurisdictions erasure) that attach regardless of who the paying customer is, and the product explicitly handles 'allegations,' 'legal matters,' and 'unresolved claims' about identifiable real people (06:102-138). If erasure is compelled, the current domain model has no correct move: deleting the row breaks Invariant 6 and destroys the audit trail behind every past Decision that referenced it; refusing to delete risks a legal violation. This is exactly the kind of decision that is cheap to bake in at Wave 1 and extremely expensive to retrofit onto a populated, encrypted-at-rest-only table later. |
| **Evidence** | 01_SYSTEM_CONSTITUTION.md:85-87; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:211-222; 11_SECURITY_PRIVACY_GOVERNANCE.md (entire file, no data-subject erasure discussion); 21_HCI_TOP_TIER_GAP_ANALYSIS.md:266-279; 06_HCI30_PUBLIC_INTELLIGENCE.md:102-138 |
| **Risk if unchanged** |  |
| **Alternative A** | Full row deletion on erasure request (violates Invariant 6, destroys audit trail for past decisions) |
| **Alternative B** | Crypto-shredding: destroy key only, keep tombstoned metadata row (recommended) |
| **Alternative C** | Never delete/erase anything, accept legal exposure (unacceptable given 06's own allegation/legal-matter handling) |
| **Recommended** | Design crypto-shredding into the Evidence/Claim/Observation schema from Wave 1: per-record (or per-Person) data encryption key reference column, plus a tombstoned_at column. Erasure destroys only the key (content becomes permanently unrecoverable); row metadata (that evidence existed, its timestamp, its role in past Decisions, correction lineage) survives for audit purposes. Pull CRYPTO_ERASURE.md forward from Wave 9/P1-04 and reference it directly from the domain-model doc. |
| **Why** | This is the standard, correct pattern that satisfies both immutability (the tombstone event is itself an immutable, logged fact) and erasure obligations (content is genuinely destroyed) simultaneously — and it is far cheaper to build in from the start than to retrofit onto live evidence tables later. |
| **Blast radius** | Schema-only if done at Wave 1 (encryption_key_ref + tombstoned_at columns); legal/compliance exposure if left undecided into production. |
| **Migration impact** | Low now; very high if retrofitted onto a populated, non-per-record-encrypted evidence table later. |
| **Rollback** | N/A — this is an additive schema and process decision. |
| **30-year consequence** | This is a legal-exposure time bomb specific to a product whose entire purpose is storing allegations about real people; it needs an explicit decision, not silent deferral, because the cost of being wrong compounds with every year of un-shredded evidence accumulated. |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### CI-8 — Identity resolution merge/split has no schema-level reversibility or audit trail

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 06_HCI30_PUBLIC_INTELLIGENCE.md:47-76 defines identity states (MATCH_CONFIRMED...MATCH_REJECTED) and 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:175-176 lists identity_candidates/identity_matches tables, but no document specifies that a merge decision (attributing a claim/evidence record to a specific real Person) is itself reversible or audited at the schema level. |
| **Problem** | A false identity merge — attributing negative evidence about one 'John Smith' to the wrong 'John Smith' — is a direct defamation/reputational-harm risk against an innocent third party, and if merges are not reversible with full audit trail (who merged, when, on what confidence basis, and an undo path), correcting the error later requires manually untangling which evidence rows were wrongly attached. |
| **Evidence** | 06_HCI30_PUBLIC_INTELLIGENCE.md:47-76; 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:175-176 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Model person-identity merge/split as its own insert-only, audited ledger table (analogous to master-data-management survivorship records) rather than an in-place foreign-key rewrite; every evidence-to-person attribution retains a reference to the identity-resolution decision that produced it, so a later split can be mechanically reversed. |
| **Why** | This is a direct mitigation for a real, product-specific legal risk (misattributed allegations about a real person) that the current schema sketch does not address at all. |
| **Blast radius** | Contained to the identity-resolution subsystem (Wave 4/6). |
| **Migration impact** | Low if designed at Wave 1/4; expensive to retrofit once evidence is already hard-linked to person_id with no lineage. |
| **Rollback** | N/A — additive design. |
| **30-year consequence** | Without reversible, audited identity resolution, a single false-merge incident on a real person's data becomes functionally uncorrectable at scale, directly undermining the product's stated integrity commitments (15:100-112). |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### CI-9 — HCI data's physical isolation from the shared automation-tooling Postgres cluster is undecided

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md and 07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md never state which physical Postgres instance/container HCI will use. Actual current infra (AWAREWAVE_STACK_QUICKREF.md:87) shows the existing self-hosted Supabase Postgres cluster already hosts n8n's workflow database ('n8n 網路: supabase_default；DB: supabase-db:5432 database n8n') alongside other lower-sensitivity automation data on the same host confirmed by 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md. |
| **Problem** | 11_SECURITY_PRIVACY_GOVERNANCE.md:59-63 defaults HCI person-analysis data to RESTRICTED classification. If HCI's tables end up inside the same physical Postgres cluster/instance that already serves unrelated, lower-sensitivity automation tooling, RLS becomes the *only* isolation layer between RESTRICTED legal/reputational data and a much larger blast-radius surface (any bug, credential leak, or misconfiguration affecting the shared cluster now also touches HCI data) — defense in depth is reduced to a single control. |
| **Evidence** | 11_SECURITY_PRIVACY_GOVERNANCE.md:59-63; agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md:79,87 (external corroborating evidence, not part of blueprint dir); 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:9-15,88-105 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Provision a physically separate Postgres instance/container for HCI on the same box at minimum (separate data directory, separate backup schedule, separate resource limits, separate credentials) rather than adding HCI schemas into the existing general-purpose automation-tooling Supabase cluster. Document this as an explicit ADR alongside the DB architecture ADR (CI-10). |
| **Why** | This is a compensating control given single-box infrastructure reality, not a call for a separate managed service — it keeps RESTRICTED-classification data's blast radius bounded without adding meaningful operational cost (still one box, still Postgres, still self-hosted). |
| **Blast radius** | Infra provisioning decision, no application-code impact if decided before Wave 1. |
| **Migration impact** | Low now; a live-data migration to split an already-shared cluster later is disruptive and risky. |
| **Rollback** | Straightforward pre-implementation; a live split later requires a maintenance window and careful cutover. |
| **30-year consequence** | Co-locating the company's highest-liability data with routine automation tooling data compounds risk for the life of the system with no offsetting benefit. |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### CI-10 — No explicit ADR committing to a DB architecture (modular monolith vs event store vs graph DB)

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:5-9 states 'start with a modular monolith' but this is about application architecture (avoiding premature microservices), not a specific commitment about the database layer. 17_REPOSITORY_LAYOUT_AND_PATHS.md:216-229 lists 8 recommended ADRs to create, none of which is a DB-architecture ADR specifically. |
| **Problem** | Without a written ADR, this exact question (modular-monolith Postgres vs event-sourced vs graph-augmented) is left implicit and can be silently re-litigated or drifted away from by a future contributor or AI agent with no record of why the original choice was made. |
| **Evidence** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:5-9; 17_REPOSITORY_LAYOUT_AND_PATHS.md:216-229 |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Write ADR-0009-database-architecture-is-postgres-modular-monolith.md committing to: one PostgreSQL instance (schema-per-bounded-context), insert-only ledger tables for Evidence/Claim/Assessment/Decision (CI-2), bitemporal columns scoped to those four tables (CI-1), RLS as default tenant isolation with dedicated-DB as an Enterprise+ entitlement (CI-4), Apache AGE in-Postgres before any standalone graph DB (CI-5), and explicit, measurable trigger conditions for escalating any of these choices later. |
| **Why** | This is the single document that ties every other finding in this review into one committed decision, matching the pattern V1 already uses for other architecture-level commitments (17's 8-ADR list). |
| **Blast radius** | Documentation only. |
| **Migration impact** | None. |
| **Rollback** | N/A. |
| **30-year consequence** | Undocumented architecture decisions are the ones most likely to be silently violated by the third or fourth contributor generation. |
| **Confidence** | High |
| **Requires human decision** | NO |

### CI-11 — Full event-sourcing/CQRS should be explicitly deferred, not adopted for v1

| Field | Content |
|---|---|
| **Disposition** | DEFER |
| **Current V1** | No document proposes full event-sourcing explicitly, but the brief requires this comparison to be made explicit and the risk is that 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md's replay/shadow-mode requirements (13:63-95) could be misread as implying full event-sourcing is needed to satisfy them. |
| **Problem** | Full event-sourcing (dedicated event store, CQRS projections, replay-to-rebuild-state-from-scratch for every entity) is a real over-engineering risk for a solo-operator team on a single box — it is one of the highest learning-cost, highest debugging-cost patterns available, and 13's actual replay requirements (preserve evidence version, method version, policy version, Atlas hash, model metadata) are fully satisfiable by the insert-only ledger design in CI-2 without adopting event-sourcing wholesale. |
| **Evidence** | 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:63-95; 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:5-9 (modular monolith preference, consistent with deferring this) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Explicitly defer full event-sourcing/CQRS for the whole domain. Keep the option narrowly scoped and bounded: if the Wave 5 intelligence-math versioning work (22:137-155, recomputing historical confidence scores under a new model_version across full evidence history) proves the insert-only ledger insufficient, treat that specific recompute pipeline as a candidate for a narrow, bounded event-sourced subsystem — not a whole-system migration. |
| **Why** | Directly addresses the anti-overengineering constraint in the mission brief: this is a case where NOT building the more complex option is the correct 30-year call, given the actual team size and infra. |
| **Blast radius** | None — this is a decision not to build something. |
| **Migration impact** | None. |
| **Rollback** | N/A. |
| **30-year consequence** | Avoids saddling a solo-operator team with an operationally expensive pattern that the actual replay requirements do not need. |
| **Confidence** | High |
| **Requires human decision** | NO |

### CI-12 — DB-per-tenant correctly rejected for shared tiers, but this call is never stated or justified anywhere in V1

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:41-53 lists Tier A (shared+RLS) alongside Tier B/C/D (dedicated DB variants) as options without recommending one as default for the Personal/Professional/Team majority of the customer base described in 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:6-14. |
| **Problem** | Nothing is technically wrong here, but V1 leaves the default unstated, which invites a future contributor to reach for DB-per-tenant 'for extra safety' without recognizing the operational cost given the actual single-box infrastructure (each tenant DB needs its own connection pool slot, its own migration run, its own backup/restore cycle on non-elastic infra). |
| **Evidence** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:41-53; 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:6-14; 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:9-15 (single non-elastic box) |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Explicitly document (as part of the CI-10 ADR) that RLS/shared-DB (Tier A) is the default and recommended isolation model for Personal/Professional/Team, with the reasoning (operational cost of DB-per-tenant on non-elastic single-box infra) stated so it cannot be silently re-litigated. |
| **Why** | Confirms and formalizes a call V1's own tier list implicitly supports but never commits to, closing the ambiguity gap without changing any actual architecture. |
| **Blast radius** | Documentation only. |
| **Migration impact** | None. |
| **Rollback** | N/A. |
| **30-year consequence** | Prevents future scope creep toward DB-per-tenant-for-everyone, which would not survive the actual single-box operational reality. |
| **Confidence** | High |
| **Requires human decision** | NO |

---

## Open Assumptions Flagged by This Reviewer

- Assumed no systems/hci30/ implementation directory exists yet (confirmed via Glob/find across D:\Work\agency-os) — this review targets the pre-code specification, not running code.
- Assumed the self-hosted Supabase Postgres cluster referenced in AWAREWAVE_STACK_QUICKREF.md is the same instance that would host HCI data absent an explicit decision otherwise — no blueprint doc confirms or denies this, so CI-9 is a gap flag, not a confirmed bad decision.
- Assumed HCI's typical customer distribution skews toward Personal/Professional/Team (per 08's edition list ordering) rather than Enterprise-heavy, which underlies the RLS-as-default recommendation (CI-4/CI-12).
- Assumed 'evidence-cutoff'/'valid_until' columns already sketched in 07:102-117 are intended as informal versioning rather than a rigorous bitemporal model, based on the absence of range types or exclusion constraints anywhere in the document set.
- Assumed PostgreSQL will remain the DB engine (consistent with 12's modular-monolith direction and current infra) rather than a wholesale engine change being on the table.

---

## Open Risks Flagged by This Reviewer

- If Wave 1 (Domain ERD, 21 P0-01) proceeds without resolving CI-1 (bitemporal scope) and CI-7 (erasure tension) first, both become expensive retrofits once evidence data exists in production — this is the highest-priority sequencing risk in this review.
- Table growth (CI-3) and storage medium (CI-6) risks are currently invisible because no production data exists yet; they will surface as a real incident on the shared single OVH box within the first heavy usage period (e.g. first Enterprise due-diligence customer) if not addressed before Wave 6 (Public Intelligence).
- The RLS test gap (CI-4) means a cross-tenant data leak on RESTRICTED-classification personal-reputation data could currently pass all documented architecture tests while still being exploitable — this is a security risk independent of my lens but directly caused by a testing gap in the data layer.
- The identity-merge reversibility gap (CI-8) is a legal/reputational risk (false attribution of allegations to the wrong real person) that compounds the longer it goes unaddressed, since more evidence accumulates against the wrongly-merged identity over time.
- No document in the blueprint set addresses backup/restore specifically for HCI's data given the single-box, multi-tenant, RESTRICTED-classification reality — 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md's backup section (127-141) is generic and not HCI-specific; this should be revisited once CI-9 (physical isolation) is decided, since the backup story differs materially depending on whether HCI shares a Postgres instance with other services.
