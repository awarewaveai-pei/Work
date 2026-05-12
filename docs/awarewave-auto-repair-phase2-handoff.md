# AwareWave Auto-Repair Phase 2 Handoff

**Status**: active handoff brief
**Primary plan**: `docs/awarewave-auto-repair-plan-v3.2-final.md`
**Routing contract**: `agency-os/docs/operations/slack-notification-routing.md`

## Mission

Implement Phase 2 of auto-repair without creating a second notification architecture, second incident brain, or second secrets path.

## Non-Negotiables

| Rule | Requirement |
|------|-------------|
| Notification topology | Keep `#infra-alerts` as raw infra, `#ops-incidents` as curated incident, `#github-prs` as PR notice |
| Telegram role | Telegram is phone backup plus command plane, never the primary incident bus |
| Curated decisions | Dedup, throttle, reopen, severity escalation stay in Ops Inbox logic |
| Secrets | Do not commit tokens, chat ids, webhook URLs, or ingest tokens; do not add Telegram secrets to GitHub |
| Deploy | No auto-deploy on merge; production deploy stays manual via `sg-deploy.sh` |
| Backup | If pre-repair backup fails, stop the workflow before issue/PR creation |

## Phase 2 Scope

1. Extend or add webhook ingress for Sentry, Uptime Kuma, and Netdata.
2. Add Slack Approve callback handling.
3. Create GitHub issue -> Claude repair -> PR notification path.
4. Reuse existing deploy and rollback scripts, not new deployment workflows.
5. Keep all changes aligned with the routing contract and health contract.

## Forbidden Moves

1. Do not create `#alerts-critical` or `#alerts-info`.
2. Do not introduce a second dedup window outside Ops Inbox for the same incident stream.
3. Do not fork severity mapping rules across multiple routes.
4. Do not move Telegram secrets into repo files or GitHub Secrets.
5. Do not make Slack depend on Telegram or make raw infra depend on Ops Inbox.

## Required Deliverables

| Area | Deliverable |
|------|-------------|
| Webhooks | Working ingress for Sentry, Kuma, Netdata |
| Slack | Interactive Approve / acknowledge flow |
| GitHub | `auto-repair-claude.yml` and `auto-repair-pr-notify.yml` |
| Safety | Backup gate, health check gate, rollback notification |
| Docs | Any changed behavior reflected back into the primary plan or routing contract |

## Acceptance

Implementation is not done until all of these pass:

1. Endpoint alert reaches Slack and Telegram.
2. Synthetic Ops Inbox incident reaches `#ops-incidents` and Telegram.
3. Deploy drift reaches Slack and Telegram.
4. `/api/ops/inbox/health` returns `ok:true` and shows Telegram enabled/configured.
5. Failed backup blocks issue and PR creation.
6. Failed deploy rolls back and reports to `#ops-incidents`.

## Handoff Prompt

Use the primary plan's Section 10 plus this brief together. If there is any conflict, prefer:

1. `agency-os/docs/operations/slack-notification-routing.md`
2. `docs/awarewave-auto-repair-plan-v3.2-final.md`
3. this handoff brief
