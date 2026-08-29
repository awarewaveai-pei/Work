# 13 Architecture Options Matrix

> The mission brief requires every major design decision to be presented as a genuine multi-option comparison, not a single answer. This file consolidates the option matrices independently produced by Reviewer B (Database / Data Architecture) and Reviewer D (SRE / DevOps / Infrastructure) — reproduced here with attribution, not re-derived, so the reasoning traceable in `06_DATABASE_ARCHITECTURE_REVIEW.md` and `08_DEVOPS_SRE_REVIEW.md` stays intact. Both reviewers converged independently on the same anti-overengineering posture (see `14_CONVERGENCE_MATRIX.md` CM-15) without having seen each other's work.

---

## 1. Core database architecture (Reviewer B)

| Dimension | **A. PostgreSQL modular monolith** (one instance, schema-per-bounded-context, insert-only ledgers) | **B. PostgreSQL + dedicated event store** (full event-sourcing/CQRS) | **C. PostgreSQL + graph DB** (relational core + Neo4j/Memgraph) |
|---|---|---|---|
| Complexity | Low-moderate — one query language, one transaction model. | High — two paradigms, eventual consistency, replay tooling. | Moderate-high — two databases, cross-DB joins in app code. |
| Correctness | Strong — ACID across all domain writes, native FK/check constraints. | Strong for "what happened," weaker for "is current state consistent right now" (projection lag). | Weak at the boundary — nothing enforces referential integrity between the two stores. |
| Maintainability | High — one skill set, matches actual team (solo operator + AI agents). | Low for a small team — highest-cost-to-learn/debug pattern in the field. | Low-moderate — two operational surfaces that can drift. |
| Blast radius | Contained to one instance; mitigated by RLS + insert-only ledgers + partitioning. | Event-log corruption/bad replay can corrupt every downstream read model at once — larger than A. | Sync bug between stores can silently produce wrong answers in either, undetected. |
| Vendor lock-in | Very low — PostgreSQL is 30-year-proven, license-free (matches V1 Invariant 4, 01:61-68). | Depends — commercial event-store = real lock-in; hand-rolled = bespoke/undocumented. | Real — Cypher/graph-vendor query logic becomes load-bearing and non-portable. |
| Cost (current infra) | Fits existing single self-hosted Postgres with zero new infrastructure. | Meaningfully higher — new component or substantial in-house engineering. | Meaningfully higher — second stateful service on the same single box. |
| Operations | One thing to operate; existing runbooks extend naturally. | New operational discipline (projection rebuild, event versioning) that doesn't exist in this org today. | New backup/restore/DR runbook needed for a second stateful system. |
| Migration cost later | Low to escalate a *narrow slice* into B or C later — insert-only ledgers are already "event-log-shaped." | High to retrofit down to A — app code structurally coupled everywhere. | Moderate — Apache AGE first, standalone graph DB only if proven insufficient. |
| 30-year durability | Highest — PostgreSQL's own track record + smallest surface area. | Uncertain — event-sourcing systems are notoriously hard to hand off across teams/decades. | Uncertain — depends on graph vendor's own 30-year survival. |

**Recommendation: Option A**, with two narrow, explicitly-scoped escalation paths kept open (not adopted wholesale):
1. Insert-only ledgers for Evidence/Claim/Assessment/Decision already capture ~80% of event-sourcing's value (immutable history, replayable state) without CQRS's projection-consistency complexity. Full event-sourcing stays deferred, revisited only for a specific narrow need (e.g., Wave 5 intelligence-math versioning recomputing historical confidence scores under a new model version).
2. Apache AGE (graph extension running *inside* PostgreSQL — same backups, same transactions, same box) is the correct graph answer today. A standalone graph DB is gated behind measured trigger conditions (see below), not adopted speculatively.

**Graph DB adoption trigger (the "when," not "maybe" the brief asks for)** — stay relational (with recursive CTEs, then Apache AGE) until at least one becomes true in production: relationship-network traversal becomes a latency-sensitive p95 UI feature (not a background report); measured recursive-CTE p95 latency exceeds a pre-committed UI budget (e.g. 300-500ms) at real row counts; or the product needs graph *algorithms* (centrality, community detection, risk-weighted shortest path) that Postgres genuinely cannot do efficiently.

---

## 2. RLS vs. DB-per-tenant (Reviewer B)

| Tier | Recommendation | Why |
|---|---|---|
| Personal / Professional / Team (shared, Tier A) | **RLS**, made *mandatory* (not "where appropriate") | DB-per-tenant on a single OVH box means N databases each needing their own connection-pool slot, migration run, backup/restore cycle, and monitoring — operational surface area that multiplies linearly with customer count on infrastructure that cannot elastically absorb it. |
| Enterprise / Group / Private (Tier B/C/D) | **Dedicated DB/instance as a hard `Entitlement`** (not an ad hoc per-customer negotiation) | V1's own `Product/Plan/Feature/Entitlement/Limit` abstraction (08:106-129) already has the right shape — dedicated-DB should be one more Entitlement row, formally decided at plan-definition time. |

**Critical gap identified**: the only automated test today (13:26-31) checks that a tenant-owned table *has* a `tenant_id` column — not that an RLS policy is actually enabled and blocks a crafted cross-tenant read under a non-superuser role. A table can pass the current test and still be wide open. See `15_RISK_REGISTER.md` RISK for the CI-blocking test this requires (independently corroborated by Reviewers C and H — see `14_CONVERGENCE_MATRIX.md` CM-02).

---

## 3. Deployment / integration architecture for HCI-30 joining the existing single-box stack (Reviewer D)

### 3a. Monolith vs. services for HCI-30 itself

| | Option 1 — Single new container inside existing docker-compose | Option 2 — Split Web/API/Worker as 3 containers Day-1 | Option 3 — Separate Kubernetes namespace/cluster |
|---|---|---|---|
| Fits current baseline | Yes — same pattern as next-admin/node-api today | Partial — 3x the container/nginx-route surface for one operator | No — first K8s anything in this stack |
| Operational cost (solo operator) | Low — one more `docker-compose.yml` block, one more `sg-deploy.sh` smoke-check line | Medium — 3 healthchecks, 3 rollback targets, more nginx routing | High — new control plane, new failure modes, new skill requirement |
| 30-year replaceability | Fine — internal bounded contexts preserve future extraction | Slightly better isolation, but premature given no measured need | Best isolation, wildly disproportionate to team size |
| **Recommendation** | **Adopt.** Matches doc 12's own "modular monolith first" principle. | Defer the Worker split specifically for Wave 6 (public-intelligence fetch/scan) — reuse the already-running Trigger.dev instance instead of hand-rolling a worker. | Reject for NOW; revisit only under a named FUTURE trigger (second physical box, or isolated-blast-radius enterprise requirement). |

### 3b. Sync vs. async integration between HCI-30 and AI LEGO

| | Option 1 — Pure synchronous REST | Option 2 — Sync request + async callback/webhook (202 Accepted → `cognitive.run.completed` event or poll) | Option 3 — Full event-driven (message bus) |
|---|---|---|---|
| Matches doc 10's own contract shape | Partially — 10:118-121 already shows both a REST execute endpoint *and* `cognitive.run.*` events, i.e. Option 2's shape, just not named as such | **Yes, if made explicit** | No — doc 10 never proposes a broker |
| Fits "each system fails independently" (Invariant 3, 01:57-59 / 10:15-27) | Weak — a slow cognitive run blocks the HCI request thread | Strong — HCI submits and moves on | Strong in theory, but the broker itself becomes a new shared-fate dependency with no HA on a single box |
| Infra cost NOW | None extra | None extra — reuses REST endpoints already specified plus a `runs` table | Requires standing up a broker (Kafka/NATS/RabbitMQ) that does not exist anywhere in the stack today |
| **Recommendation** | Reject as sole transport — cross-model/CRITICAL-risk runs can legitimately take minutes. | **Adopt for V1.** Already implicit in doc 10; should be stated explicitly. | Defer to FUTURE, only if real multi-consumer fan-out emerges — not for a two-product, single-box integration. |

### 3c. Single-region vs. multi-region readiness

| | Option 1 — Single region, honestly documented | Option 2 — Multi-region-ready schema, single-region infra (V1's current posture) | Option 3 — Actual multi-region infra Day-1 |
|---|---|---|---|
| Matches actual infra | Yes | Yes (schema stubs are cheap) | No |
| Risk | Customers may over-assume residency guarantees if left unstated | Low-cost hedge — nullable `home_region`/`allowed_regions` fields cost nothing now, save a painful migration later | Wildly disproportionate cost for a solo operator with zero enterprise customers today |
| **Recommendation** | Combine with Option 2 — schema stubs kept, but customer-facing trust material (`trust.aware-wave.com`) must say explicitly that region enforcement is not yet implemented. | **Adopt the schema-stub half now**; do not build enforcement until a signed contract with a residency clause fires the trigger. | Reject. |

---

## 4. NOW / NEXT / FUTURE infrastructure table (Reviewer D)

> The mission brief's central anti-overengineering deliverable: every FUTURE row below carries a *named, measurable trigger* — never "when we scale."

| Dimension | NOW (Day 1, single box) | NEXT (concrete trigger) | FUTURE (concrete trigger) |
|---|---|---|---|
| **App topology** | HCI-30 ships as a new bounded context inside the existing modular-monolith pattern — reuses `sg-deploy.sh` + host-nginx + `lobster-nginx` routing already proven for next-admin. | Split Public Intelligence retrieval/scan (Wave 6) into its own container *only if* it starves the main app — trigger: sustained >70% box memory/CPU attributable to HCI-30 scan jobs, per existing 60%/60% capacity thresholds. | True microservices / separate deploy units *only when* a second physical box or a second paying enterprise tenant requires isolated blast radius. |
| **DB tenancy** | Tier A: own Postgres schema inside the already-running self-hosted Supabase instance, RLS-enforced, `tenant_id NOT NULL`. No new DB container. | Tier B (dedicated DB container, same box) *when* an Enterprise contract requires DB-level isolation. | Tier C/D (dedicated app+DB, dedicated region) *when* a signed contract has a residency clause the current EU-only box cannot satisfy. |
| **Backup/DR** | HCI-30 tables added to the existing `backup-ks-aw-01.sh` + `verify-backup-ks-aw-01.sh` rotation; RESTRICTED data field-encrypted before entering that stream. | Immutable/WORM evidence storage *when* the first customer contract or legal-hold event actually requires courtroom-defensible tamper-evidence. | Multi-region backup replication *when* residency contracts require a second geography. |
| **Deploy/rollback** | Reuse `sg-deploy.sh`: pre-build snapshot → healthcheck wait → HTTP smoke-check → auto-rollback on failure. | Canary via nginx weighted upstream (already supported, no new infra) *when* traffic makes all-or-nothing rollout carry real user-facing risk. | Full blue/green *when* a second box exists — a single dedicated server cannot double its footprint without starving co-tenant services. |
| **Event/integration bus** | No broker. Sync REST + async callback (§3b Option 2). Internal domain events recorded as an outbox table, optionally relayed through the already-running n8n instance. | Postgres `LISTEN/NOTIFY` or a lightweight embedded queue *if* fan-out becomes necessary — evaluated before reaching for a broker. | Kafka/NATS *only when* measured event volume/fan-out demonstrably cannot be served by the outbox approach — not because "event bus" appears in the Foundation LEGO taxonomy. |
| **Observability** | HCI-30 logs ship into the existing Loki/Promtail/Grafana stack + existing Uptime Kuma. No new stack. | Prometheus metrics *when* pipeline latency/throughput needs dashboarding beyond log-derived metrics. | Distributed tracing across HCI↔AI LEGO calls *when* the integration is genuinely multi-hop enough that log correlation stops being sufficient. |
| **Region/residency** | Single EU region (the OVH box's actual location), stated honestly to customers. | — | Multi-region *only when* a signed enterprise/Group contract with a residency clause exists. |

---

## 5. Cross-cutting finding: parallel-reinvention risk

Reviewer D verified (via direct `Bash`/`Glob` against the repo, not inference) that a working deploy pipeline (`sg-deploy.sh`, 363 lines, with pre-build snapshot, healthcheck wait, HTTP smoke-check gate, and automatic rollback), a primary+verify+offsite backup discipline, a Loki/Promtail/Grafana observability stack, and CI/CD typecheck/deploy/infra-config-guard gates **already exist and are production-proven on `ks-aw-01`** — yet none of the 24 blueprint documents name any of this tooling. The concrete risk: an implementer reading the blueprint's Waves in isolation could design a second, parallel CI/CD and backup system for HCI-30 instead of plugging into the one already load-bearing for WordPress, next-admin, and node-api — a direct "zero rework" violation of this project's own R0 discipline. This is folded into `17_TECH_DEBT_PREVENTION.md`.
