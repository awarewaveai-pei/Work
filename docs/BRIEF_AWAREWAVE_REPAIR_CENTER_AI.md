# BRIEF — AwareWave Repair Center for AI

## Purpose

This brief is the required pre-read for any AI that will design or implement the `Repair Center` inside `https://app.aware-wave.com/`.

The goal is not to build a second system. The goal is to extend the existing AwareWave ops system without creating:

- a second incident inbox
- a second approval system
- a second deploy system
- a second notification brain
- a second secrets path

If any implementation would do one of those, it is wrong.

---

## One-Sentence Mental Model

`Repair Center` must be the orchestration layer between `Ops Inbox` and `release`, not a replacement for `Ops Inbox`, `Approvals`, `System Modes`, `Build Console`, Slack, or Telegram.

Canonical flow:

`incident -> triage -> approve -> backup -> repair run -> PR -> manual merge -> manual deploy -> health gate -> rollback if needed`

---

## Non-Negotiables

1. `Ops Inbox` is the only curated incident source of truth.
2. `Repair Center` is the only repair orchestration layer.
3. Slack is the main human incident surface.
4. Telegram is backup notification plus command plane only.
5. No backup means no repair run.
6. Auto-deploy via `sg-deploy.sh` is allowed; backup + health gate + auto-rollback required before any production change.
7. nginx / Dockerfile / docker-compose changes require: backup → apply → health check → auto-rollback on failure.
8. `#alerts-critical` and `#alerts-info` are obsolete and must not be rebuilt.
9. Do not move Telegram secrets into GitHub Secrets.
10. Do not bypass `sg-deploy.sh`, `rollback-phase1.sh`, or `System Modes`.

---

## Read Order

Read the files in this exact order before proposing code.

### 1. Canonical rules

These define the official architecture and routing contract.

1. `docs/awarewave-auto-repair-plan-v3.2-final.md`
2. `docs/awarewave-auto-repair-phase2-handoff.md`
3. `docs/awarewave-repair-center-app-architecture.md`
4. `agency-os/docs/operations/slack-notification-routing.md`

What you must learn from this group:

- `Repair Center` belongs at `/ops/repairs`
- Slack routing is `#infra-alerts` for raw infra and `#ops-incidents` for curated incidents
- Telegram is a backup path, not the main incident bus
- `Repair Center` must orchestrate, not duplicate
- Sentry / Uptime Kuma / Netdata are the first formal intake set, not the full monitoring boundary
- Grafana and PostHog already exist as Ops Inbox sources and must be classified through policy, not treated as new systems

### 2. Existing app structure

These define how `app.aware-wave.com` is already organized.

1. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/layout.tsx`
2. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/page.tsx`
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/inbox/page.tsx`
4. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/approvals/page.tsx`
5. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/system-modes/page.tsx`
6. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/repairs/page.tsx`
7. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css`

What you must learn from this group:

- where navigation already lives
- how `/ops` pages are structured
- which surfaces are already trusted by operators
- which visual language and density the app already uses

### 3. Incident and notification core

These define the existing incident lifecycle. Do not re-implement this logic elsewhere.

1. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/types.ts`
2. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/fingerprint.ts`
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/transition.ts`
4. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/notify/rules.ts`
5. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/notify/dispatcher.ts`
6. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/notify/slack.ts`
7. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/notify/telegram.ts`
8. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/sentry/route.ts`
9. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/uptime-kuma/route.ts`
10. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/netdata/route.ts`
11. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/grafana/route.ts`
12. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/posthog/route.ts`
13. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/inbox/health/route.ts`
14. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts`

What you must learn from this group:

- incident state already exists
- dedup and throttle already exist
- severity logic already exists
- Slack and Telegram fan-out already exist
- health verification already exists
- Repair policy already distinguishes auto-repair, analysis-only, triage-needed, and human-only

### 4. Safety and command boundaries

These define what repair is allowed to do and what must stay elsewhere.

1. `agency-os/docs/operations/TELEGRAM_COMMAND_POLICY.md`
2. `agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`
3. `agency-os/docs/operations/AUTO_REPAIR_SYSTEM_V2_LIGHT.md`

What you must learn from this group:

- Telegram already has a command-plane role
- high-risk behavior is intentionally constrained
- older docs may contain legacy examples and must not override newer routing docs

### 5. Adjacent systems that must not be duplicated

These define neighboring systems that repair must integrate with instead of copying.

1. `lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md`
2. `lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md`
3. `lobster-factory/docs/BRIEF_WP_PLUGIN_STACK_AUTOINSTALL_AI.md`

What you must learn from this group:

- where build/deploy logic already belongs
- where one-click operational tooling is already heading
- how to avoid introducing overlapping automation surfaces

---

## What You Must Understand Before Coding

Before writing code, the AI must be able to explain all of the following correctly.

1. Why `Repair Center` must live at `/ops/repairs` and not under `/build`, `/ops-console`, or a new top-level route.
2. Why `Ops Inbox` remains the only curated incident source.
3. Why `Approvals` must remain separate from repair orchestration.
4. Why `System Modes` must be able to stop or constrain repair behavior.
5. Why deploy must remain manual and routed through existing release tooling.
6. Why Telegram cannot become the primary repair UI.
7. Why no new dedup or severity engine should be created.
8. Why no secrets should be duplicated into repo-tracked files or unnecessary CI paths.
9. Why product/business signals such as PostHog can inform diagnosis but must not directly trigger autonomous code repair.
10. Why Grafana/SLO/log signals are analysis-first unless evidence proves a bounded code regression.

If the AI cannot explain these 8 points, it is not ready to code.

---

## Required Implementation Shape

The first real implementation of `Repair Center` should evolve toward these surfaces:

1. `Queue`
   Shows repairable incidents waiting for approval.

2. `Runs`
   Shows repair runs and their lifecycle states.

3. `Safety`
   Shows backup gate, kill switch, deploy gate, and rollback state.

4. `Links`
   Every repair run must link to its incident, issue, PR, deploy log, and backup proof.

5. `Policy`
   The system must distinguish between:
   - auto-repair
   - analysis-only
   - human-only

6. `Audit`
   The system must record who approved, what PR was created, whether deploy happened, and whether rollback happened.

---

## Canonical State Model

If a new `repair_runs` table or equivalent model is added, use one coherent state machine.

Allowed states:

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

Do not create overlapping parallel states spread across Slack, comments, or ad hoc fields unless they map back into this model.

---

## Forbidden Moves

Do not do any of these.

1. Create a second inbox under `/ops/repairs`.
2. Rebuild `#alerts-critical` or `#alerts-info`.
3. Add a second dedup pipeline outside `Ops Inbox`.
4. Add a second severity mapping system outside the existing incident logic.
5. Put deploy buttons directly inside repair flow in a way that bypasses existing release safeguards.
6. Let Telegram trigger production repair or deploy directly.
7. Put Telegram tokens, chat IDs, webhook URLs, or ingest tokens into repo-tracked files.
8. Treat old `v2-light` examples as the current production design.

---

## Output Expected From the AI Before Coding

Before implementation, the AI should produce a short architecture note answering:

1. What existing tables, routes, and pages will be reused.
2. What new route(s), table(s), and API endpoints are actually necessary.
3. What will remain unchanged.
4. How rollback and health gates are preserved.
5. How the new work avoids duplication with Ops Inbox, Approvals, System Modes, and Build Console.

If that note is vague, implementation should not start yet.

---

## Priority of Truth

If documents disagree, prefer this order:

1. `agency-os/docs/operations/slack-notification-routing.md`
2. `docs/awarewave-auto-repair-plan-v3.2-final.md`
3. `docs/awarewave-auto-repair-phase2-handoff.md`
4. `docs/awarewave-repair-center-app-architecture.md`
5. current `next-admin` code structure
6. older historical docs

## 2026-05-13 Built Surface

Before changing Repair Center, inspect the current implementation:

1. `lobster-factory/packages/db/migrations/0027_repair_runs.sql`
2. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/*`
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/*`
4. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/slack/route.ts`
5. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/repairs/page.tsx`
6. `.github/workflows/auto-repair-claude.yml`
7. `.github/workflows/auto-repair-pr-notify.yml`

Important: the backup gate has two valid modes:

1. `AUTO_REPAIR_BACKUP_WEBHOOK_URL` external gate.
2. SSH fallback gate using existing SG/EU backup scripts.

If neither mode is fully configured, or if the configured gate fails, the repair run stops before GitHub issue creation.
Do not weaken this behavior to make demos pass.

--- 

## Final Instruction to the AI

Do not start by inventing new architecture.

Start by fitting `Repair Center` into the existing AwareWave ops system so that:

- the operator sees one coherent control plane
- existing alerts, approvals, and deploy safeguards remain authoritative
- the system becomes more structured without becoming more fragmented
