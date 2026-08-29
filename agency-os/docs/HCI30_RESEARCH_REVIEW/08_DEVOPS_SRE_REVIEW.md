# 08 DEVOPS SRE REVIEW: DevOps / SRE / Infrastructure Review

> Independent analysis by Reviewer D (SRE / DevOps / Infrastructure) — part of the HCI-30 x AI LEGO V1 architecture re-research. This reviewer worked in isolation from the other 8 reviewers; any agreement with other reviewers noted elsewhere in this package (see `14_CONVERGENCE_MATRIX.md`) was independently re-derived, not copied.

---

## Narrative Analysis

## 08 — DevOps / SRE Review of the HCI-30 × AI LEGO V1 Blueprint

### Scope and method

This review reads all 23 documents in `D:\Work\agency-os\docs\HCI_AI_LEGO_Blueprint_v1` in full, plus `manifest.json`, and cross-checks the blueprint's infrastructure claims against the actual repository: `sg-deploy.sh`, the docker-compose files under `lobster-factory/infra/*`, the GitHub Actions workflows, and the existing backup/observability tooling. The central question assigned to this lens is: given that the operator runs everything on ONE OVH dedicated server (`ks-aw-01`, `149.202.64.114`, docker-compose + host nginx + `lobster-nginx`), how do we stop HCI-30's architecture from being designed as if it already were a global Kubernetes platform — and where does it under-specify real operational risk?

The verdict up front: **V1's high-level infra discipline is unusually good for a document written before code exists** — it explicitly says "start with a modular monolith," it separates control plane from data plane, and its own Gap Analysis (21) already rates SRE/DR readiness at only 5.0/10 and calls for numeric SLO/RTO/RPO. That self-awareness is a genuine strength and should be preserved. The problems this review finds are not "V1 is over-engineered" in the classic Kubernetes-Day-1 sense — it mostly avoids that trap on paper. The real problems are: (1) V1 describes an infrastructure *shape* in the abstract without ever touching the infrastructure that *already exists and already works* on `ks-aw-01`, creating a real risk of parallel reinvention; (2) several P0/enterprise commitments (tamper-evident WORM evidence, data residency, multi-region) are written as if infrastructure decisions, when they are actually irreversible product/legal commitments that need a human owner now, before Wave 4/9 coding starts; and (3) the document's own referenced SSOT file for current service placement does not exist, which is itself a process gap this review is obligated to flag under R4 (claim-before-verify).

### Corroboration against real infrastructure (not hearsay)

I verified, via `Bash`/`Glob` against the actual repo, that the following already exist and are production-proven on `ks-aw-01`-class infrastructure:

- `lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` (363 lines) — a working deploy pipeline with: pre-build image snapshot (`rollback-phase1.sh save`), Docker healthcheck wait loop, HTTP smoke-check gate (`next-admin /login`, `/api/ops/summary`, wordpress root, `node-api /health`), and **automatic rollback on smoke failure** (`AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=true` by default).
- Backup tooling: `backup-ks-aw-01.sh`, `verify-backup-ks-aw-01.sh`, `backup-eu-stack.sh`, `verify-backup-eu.sh`, `setup-offsite-backup.sh` — i.e., an already-implemented primary+verify+offsite backup discipline.
- Observability: `docker-compose.observability.yml` runs `grafana/loki:2.9.4`, `grafana/promtail:2.9.4`, `grafana/grafana:10.4.3` — centralized log aggregation already exists, plus Uptime Kuma for external status (per `CLAUDE.md`/AGENTS.md routing table).
- CI/CD: `.github/workflows/sg-deploy.yml`, `next-admin-typecheck.yml`, `release-gate-main.yml`, `trigger-infra-config-guard.yml` — typecheck gate, deploy gate, and infra-config guard workflows already run in production.
- Self-hosted job/workflow runtimes already on the box: `n8n` (`lobster-factory/infra/n8n/docker-compose.yml`), `trigger` (Trigger.dev, self-hosted per AGENTS.md credential rules), `supabase` (self-hosted Postgres, `lobster-factory/infra/supabase/docker-compose.yml`).
- `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md` — **does not exist.** Confirmed via `ls`: `cannot access 'D:\Work\agency-os\docs\infrastructure': No such file or directory`. This file is cited as the SSOT for exact service placement in four separate blueprint documents (12:225, 16:40, 20:205, 23:46).

This matters for the review's central question: V1 never once names any of this tooling. Docs 12, 13, 14, 21, and 22 describe deployment, backup, rollback, and observability requirements in the abstract, as if HCI-30 will need net-new infrastructure decisions, when in fact the operational hard part (deploy gate, rollback, backup, log aggregation) is already solved and running today. The risk this creates is exactly the kind of "zero rework" violation the project's own R0 discipline is built to prevent: an implementer reading Waves 0–12 in isolation could easily design a second, parallel CI/CD and backup system for HCI-30 instead of plugging into the one that already exists and is already load-bearing for WordPress, next-admin, and node-api.

### NOW / NEXT / FUTURE — the central deliverable

| Dimension | NOW (Day 1, single box) | NEXT (concrete trigger) | FUTURE (concrete trigger) |
|---|---|---|---|
| **App topology** | HCI-30 ships as a new bounded context inside the existing modular-monolith pattern (own Next.js/Node app, own docker-compose service, own Postgres schema) — reuses `sg-deploy.sh` + host-nginx + `lobster-nginx` routing already proven for next-admin. | Split out the Public Intelligence retrieval/scan pipeline (Wave 6) into its own container *only if* it starts starving the main app of CPU/RAM on the shared box (concrete trigger: sustained >70% box memory or CPU attributable to HCI-30 scan jobs, per the existing capacity monitor thresholds already defined in `AGENTS.md` §capacity — 60%/60%). | True microservices / separate deploy units *only when* a second physical box or a second paying enterprise tenant requires isolated blast radius — not before. |
| **DB tenancy** | Tier A: HCI-30 gets its own Postgres **schema** inside the already-running self-hosted Supabase Postgres instance, RLS-enforced, `tenant_id NOT NULL` per 11:75-84. No new DB container. | Tier B (dedicated DB container, same box) *when* an Enterprise customer's contract requires DB-level isolation (08:58 "dedicated DB option") — this is cheap on one box, just another container + volume. | Tier C/D (dedicated app+DB, dedicated region) *when* a signed enterprise/Group contract has a data-residency clause the current EU-only OVH box cannot satisfy. |
| **Backup/DR** | HCI-30 tables are added to the *existing* `backup-ks-aw-01.sh` + `verify-backup-ks-aw-01.sh` rotation. RESTRICTED-classification data (11:59-63) gets field-level encryption before it enters that shared backup stream. | Immutable/WORM evidence storage (P0-03, 21:84-99) *when* the first customer contract or legal-hold event actually requires tamper-evidence in a courtroom-defensible way — see the open legal tension flagged below. | Multi-region backup replication *when* data-residency contracts require a second geography. |
| **Deploy/rollback** | Reuse `sg-deploy.sh`'s proven pattern: pre-build snapshot → docker healthcheck wait → HTTP smoke-check → auto-rollback on failure. Add HCI-30's `/health` endpoint and login page to the existing `_smoke_check` calls. | Canary via **nginx weighted upstream** inside `lobster-nginx` (no new infra — nginx already supports `weight=`) *when* HCI-30 has enough traffic that an all-or-nothing rollout carries real user-facing risk. | Full blue/green (duplicate running stack) *when* a second box exists — a single dedicated server realistically cannot double its own resource footprint to run blue+green simultaneously without starving co-tenant services (WordPress, n8n, Supabase, etc.). |
| **Event/integration bus** | No message broker. HCI→AI LEGO integration is synchronous REST (`POST /cognitive/v1/workflows/execute`) with a poll or webhook-callback for long-running runs — see comparison table below. Internal domain events (07/10's `hci.*`/`cognitive.*` event names) are recorded as an outbox table and optionally relayed through the already-running n8n instance. | If workflow fan-out or true pub/sub semantics become necessary, evaluate Postgres `LISTEN/NOTIFY` or a lightweight embedded queue *before* reaching for a broker. | Kafka/NATS/managed event bus *only when* cross-service event volume or multi-consumer fan-out is measured and a synchronous/outbox approach demonstrably cannot keep up — not because "event bus" appears in the Foundation LEGO list (18:16). |
| **Observability** | HCI-30 logs ship into the existing Loki/Promtail/Grafana stack (`docker-compose.observability.yml`) and existing Uptime Kuma. No new stack. | Metrics (Prometheus) *when* HCI-30's intelligence-pipeline latency/throughput needs dashboarding beyond what log-derived metrics in Grafana/Loki can provide. | Distributed tracing across HCI↔AI LEGO calls *when* the integration is genuinely multi-hop enough that log correlation alone stops being sufficient for incident response. |
| **Region/residency** | Single EU region (the OVH box's actual location), stated honestly to customers as "EU-hosted, single region, no HA region failover yet." | — | Multi-region *only when* a signed enterprise/Group contract with a residency clause exists, per the trigger 12/16/20 already gesture at but never state as a number/event. |

This table is the concrete artifact the mission brief asks for: every FUTURE row has a named trigger, not "when we scale."

### Required 3-option comparison: deployment/integration architecture for HCI-30 joining the existing single-box stack

**A. Monolith vs. services for HCI-30 itself**

| | Option 1 — Single new container inside existing docker-compose | Option 2 — Split Web/API/Worker as 3 containers Day-1 (per 12:11-19 "Suggested application structure") | Option 3 — Separate Kubernetes namespace/cluster |
|---|---|---|---|
| Fits current baseline | Yes — same pattern as next-admin/node-api today | Partial — 3x the container/nginx-route surface for one operator | No — would be the first K8s anything in this stack |
| Operational cost (solo operator) | Low — one more service block in `docker-compose.yml`, one more `sg-deploy.sh` smoke-check line | Medium — 3 healthchecks, 3 rollback targets, more nginx routing | High — new control plane, new failure modes, new skill requirement |
| 30-year replaceability | Fine — internal bounded contexts inside the app preserve future extraction (12:8) | Slightly better isolation, but premature given no measured need | Best isolation, wildly disproportionate to team size |
| **Recommendation** | **Adopt.** Matches 12:6-9's own "modular monolith first" principle and the actual proven pattern. | Defer the Worker split specifically for Wave 6 (public-intelligence fetch/scan pipeline) — reuse the already-running Trigger.dev instance instead of hand-rolling a worker. | Reject for NOW; revisit only under the FUTURE trigger above. |

**B. Sync vs. async integration between HCI-30 and AI LEGO**

| | Option 1 — Pure synchronous REST (caller blocks for the full cognitive run) | Option 2 — Sync request + async callback/webhook (submit → 202 Accepted → `cognitive.run.completed` webhook or poll `GET /cognitive/v1/runs/{run_id}`) | Option 3 — Full event-driven (message bus, both products only communicate by event) |
|---|---|---|---|
| Matches doc 10's own contract shape | Partially — 10:118-121 shows both a REST execute endpoint *and* `cognitive.run.*` events, which is actually Option 2's shape already, just not named as such | **Yes, if made explicit** | No — 10 never proposes a broker |
| Fits "AI LEGO must remain usable when HCI is down and vice versa" (10:15-27) | Weak — synchronous coupling means a slow/degraded cognitive run blocks the HCI request thread and, transitively, HCI's own availability | Strong — HCI submits and moves on; a stuck AI LEGO run degrades gracefully into "still processing," not an HCI outage | Strong in theory, but the broker itself becomes a new shared-fate dependency neither product's own Invariant 3 ("systems must fail independently," 01:57-59) would tolerate on a single box with no broker HA |
| Infra cost NOW | None extra | None extra — reuses the REST endpoints already specified plus a simple `runs` table for polling, or a webhook back to HCI's own API | Requires standing up and operating a broker (Kafka/NATS/RabbitMQ) that presently does not exist anywhere in the stack |
| **Recommendation** | Reject as the sole transport — cross-model / CRITICAL-risk runs (10:174-176) can legitimately take minutes; blocking HTTP is the wrong shape. | **Adopt for V1.** This is already implicit in doc 10's endpoint list; the blueprint should say so explicitly rather than leaving the transport ambiguous. | Defer to FUTURE, and only if fan-out (many consumers per event) becomes real — not for a two-product, single-box integration. |

**C. Single-region vs. multi-region readiness**

| | Option 1 — Single region, honestly documented | Option 2 — Multi-region-ready schema, single-region infra (current V1 posture: 12:55-65, 20:182-196) | Option 3 — Actual multi-region infra Day-1 |
|---|---|---|---|
| Matches actual infra | Yes | Yes (schema stubs are cheap) | No |
| Risk | Customers may assume residency guarantees the product cannot yet honor if `home_region`/`allowed_regions` fields exist in the schema but aren't backed by real region separation | Low-cost hedge — `tenant.home_region` etc. as nullable/default fields cost nothing to add now and save a painful migration later | Wildly disproportionate cost for a solo operator with zero enterprise customers today |
| **Recommendation** | Combine with Option 2: **keep the schema stubs (cheap, prevents future migration pain) but the docs must say explicitly, in customer-facing trust material, that region enforcement is not yet implemented** — this is a truth-in-advertising / trust.aware-wave.com gap, not an infra gap. | **Adopt the schema-stub half now; do not build the enforcement half until the FUTURE trigger (signed contract with a residency clause) fires.** | Reject. |

### Findings requiring engineering or human attention

Beyond the tables above, four issues stand out as concrete, cited defects rather than restatements of the comparison:

1. **The SSOT the blueprint repeatedly points to does not exist.** Four documents (12, 16, 20, 23) tell the reader "maintain the authoritative current service placement at `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md`" as if it is a living artifact. It is not there. Under this project's own R4 discipline ("claim-before-verify"), a document that tells every future reader to trust a file that doesn't exist is itself a defect, and a cheap one to fix — either create the file (even a stub inventory table using the field list already specified in 23:69-86) or stop citing it as though it already exists.

2. **The disaster-recovery scenario list omits the single most likely failure mode of the actual baseline.** 13:142-157 lists "DB loss, credential leak, ransomware, operator error, bad deployment, bad migration, cloud outage, region outage, AI provider outage, search provider outage" but never names "the one dedicated server's hardware fails" — which, given there is exactly one physical machine (`ks-aw-01`) running every AwareWave service including this future HCI-30, is the actual dominant tail risk, not a generic "region outage." The existing `HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` (confirmed to exist) already treats this seriously at the ops-runbook layer; the product architecture doc should say so too, explicitly, so nobody designing HCI-30's data model assumes an HA substrate that doesn't exist.

3. **Tamper-evident/WORM evidence (P0-03, 21:84-99) is written as a pure engineering task, but it is actually gated by an unresolved legal tension the blueprint never surfaces**: HCI-30 promises customers a data-deletion/export lifecycle with a "deletion certificate" (12:145-161) and GDPR-style right-to-erasure obligations (11, throughout), while simultaneously requiring tamper-evident, optionally WORM-locked evidence records so history "cannot be silently rewritten" (21:98-99). Those two commitments are in real tension for any evidence record that later needs to be deleted under a lawful erasure request. There is no infra today (no S3-style Object Lock storage is in use anywhere in the verified stack) that would make WORM easy on a self-hosted OVH box without adding an object-storage layer, and no policy decision on how "immutable" evidence and "the right to be forgotten" coexist. This is a genuine value trade-off that needs a human decision (crypto-erasure of encrypted evidence vs. true storage-level immutability vs. narrower WORM scope limited to non-personal audit metadata) before Wave 4/P0-03 is implemented, not an engineering detail to improvise later.

4. **Nowhere does the blueprint mention the actual reverse-proxy topology** (host nginx terminates TLS, then hands off to a second nginx hop inside a container, `lobster-nginx`, for app-level routing) that every new subdomain (`hci.`, `cognitive.`, `portal.`, `docs.`, `trust.`, `status.`) will have to be wired into. Docs 03/20 treat subdomain rollout as a DNS/IA exercise; it is also two nginx configs, a TLS cert, and a `lobster-nginx` route entry, per new subdomain, on the one box. This should be a named, sequenced Wave-0/Gate-A task with the actual config file paths, not left implicit.

### What V1 gets right and should keep

- "Start with a modular monolith unless real scaling constraints require distributed services. Avoid premature microservices." (12:6-9) — correct, and should be the header of the DevOps section, not a buried line.
- Expand/Contract migration discipline (13:97-111), explicit rollback-dimension checklist (13:113-125), and Shadow-mode model/method comparison (13:77-95) are all appropriately scoped for a single-box, solo-operator system — none of them require new infrastructure to implement, they are process discipline on top of what exists.
- The Gap Analysis (21) already self-rates SRE/DR readiness at 5.0/10 and explicitly calls for numeric SLO/RTO/RPO (P1-05) rather than vague language — this review's job is mostly to hand back concrete NOW-calibrated numbers, not to invent the requirement.

### Recommended numeric SLO/RPO/RTO for NOW (single box, solo operator)

The blueprint leaves these as an open decision (16, item unlisted; 21 P1-05 flags the gap but gives no numbers). Calibrated to the actual baseline — one server, no HA, one operator, existing daily-verified backups — reasonable NOW targets are: **Availability 99.0–99.5%/month** (roughly 3.6–7.3 hours downtime budget, consistent with a single-box deploy-with-rollback posture, not a 99.9%+ HA claim the infra cannot back); **RPO ≤ 24h** (matches the existing daily backup+verify cadence, not continuous replication, which does not exist); **RTO ≤ 4h** for a full-service restore via the existing `verify-backup-ks-aw-01.sh`-validated backup, assuming a manual restore run by the operator (not an automated failover, which does not exist). These should be written down as real numbers in the blueprint, not left as "define at least: Availability, Latency, ..." — a target nobody can be held to is not a target.

### Bottom line

V1's infrastructure philosophy is sound (modular monolith, contract-first, expand/contract migrations, no premature multi-region). Its principal DevOps failure mode is *omission*, not *overreach*: it never touches the deploy/backup/observability/CI machinery that already works on `ks-aw-01`, creating real risk that HCI-30 gets built with a shadow, duplicate operational stack instead of joining the proven one. Its second failure mode is treating two genuinely hard, irreversible calls — WORM evidence vs. right-to-erasure, and the timing of any real multi-region investment — as engineering backlog items instead of the human/legal decisions they actually are.


---

## Change Items (14)

### D-01 — CURRENT_SERVICE_PLACEMENT.md is cited as SSOT in four docs but does not exist

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:225, 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md:40, 20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md:205, 23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:46 all instruct readers to treat `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md` as the authoritative current-service inventory. |
| **Problem** | The file does not exist. Verified via `ls "D:\Work\agency-os\docs\infrastructure"` -> 'No such file or directory'. Four separate blueprint documents point future readers/AI agents to a non-existent SSOT, which under this project's own R4 discipline (claim requires verification) is itself a defect and creates a false sense that service placement is already documented. |
| **Evidence** | Bash: `ls "D:\Work\agency-os\docs\infrastructure"` returned 'cannot access: No such file or directory'. Citations: 12:225, 16:40, 20:205, 23:46, 23:69-86 (specifies required fields but the file itself is absent). |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Create the file now as a stub inventory using the exact field schema already specified in 23:69-86 (service_id, public_hostname, role, audience, current_host, runtime/container, internal_port, reverse_proxy, database, persistent_volumes, secrets_source, backup_target, monitoring, public_exposure, network_zone, owner, verification_status), populated for the known service set already listed in 23:88-105. Low effort, closes an active documentation-truth gap before HCI-30 work begins. |
| **Why** | R4 ("claim-before-verify") and the blueprint's own Rule 3 (23) require this file to exist before it can be safely cited as truth. Leaving it absent means every future AI/engineer following the blueprint's own pointers hits a dead end at exactly the moment they need real service placement. |
| **Blast radius** | Documentation-only; zero runtime risk. Low effort (one file, ~14 known services). |
| **Migration impact** | — |
| **Rollback** | Delete the file; no other artifact depends on its existence yet. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### D-02 — Disaster-recovery scenario list omits the actual dominant failure mode: single dedicated-server hardware failure

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:142-157 lists DR scenarios: DB loss, credential leak, ransomware, operator error, bad deployment, bad migration, cloud outage, region outage, AI provider outage, search provider outage. |
| **Problem** | Every AwareWave service, including future HCI-30, runs on exactly one physical OVH dedicated server (ks-aw-01, confirmed baseline). 'Cloud outage' and 'region outage' are the wrong abstraction for a bare-metal single-box deployment; the actual dominant tail risk (disk/RAID/motherboard/host failure taking down the one physical machine) is never named, so nobody designing HCI-30's data model or backup cadence is forced to confront it. |
| **Evidence** | 13:142-157 (scenario list); mission-brief-verified baseline: single OVHcloud dedicated server, no managed cloud DB, no multi-region; corroborated by existence of `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` (found via Glob) which already treats single-box hardware loss seriously at the ops-runbook layer but that framing never made it into this product-architecture doc. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add 'single dedicated-server hardware/host failure' as an explicit named DR scenario in 13, cross-referencing the existing migration/DR runbook, and require that HCI-30's backup+restore acceptance test (13:140, Wave 1 acceptance) explicitly rehearse recovery onto a freshly provisioned box, not just a same-box restore. |
| **Why** | A DR scenario list that never names the actual most-likely failure mode of the real infrastructure gives false confidence; 'region outage' language invites engineers to design for the wrong failure class (e.g., over-investing in multi-AZ patterns that don't apply to bare metal) while under-investing in tested full-box restore drills. |
| **Blast radius** | Documentation change now; drives a real restore-drill requirement later (already implied by Wave 1/13's 'restore testing is mandatory'). |
| **Migration impact** | — |
| **Rollback** | Revert the doc edit; no runtime dependency. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### D-03 — Blueprint never references the deploy/rollback/smoke-check pipeline that already exists and works

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 14_ROADMAP_AND_DEFINITION_OF_DONE.md and 22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md describe Definition-of-Done and deployment waves (e.g. 14:117-134 'Implementation... Observability... Runbook... Rollback', 22 Waves 0-12) with zero reference to any existing deploy tooling. |
| **Problem** | A working deploy pipeline already exists: `lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` (363 lines) implements pre-build snapshot, docker healthcheck wait, HTTP smoke-check gate, and automatic rollback on smoke failure (default ON). None of the 23 blueprint documents name this file or this pattern. An implementer following only the blueprint's abstract 'Rollback' and 'Observability' line items in the Definition of Done (14:117-134) could plausibly build a second, parallel deploy/rollback system for HCI-30 instead of extending the proven one. |
| **Evidence** | Bash: `sg-deploy.sh` contains `ROLLBACK_SCRIPT="$(dirname "$0")/rollback-phase1.sh"`, `_smoke_check` function with calls to `next-admin /login`, `/api/ops/summary`, wordpress root, `node-api health`, and `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL:-true` gate (lines ~74-321 per grep output). Also `.github/workflows/sg-deploy.yml` exists. 14:117-134 and 22 Waves 0-12 make no mention of any of this. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add an explicit line to 12 or 14: 'HCI-30 deployment reuses the existing `sg-deploy.sh` pattern (pre-build snapshot, healthcheck wait, HTTP smoke-check, auto-rollback) — add HCI-30's health/login endpoints to the existing `_smoke_check` call list rather than building a parallel pipeline.' This also satisfies the project's own 'New deployment path SOP' 6-item checklist already codified in CLAUDE.md. |
| **Why** | Zero-rework principle (01, System Constitution) and the project's own R0 anti-duplication discipline. The gap is pure omission — the blueprint is otherwise correct that a deploy gate + rollback is required (14, 22) but fails to say 'the one you need already exists.' |
| **Blast radius** | Low — documentation directive; prevents future duplicated engineering effort of unknown but likely non-trivial size. |
| **Migration impact** | — |
| **Rollback** | N/A — additive documentation only. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

### D-04 — 'Event bus' listed as Foundation LEGO with no NOW/FUTURE staging or trigger condition

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md:16 lists 'event bus' as a Foundation LEGO example alongside IAM/audit/secrets/tenant-context; 17_REPOSITORY_LAYOUT_AND_PATHS.md:176 places 'event-bus' inside `shared/platform/`. |
| **Problem** | Naming 'event bus' as a Day-1 Foundation LEGO, with no qualifier, invites exactly the Day-1-Kafka overreach this review is explicitly tasked to prevent, on infrastructure that has zero message broker anywhere today. Neither doc distinguishes 'the logical capability of emitting/consuming domain events' (cheap: an outbox table) from 'a message broker' (expensive: new infra, new failure domain, new on-call burden for a solo operator). |
| **Evidence** | 18:9-17 (Foundation LEGO category, no staging note); 17:165-181 (`event-bus` listed flatly under `shared/platform/`); corroborating negative evidence: no Kafka/NATS/RabbitMQ found anywhere in the ~10 docker-compose files reviewed under `lobster-factory/infra/`. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a staging note wherever 'event bus' appears: NOW = Postgres outbox table + optional relay through the already-running self-hosted n8n instance; NEXT = Postgres LISTEN/NOTIFY if true pub/sub semantics are needed; FUTURE = an actual message broker, gated on a measured fan-out/throughput number the current approach can't meet — not gated on 'when we scale' generically. |
| **Why** | Anti-overengineering constraint explicitly names Day-1 Kafka as an anti-pattern to avoid; this doc currently leaves the door wide open for exactly that by not staging the requirement. |
| **Blast radius** | Documentation-only now; prevents a potentially large (broker install + ops burden) piece of premature infra later. |
| **Migration impact** | — |
| **Rollback** | Revert doc language; no runtime impact. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-05 — Wave 6 Public Intelligence pipeline implies a new 'Worker' component; existing self-hosted Trigger.dev is never considered

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:11-19 'Suggested application structure: Web / API / Worker / PostgreSQL / Object Storage'; 22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md Wave 6 (lines 157-189) describes a multi-step async pipeline (search -> isolated fetch -> malware/MIME checks -> normalization -> claim extraction -> verification -> admission gate) that is a textbook job-queue/worker workload. |
| **Problem** | A self-hosted Trigger.dev instance is already running on the box (`lobster-factory/infra/trigger/docker-compose.yml`, confirmed) and is already the project's designated async-job runtime per AGENTS.md's Trigger.dev credential rules. Neither 12 nor 22 mentions it. Building a bespoke 'Worker' component for Wave 6 would duplicate retry/queue/dashboard machinery Trigger.dev already provides. |
| **Evidence** | 12:11-19 (generic 'Worker' in suggested structure, no implementation guidance); 22:157-189 (Wave 6 pipeline description); corroboration: `lobster-factory/infra/trigger/docker-compose.yml` exists; AGENTS.md documents `tr_pat_*`/`tr_prod_*` credential separation for exactly this self-hosted Trigger.dev runtime. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Amend Wave 6 (22) and the application-structure section (12) to say HCI-30's Public Intelligence pipeline is implemented as Trigger.dev tasks on the existing self-hosted instance, not a new bespoke worker process, unless a specific limitation of Trigger.dev (e.g., needed isolation for untrusted-content fetch/malware scanning, per Wave 6's own threat model) forces a dedicated sandboxed runner for just that step. |
| **Why** | Zero-rework principle; avoids standing up a second job-queue system next to an already-proven one for no stated reason. |
| **Blast radius** | Medium — affects Wave 6 implementation design, but changes only which existing substrate hosts the jobs, not the pipeline logic itself. |
| **Migration impact** | — |
| **Rollback** | If Trigger.dev proves inadequate for the isolated-fetch/malware-scan step specifically, fall back to a dedicated sandboxed container for that one step only — does not require reverting the rest of the pipeline design. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-06 — Observability Foundation LEGO ignores the already-running Loki/Promtail/Grafana + Uptime Kuma stack

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 17_REPOSITORY_LAYOUT_AND_PATHS.md:177 lists 'observability' as a `shared/platform/` component with no further detail; 14_ROADMAP_AND_DEFINITION_OF_DONE.md:128 lists 'Observability' as a bare Definition-of-Done line item. |
| **Problem** | An observability stack already runs on the box: `docker-compose.observability.yml` deploys `grafana/loki:2.9.4`, `grafana/promtail:2.9.4`, `grafana/grafana:10.4.3`, plus Uptime Kuma for status monitoring (per AGENTS.md routing). Neither doc names this or directs HCI-30 to ship logs into it, creating risk of a parallel logging stack. |
| **Evidence** | Bash grep on `docker-compose.observability.yml` confirmed the three images/containers (`lobster-loki`, `lobster-promtail`, `lobster-grafana-obs`); AGENTS.md documents Uptime Kuma as the EU public-reachability monitor. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | State explicitly in 12 or 17 that HCI-30's structured logs/audit events (11:137-159's audit event schema) ship to the existing Loki/Promtail/Grafana pipeline via the same promtail scrape pattern already used by other services, and that public status surfaces (`status.aware-wave.com`, per 03/20) are backed by the existing Uptime Kuma instance, consistent with 03:190-198's own note that 'existing monitoring implementation' should be the status source of truth. |
| **Why** | Zero-rework; the blueprint document 03 already correctly says to reuse existing monitoring for `status.aware-wave.com` (03:196-198) but the observability requirement elsewhere (14, 17) doesn't carry that same discipline forward to logs/metrics. |
| **Blast radius** | Low — configuration/wiring only (promtail scrape config addition). |
| **Migration impact** | — |
| **Rollback** | Remove the scrape config entry; no data loss. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-07 — WORM/tamper-evident evidence requirement conflicts with data-deletion/erasure commitments; no infra or policy resolves it

| Field | Content |
|---|---|
| **Disposition** | DEFER |
| **Current V1** | 21_HCI_TOP_TIER_GAP_ANALYSIS.md:84-99 (P0-03 Evidence tamper-evidence: 'optional WORM/object-lock', 'hash-chain/Merkle verification', 'critical evidence cannot be silently rewritten without detection') vs. 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:145-161 (account termination lifecycle ending in 'Deletion certificate') and 11_SECURITY_PRIVACY_GOVERNANCE.md (customer data ownership, implicit erasure rights). |
| **Problem** | True storage-level WORM/object-lock immutability and a genuine right-to-erasure/deletion-certificate commitment are in direct tension for any evidence record containing personal data that must later be deleted under law. No blueprint document acknowledges this tension or picks a resolution (e.g., crypto-erasure of encrypted evidence vs. narrowing WORM scope to non-personal audit metadata vs. jurisdiction-specific carve-outs). Separately, no S3-Object-Lock-class storage was found anywhere in the verified infra (`lobster-factory/infra/*` compose files) — WORM as literally specified is not currently implementable on the existing self-hosted OVH stack without adding a new object-storage layer. |
| **Evidence** | 21:84-99; 12:145-161; 11 (customer data ownership section, no explicit erasure-vs-immutability reconciliation); infra check: no S3/object-lock-capable storage service found among reviewed docker-compose files (only self-hosted Postgres/Supabase, backup scripts appear to be rsync/tar-based per script naming, not object-lock-backed). |
| **Risk if unchanged** |  |
| **Alternative A** | Literal storage-level WORM/object-lock on all evidence (as P0-03 currently implies) — strongest tamper-evidence, but legally fragile against erasure requests and requires new object-storage infra not currently present. |
| **Alternative B** | Hash-chain over evidence with crypto-erasure support (delete the encryption key, not the ciphertext, to satisfy erasure while preserving chain integrity) — recommended: satisfies both goals with infra that can be built on the existing self-hosted Postgres stack. |
| **Alternative C** | No WORM/tamper-evidence at all, rely on audit logging only — cheapest, but fails the 30-year 'evidence cannot be silently rewritten' invariant (21:98-99) and undercuts the product's core credibility claim. |
| **Recommended** | Before Wave 4 (Evidence/Claim/Assessment core) or P0-03 implementation begins, produce a short ADR that explicitly resolves: what 'tamper-evident' means when the underlying personal data must be legally deletable (recommend: hash-chain over redacted/tombstoned records + crypto-erasure of the encrypted evidence payload, so the chain integrity survives deletion of the plaintext, rather than literal storage-level WORM on personal-data-bearing records). This is a genuine legal/product trade-off, not a pure engineering task. |
| **Why** | This is exactly the kind of underestimated risk (right to correction/appeals, data deletion, legal exposure) the mission brief calls out as a systematic blind spot. Coding P0-03 without resolving this first risks either (a) building WORM storage that later has to be torn out to honor an erasure request, or (b) silently deciding erasure trumps immutability (or vice versa) without anyone making that call on purpose. |
| **Blast radius** | High if unresolved before Wave 4 — could require re-architecting the evidence-integrity layer after real customer data is already in it. |
| **Migration impact** | — |
| **Rollback** | N/A — this is a pre-implementation policy decision, not a reversible code change. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### D-08 — HCI-30's Postgres tenancy tier is unspecified — risk of provisioning a needless dedicated DB container Day-1

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:41-53 defines Tier A (shared app+shared DB+RLS) through Tier D (dedicated region), but never states which tier HCI-30 starts at, and 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:58 lists 'dedicated DB option' under Enterprise without saying when. |
| **Problem** | Without an explicit NOW tier, an implementer could reasonably provision a brand-new dedicated Postgres container for HCI-30 from day one 'to be safe,' when the already-running self-hosted Supabase Postgres instance (confirmed via `lobster-factory/infra/supabase/docker-compose.yml`) can host HCI-30's schema with RLS at effectively zero marginal infra cost, consistent with 12's own Tier A default and 11:75-84's tenant_id/RLS requirement. |
| **Evidence** | 12:41-53 (tier definitions, no default stated); 08:58 (dedicated DB mentioned only for Enterprise, no NOW/FUTURE marker); infra check: `lobster-factory/infra/supabase/docker-compose.yml` confirms a self-hosted Postgres/Supabase instance already running on the box. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | State explicitly in 12 (or the new CURRENT_SERVICE_PLACEMENT.md, D-01): 'HCI-30 starts at Tier A — new schema inside the existing self-hosted Supabase Postgres instance, RLS-enforced. Tier B (dedicated DB container, same box) is adopted only when a specific Enterprise contract requires DB-level isolation.' |
| **Why** | Anti-overengineering constraint; a dedicated DB container Day-1 for a zero-customer product is pure premature infrastructure with no offsetting risk reduction. |
| **Blast radius** | Low — clarifies default, doesn't change any already-built infra. |
| **Migration impact** | — |
| **Rollback** | N/A — documentation clarification. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-09 — No canary/blue-green strategy defined, and single-box resource reality is never acknowledged

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:77-95 defines Shadow Mode for model/method versions but never addresses application-level canary or blue-green deployment for the HCI-30 web app itself. |
| **Problem** | Blue/green deployment requires roughly double the resource footprint running simultaneously; on a single dedicated server already hosting WordPress, next-admin, node-api, Supabase, n8n, Trigger.dev, and observability containers, true blue/green for HCI-30 would compete for RAM/CPU with co-tenant production services (capacity is already monitored tightly per AGENTS.md capacity-check thresholds of 60%/60%). This constraint is never named, so a naive reading of 'production hardening' language elsewhere in the blueprint (14, 21, 22) could lead someone to assume blue/green is the target release strategy. |
| **Evidence** | 13:77-95 (Shadow Mode only, no app-level canary/blue-green section); AGENTS.md capacity-check routing table references 60%/60% memory/disk thresholds for ks-aw-01 specifically because it's a single shared box. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add an explicit release-strategy note to 13: NOW = rolling redeploy via `sg-deploy.sh`'s existing snapshot+healthcheck+smoke-check+auto-rollback pattern (already proven, zero extra resource cost); NEXT = nginx weighted-upstream canary inside the existing `lobster-nginx` container (no new infra, nginx already supports `weight=` routing) once HCI-30 has meaningful production traffic; FUTURE = full blue/green only once a second box exists, since single-box blue/green would starve co-tenant services. |
| **Why** | Prevents a mismatch between aspirational 'production hardening' language and actual single-box resource constraints; gives a concrete, low-cost intermediate step (nginx-weighted canary) that the blueprint currently skips straight past. |
| **Blast radius** | Low — documentation now; the NEXT-tier nginx-weighted canary is a small config change when actually needed. |
| **Migration impact** | — |
| **Rollback** | N/A — additive guidance. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-10 — No numeric SLO/RPO/RTO targets defined anywhere, despite 21's own gap analysis flagging this as unresolved

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:177-189 says 'Define at least: Availability, Latency, Data Durability, Backup Success, Restore Success, Security Response, Critical Workflow Success' with no numbers; 21_HCI_TOP_TIER_GAP_ANALYSIS.md P1-05 (lines 281-293) explicitly flags 'Numerical SLO / RTO / RPO' as a P1 gap still to be produced. |
| **Problem** | 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md's 20-item open-decisions list (98-121) does not even include SLO/RTO/RPO numbers as a tracked open decision, meaning the gap 21 correctly identifies has no assigned owner or next step anywhere else in the document set. Left unresolved, this invites either an unrealistically high SLA promise (e.g., 99.9%+ marketed to enterprise buyers) that a single, no-HA dedicated server cannot honor, or no target at all, which makes 'reliability' unmeasurable exactly as 21 warns. |
| **Evidence** | 13:177-189 (no numbers); 21:281-293 (P1-05, flags gap, no numbers); 16:98-121 (20-item list, SLO/RTO/RPO absent). |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add concrete NOW-calibrated numbers, derived from the actual verified baseline (single box, no HA, daily-verified backups via `verify-backup-ks-aw-01.sh`): Availability 99.0-99.5%/month; RPO <= 24h; RTO <= 4h for a manual full-service restore. Add this as open-decision item #21 in 16, owned before Gate C (paid Personal/Pro) per 22's own release-gate structure, since Gate C already requires 'restore test.' |
| **Why** | A target nobody can be held to is not a target; the project's own gap analysis (21) already says this is missing — this finding supplies the concrete numbers calibrated to the real infrastructure rather than leaving it abstract. |
| **Blast radius** | Low — documentation; downstream effect is realistic customer-facing SLA language instead of an unbacked promise. |
| **Migration impact** | — |
| **Rollback** | N/A — additive. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-11 — Reverse-proxy double-hop (host nginx + lobster-nginx) never mentioned for new subdomain rollout

| Field | Content |
|---|---|
| **Disposition** | ADD |
| **Current V1** | 03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md and 20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md treat `hci.`, `cognitive.`, `portal.`, `docs.`, `trust.`, `status.` subdomain rollout purely as a DNS/information-architecture exercise (e.g. 03:11-39, 20:37-49). |
| **Problem** | The actual routing path on ks-aw-01 is host-level nginx (TLS termination) handing off to a second nginx instance running inside a container (`lobster-nginx`) for app-level routing. Neither doc names this two-hop reality or the concrete config files that must be touched per new subdomain. An implementer following only 03/20 could treat 'add hci.aware-wave.com' as a DNS-only task and miss the TLS cert issuance + two separate nginx route additions it actually requires. |
| **Evidence** | 03:11-39 (subdomain map, DNS/IA framing only); 20:37-49 (state table, no routing-mechanism detail); mission-brief-verified baseline explicitly states the two-hop nginx topology (host nginx TLS termination + lobster-nginx container for app routing). |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | Add a 'Deployment mechanics' subsection to 03 or 20 (or fold into the ADR called for in 16, item 'Subdomain / gateway deployment ADR', already listed at 16:196-206) that names the two-hop nginx topology explicitly and lists it as a concrete pre-Gate-A task per subdomain: DNS record -> TLS cert -> host-nginx vhost -> lobster-nginx route entry. |
| **Why** | Prevents a DNS-only mental model of subdomain rollout from causing a late surprise when hci.aware-wave.com is 'launched' at the DNS level but returns a 502 because the app-level router was never updated. |
| **Blast radius** | Low — documentation; prevents a real but easily-fixed deployment-day surprise. |
| **Migration impact** | — |
| **Rollback** | N/A — additive guidance. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | NO |

### D-12 — HCI-30 <-> AI LEGO integration transport (sync vs async) is implicit, not decided

| Field | Content |
|---|---|
| **Disposition** | CHANGE |
| **Current V1** | 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:113-121 shows both a REST 'execute' endpoint and event names (`cognitive.run.started/completed/failed`) without stating whether v1 is synchronous request/response, sync-submit-plus-async-callback, or full event-driven. |
| **Problem** | This ambiguity is exactly the sync-vs-async / REST-vs-event-driven decision this review was explicitly tasked to produce a 3-option comparison for (see narrative). Left unresolved, an implementer could build a blocking synchronous call for what 10 itself acknowledges can be a CRITICAL-risk, multi-model, human-reviewed run (10:174-176) that may legitimately take minutes -- directly undermining Invariant 3 ('systems must fail independently', 01:57-59) since a slow AI LEGO run would then also stall HCI-30's own request thread. |
| **Evidence** | 10:113-121 (endpoint list mixes both shapes); 10:174-176 (CRITICAL risk tier implies long-running, human-reviewed runs); 01:57-59 (Invariant 3, systems must fail independently). |
| **Risk if unchanged** |  |
| **Alternative A** | Pure synchronous REST (blocks for full run) -- rejected, see problem statement. |
| **Alternative B** | Sync submit + async webhook/poll for completion -- recommended. |
| **Alternative C** | Full event-driven via message broker -- rejected for NOW, no broker infra exists and two-product fan-out doesn't justify one yet; revisit under the event-bus FUTURE trigger in D-04. |
| **Recommended** | Adopt Option 2 from the 3-option comparison in the narrative: synchronous submit (HTTP 202 Accepted) + async completion via webhook callback to HCI or polling `GET /cognitive/v1/runs/{run_id}`. No message broker required; reuses the endpoint shapes 10 already sketches. State this explicitly in 10 rather than leaving the transport implicit. |
| **Why** | A genuine architecture decision with real failure-mode consequences (thread-blocking coupling vs. graceful degradation) that the current doc gestures at but never commits to -- exactly the kind of open ambiguity the mission brief says should become an ADR rather than be silently assumed by whoever codes it first. |
| **Blast radius** | Medium — affects the shape of the integration contract (10) and both products' API surfaces, but is still pre-implementation, so cheap to decide now vs. expensive to change after both sides have shipped clients. |
| **Migration impact** | — |
| **Rollback** | If async callback proves insufficient (e.g., client can't receive webhooks), fall back to polling-only, which is a strict subset of the same design and requires no contract change. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### D-13 — Multi-region / data-residency buildout has no stated trigger condition, only phase ordering

| Field | Content |
|---|---|
| **Disposition** | DEFER |
| **Current V1** | 08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:70 ('Group' edition adds 'multi-region support'); 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:55-65 (data residency fields); 22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md Gate F ('Multi-region/residency... dedicated/private deployment... regional DR... migration tooling'). |
| **Problem** | These are correctly sequenced as late-phase/Gate-F work (good -- matches anti-overengineering intent), but none of them state a concrete trigger event, only relative ordering ('Group/Private' phase, 'Gate F'). 'Do it later' without a named trigger tends to either get built too early (someone decides 'later' has arrived based on vibes) or never gets prioritized when an actual enterprise deal needs it. |
| **Evidence** | 08:70 (no trigger, just edition tier); 12:55-65 (schema fields defined, no activation trigger); 22:339-344 (Gate F description, ordering only, no numeric/event trigger). |
| **Risk if unchanged** |  |
| **Alternative A** | Build multi-region infra speculatively ahead of any contract -- rejected, classic Day-1-overreach the mission brief warns against. |
| **Alternative B** | Keep schema stubs now, gate actual infra on a signed contract's residency clause -- recommended. |
| **Alternative C** | Remove residency schema fields entirely until needed -- rejected, removing cheap-now fields creates an expensive later migration; keeping nullable stub columns costs nothing. |
| **Recommended** | Add an explicit trigger to Gate F and the Group edition description: 'Multi-region/residency infrastructure work begins only when a signed enterprise or Group contract contains a data-residency clause the current single-region OVH deployment cannot satisfy -- not on a calendar or maturity-vibes basis.' Keep the schema-stub fields (tenant.home_region etc.) as-is now since they are cheap; gate only the infrastructure buildout. |
| **Why** | Directly addresses the mission brief's requirement that every FUTURE item state a concrete trigger condition, not just 'when we scale.' The phase-ordering in 22 is otherwise sound and should be kept -- this is a refinement, not a rejection. |
| **Blast radius** | Low now (documentation trigger clarification); the deferred work itself is appropriately large/high-cost, which is exactly why it should stay gated on a real signal. |
| **Migration impact** | — |
| **Rollback** | N/A -- this keeps the current deferral, just adds the missing trigger condition. |
| **30-year consequence** | — |
| **Confidence** | Medium |
| **Requires human decision** | YES |

### D-14 — 'Modular monolith first' principle is correct and should be preserved, but stated as an isolated line rather than the load-bearing header it deserves to be

| Field | Content |
|---|---|
| **Disposition** | KEEP |
| **Current V1** | 12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:6-9: 'Start with a modular monolith unless real scaling constraints require distributed services. Maintain internal bounded contexts so later extraction is possible. Avoid premature microservices.' |
| **Problem** | This is the single most important sentence in the entire blueprint for this review's lens, and it is correct -- but it appears as three unadorned lines at the top of doc 12 with no connection to the actual proven single-box deployment pattern (`sg-deploy.sh`, docker-compose, host+lobster nginx) that makes it concretely actionable. As written it reads as generic best-practice advice rather than a binding decision tied to the real infrastructure. |
| **Evidence** | 12:6-9. |
| **Risk if unchanged** |  |
| **Alternative A** | — |
| **Alternative B** | — |
| **Alternative C** | — |
| **Recommended** | KEEP the principle verbatim. Strengthen it by explicitly tying it to the real deployment substrate: 'HCI-30 ships as one more docker-compose service on the existing ks-aw-01 box, deployed via the existing sg-deploy.sh pattern, until a specific measured constraint (see NOW/NEXT/FUTURE table) forces extraction.' This closes the gap identified in D-03 without changing the underlying decision. |
| **Why** | Confirms and reinforces an already-correct decision; the fix is to make it load-bearing (tied to real tooling) rather than aspirational prose, addressing the same root gap as D-03 from the other direction. |
| **Blast radius** | None — this is an endorsement plus a wording strengthening, not a design change. |
| **Migration impact** | — |
| **Rollback** | N/A. |
| **30-year consequence** | — |
| **Confidence** | High |
| **Requires human decision** | NO |

---

## Open Assumptions Flagged by This Reviewer

- Assumed 'ks-aw-01' physically resides in the same OVH facility/region the blueprint's 'ns3006986.ip-149-202-64.eu' hostname implies (EU) — not independently re-verified via WHOIS/RIPE in this session beyond the mission brief's stated baseline.
- Assumed the existing backup scripts (backup-ks-aw-01.sh etc.) use rsync/tar-style backup rather than any object-lock-capable storage, based on filename/tooling conventions observed elsewhere in the repo (e.g. eu-backup naming) — did not open and fully read every backup script's internal implementation.
- Assumed Trigger.dev self-hosted instance has sufficient isolation/sandboxing headroom to safely run Wave 6's untrusted-content fetch/malware-scan step; did not verify Trigger.dev's actual sandboxing model against Wave 6's specific SSRF/malware threat list (22:181-187).
- Assumed no additional infrastructure (e.g., a second VPS still silently running, a cloud DB, a CDN with edge compute) exists beyond what the mission brief and repo file evidence surfaced — did not SSH into ks-aw-01 directly in this review.

---

## Open Risks Flagged by This Reviewer

- WORM/tamper-evidence vs. right-to-erasure tension (D-07) is unresolved and, if coded as literally specified in 21 P0-03 before a policy decision, could require a costly re-architecture of the evidence-integrity layer after real customer data exists in it.
- Single dedicated-server hardware failure (D-02) remains the actual dominant DR risk and has no rehearsed full-box restore drill evidenced in this review (existing scripts appear to be same-box verify, not cross-box restore-drill proven).
- No enforcement exists today for any data-residency promise implied by the schema stubs (home_region, allowed_regions, etc.) — if sales/marketing material gets ahead of the schema-stub-only reality, this becomes a trust/compliance liability with enterprise buyers before Gate F infrastructure exists.
- Sync-vs-async integration transport for HCI<->AI LEGO (D-12) remains a human decision; if left undecided into implementation, whichever engineer/agent codes it first will pick by default, likely the simpler-looking but riskier pure-synchronous option.
- Capacity risk: adding HCI-30 (a new app + Public Intelligence fetch/scan pipeline) to an already resource-monitored single box (60%/60% memory/disk thresholds per existing capacity checks) could push the shared box into the 🟡/🔴 capacity zone faster than anticipated; no capacity budget for HCI-30 specifically is defined anywhere in the blueprint.
