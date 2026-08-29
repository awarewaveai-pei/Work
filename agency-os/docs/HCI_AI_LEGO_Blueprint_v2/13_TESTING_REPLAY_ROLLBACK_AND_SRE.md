# 13 — Testing, Replay, Rollback & SRE

## Testing layers

Required: Unit, Integration, Contract, E2E, Security, Bias, Calibration, Counterfactual, Replay, Restore, Decision Safety, Architecture Rules.

## Architecture tests

Examples:

1. tenant-owned entity must have `tenant_id`
2. **RLS policy is enabled AND actually blocks a crafted cross-tenant read under a non-superuser role** — changed in V2, see §Enforcement Discipline below (item 1 alone, unchanged from V1, only checks column presence and is not sufficient)
3. HCI core may not import billing provider
4. HCI core may not import AI vendor
5. no direct DB dependency between HCI and Cognitive OS
6. sensitive tables require audit
7. peer products communicate only by contract/API/event
8. **no destructive migration statement (`DROP`/`TRUNCATE`/destructive `ALTER`) against any table tagged `critical` or `evidence`** — new in V2, see §Enforcement Discipline below

## Enforcement Discipline *(new section in V2 — the single most consequential change in this document)*

**These architecture tests are CI-blocking gates, not illustrative examples.** V1 listed the tests above as "examples" with no stated requirement that they actually run and block a merge. An independent Red Team review, cross-checked against every other reviewer's recommendation for what to keep unchanged in V1, found that **zero of 16 concrete attack scenarios against the architecture were blocked by anything the system as specified actually enforced** — for the two most catastrophic failure modes in this system (irreversible destructive migration against evidence tables; cross-tenant data leak), enforcement depended entirely on an engineer or AI agent remembering a written rule, with no automated gate that fails the build. This is the same category of gap this organization's own broader operating practice (`agency-os/AGENTS.md`) already treats as unacceptable elsewhere in this repository — HCI-30 handles more sensitive data than almost anything else in this org's portfolio and cannot be the one place that still relies on prose-only discipline.

Add: a CI-blocking migration linter (item 8 above) and the cross-tenant RLS read test (item 2 above) as **required**, not optional, gates before merge — not "examples," a mandatory suite. See `01_SYSTEM_CONSTITUTION.md` Invariant 8 for this elevated to a constitutional principle. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-13, and the cross-check section of that same file.

## Counterfactual tests

Given identical behavior data, changing irrelevant identity features must not alter unrelated analysis.

## Calibration

Track: False Positive, False Negative, Precision, Recall, Calibration. Use historical outcomes to determine whether risk models are systematically over- or under-sensitive.

## Model disagreement

Never silently average incompatible conclusions. Use `MODEL_DISAGREEMENT` and explain why.

## Replay

Historical decision reproduction should preserve: Historical HCI evidence, HCI method version, HCI policy version, AI LEGO Atlas hash, AI LEGO workflow version, AI model metadata, Decision policy.

**Changed in V2**: see `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Evidence / Replay / Rollback for the `REPLAY_UNAVAILABLE` terminal state added to handle a retired/deprecated AI model, and the "never silently substitute" rule now explicitly restated for replay (previously only stated for live execution).

## Shadow mode

New model/method/workflow versions should support Production (old version) vs. Shadow (new version). Compare: quality, calibration, bias, latency, cost, source coverage, contradiction handling. Cut over only after acceptance criteria are met.

## Database migration

Use Expand / Contract: Expand → Dual compatibility → Backfill → Validate → Cutover → Observe → Contract. No destructive one-step migration for critical data. **This policy is now CI-enforced, not only stated — see §Enforcement Discipline above.**

## Rollback dimensions

Every release must define: Application rollback, Database rollback / forward recovery, Configuration rollback, Policy rollback, Prompt rollback, Method rollback, Workflow rollback.

## Backups

At minimum consider: Primary, Replica, Offsite backup, Offline / immutable backup. Backup is not recovery. Restore testing is mandatory.

**Changed in V2 — restore testing moves from a paid-tier gate to a P0/Wave-1 precondition for admitting any real data**: V1 required a passed restore test only at Gate C (paid Personal/Pro tier), meaning the architecture as sequenced permitted admitting real customer RESTRICTED data (dogfooding on real people begins Phase 5, per `14_ROADMAP_AND_DEFINITION_OF_DONE.md`) before backup recoverability had ever been verified. A **rehearsed, cross-box restore drill** (not a same-box verify) is now a precondition for Wave 4 (Evidence/Claim/Assessment core, see `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`) going live with any real, non-synthetic tenant data — this is a sequencing change, not new infrastructure; the requirement (restore testing) already existed, it is only moved earlier. Full reasoning: `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-02.

## WORM / tamper-evidence vs. erasure *(new section in V2)*

`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-03 (optional WORM/object-lock, hash-chain evidence integrity) is in real tension with a Person's erasure/correction rights (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Data Subject Rights) for any evidence record that later needs to be deleted under a lawful erasure request — and no S3-Object-Lock-class storage exists anywhere in the verified current infrastructure, so literal storage-level WORM is not currently implementable regardless of the policy question. **Resolved via crypto-shredding**, not literal WORM — see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Immutability vs. Erasure for the mechanism. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-7, `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-07.

## Disaster recovery scenarios

At least: DB loss, credential leak, ransomware, operator error, bad deployment, bad migration, cloud outage, region outage, AI provider outage, search provider outage.

**Changed in V2 — the actual dominant risk is named**: add **single dedicated-server hardware/host failure** — for a bare-metal single box (the verified current baseline), this is a materially higher-probability failure mode than "region outage" (OVH's own 2021 Strasbourg datacenter fire is real, on-the-record precedent for exactly this failure class), and the existing scenario list never named it. The existing `HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` already treats this seriously at the ops-runbook layer; this product architecture document must say so too, so nobody designing HCI-30's data model assumes an HA substrate that doesn't exist. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-02, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-02.

## Graceful degradation

If AI LEGO is down, HCI should still support: historical reads, manual evidence, manual assessment, existing decisions.

If public search is down, HCI should still support: first-party evidence, manual source input, historical public intelligence.

If one model is down: use approved substitute if policy allows, otherwise hold for review, never silently substitute forbidden models.

**KEEP, confirmed as correctly specified**: this graceful-degradation table is one of the reasons the peer-product independence claim in `02_PRODUCT_BOUNDARIES.md` survives scrutiny — it states the failure-independence requirement as a system-level rule, not an aspiration. Full reasoning: `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-11.

## Deployment strategy *(new section in V2)*

**Changed in V2**: canary rollout uses `lobster-nginx`'s existing weighted-upstream support (no new infrastructure) once HCI-30 has enough traffic that an all-or-nothing rollout carries real user-facing risk. Full blue/green (duplicate running stack) is explicitly deferred until a second physical box exists — the verified single dedicated server cannot realistically double its own resource footprint to run blue+green simultaneously without starving co-tenant production services (WordPress, n8n, Supabase, etc.). See `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §4 for the full NOW/NEXT/FUTURE table this is drawn from. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-09.

## SLOs

Define at least: Availability, Latency, Data Durability, Backup Success, Restore Success, Security Response, Critical Workflow Success.

**Changed in V2**: these must be **numeric** targets, not category headers — `21_HCI_TOP_TIER_GAP_ANALYSIS.md` already self-flags this as unresolved (P1-05). Calibrate the actual numbers to the verified single-box infrastructure reality (e.g., an Availability SLO premised on multi-region failover is not honest on a bare-metal single server) rather than importing generic SaaS targets. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-10.
