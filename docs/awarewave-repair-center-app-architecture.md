# AwareWave Repair Center App Architecture

## Scope

This file defines where the repair system belongs inside `https://app.aware-wave.com/` and how it must relate to the existing ops surfaces.

Primary app: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`

## Route Topology

| Route | Role |
|------|------|
| `/ops/inbox` | Incident intake and curated alert triage |
| `/ops/repairs` | Repair orchestration layer |
| `/ops/approvals` | High-risk command approvals |
| `/ops/system-modes` | Global kill switch / maintenance boundaries |
| `/build` | Release execution surface |

`/ops/repairs` must sit between intake and release. It is not a replacement for any of the above routes.

## Canonical Flow

1. Alerts land in `Ops Inbox`.
2. Repair Center selects incidents that are repairable.
3. Human approval allows a repair run to start.
4. Backup gate passes before any GitHub issue or PR is created.
5. Claude / GitHub handles code analysis and PR creation.
6. Human merge remains required.
7. Deploy remains manual through existing release tooling.
8. Health failure triggers rollback and notification.

## Ownership Boundaries

| Surface | Owns | Must not own |
|------|------|------|
| Ops Inbox | ingest, dedup, severity, reopen, throttle | PR lifecycle, deploy orchestration |
| Repair Center | repair candidate selection, repair run lifecycle, GitHub handoff | raw alert ingestion, global system mode |
| Approvals | high-risk command approvals | incident triage, repair queue |
| System Modes | kill switch / read-only / maintenance | repair state |
| Build Console | deploy execution | incident intake, PR generation |

## Repair Run State Model

Use one linear state model for future `repair_runs` data:

- `detected`
- `triage_needed`
- `approved`
- `backing_up`
- `repairing`
- `pr_ready`
- `deploy_pending`
- `deploying`
- `rolled_back`
- `resolved`
- `human_only`

Do not create multiple overlapping state machines across Slack, Ops Inbox, and GitHub comments.

## Invariants

1. `Ops Inbox` is the only curated incident source of truth.
2. `Repair Center` is the only repair orchestration source of truth.
3. `Slack` is the primary human incident surface.
4. `Telegram` is backup notification plus command plane only.
5. No backup means no repair run.
6. No human merge means no production code change.
7. No manual deploy means no production release.

## UI Information Architecture

The first usable Repair Center screen should contain:

1. Queue panel: repairable incidents waiting for approval.
2. Runs panel: active and recent repair runs.
3. Safety panel: backup gate, system mode, deploy gate, rollback gate.
4. Linked records: incident, issue, PR, deploy log, backup proof.
5. Policy panel: which incident classes are auto-repair, analysis-only, or human-only.

## Forbidden Design Moves

1. Do not create a second alert inbox under `/ops/repairs`.
2. Do not move deploy controls into the repair queue.
3. Do not bypass `/ops/system-modes`.
4. Do not add Telegram-only repair actions.
5. Do not create a second dedup or severity pipeline outside Ops Inbox.
