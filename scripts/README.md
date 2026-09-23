# scripts/

All scripts live in this flat directory. Paths are hard-coded as `scripts\<name>.ps1` across the codebase — do not move files into subdirectories without updating every `Join-Path` reference.

---

## AO Lifecycle (daily operational cycle)

| Script | Purpose |
|--------|---------|
| `ao-resume.ps1` | Session start: git pull, build gates, env audit, open tasks |
| `ao-close.ps1` | Session end: WORKLOG → memory → gates → commit → push |
| `commit-checkpoint.ps1` | Mid-session git checkpoint (no push) |
| `print-today-closeout-recap.ps1` | Show today's completed work |
| `print-open-tasks.ps1` | List all open TASKS |
| `ensure-daily-progress-scaffold.ps1` | Create today's WORKLOG/daily scaffold |
| `merge-closeout-inbox-into-progress.ps1` | Merge collaborator inbox into WORKLOG |
| `apply-closeout-task-checkmarks.ps1` | Apply AUTO_TASK_DONE checkmarks to TASKS |
| `apply-pending-task-checkmarks.ps1` | Apply pending checkmarks (legacy wrapper) |
| `init-closeout-inbox.ps1` | Initialise closeout-inbox.md |
| `verify-closeout-completeness.ps1` | Gate: confirm WORKLOG has evidence before commit |
| `export-cross-machine-memory.ps1` | Export MEMORY.md index to Desktop\AO-SYNC-<date>\ (called by ao-close) |
| `import-cross-machine-memory.ps1` | Import MEMORY.md from Desktop\AO-SYNC-*\ if newer (called by ao-resume; silent no-op if no AO-SYNC) |

## Build / Health / Gates

| Script | Purpose |
|--------|---------|
| `verify-build-gates.ps1` | Full build gate suite (main pre-push gate) |
| `system-health-check.ps1` | Health check (100% required for AO-CLOSE) |
| `system-guard.ps1` | doc-sync + health + guard + LAST_SYSTEM_STATUS |
| `generate-integrated-status-report.ps1` | Generate reports/status/integrated-status-LATEST.md |
| `health-report-utils.ps1` | Shared utilities for health reports (dot-sourced) |
| `check-three-way-sync.ps1` | Verify three-way doc sync consistency |
| `doc-sync-automation.ps1` | Auto-sync docs after changes |
| `check-cloudflare-security.ps1` | Verify Cloudflare bot fight mode + WAF rules; outputs reports/status/cf-security-LATEST.md; always exits 0 (warn-only). Auto-called by ao-resume.ps1 and system-health-check.ps1. |
| `check-deploy-drift.ps1` | Compare SG production deployed commit vs origin/main, plus (2026-09-20) an independent docker-compose.yml variable-set drift check (`composeVarDrift` — commit-behind and compose drift are separate axes); called by system-health-check §7, `ao-close.ps1`, and `/check-drift`. Reports `deployHold` when `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` exists — held drift is deliberate, so the message says do NOT deploy (runbook: DEPLOY_ROLLBACK_RUNBOOK.md §1.5). |
| `check-governance-docs-drift.ps1` | Monthly cross-ref audit of 4 governance docs (Inventory / Routing Spec / Routing Matrix / Traceability). |
| `check-backup-health.ps1` | SSH into SG/EU servers and verify backup retention; uses base64-pipe for complex grep patterns. |
| `fetch-external-signals.ps1` | Fetch Slack + Telegram messages since last AO-CLOSE. Called by ao-resume.ps1; also callable via `/signals [from] [to]` (CST). |

## Machine / Environment Setup

| Script | Purpose |
|--------|---------|
| `machine-environment-audit.ps1` | Full env audit with -Strict flag |
| `align-workstation.ps1` | Alias for ao-resume without strict flags |
| `bootstrap-mcp-machine.ps1` | First-time MCP setup on a new machine |
| `install-autopilot-startup-fallback.ps1` | Install startup fallback for Autopilot Phase 1 |

## MCP Configuration

| Script | Purpose |
|--------|---------|
| `sync-mcp-config.ps1` | Sync registry.template.json → .mcp.json / Codex / Copilot / Gemini |
| `sync-claude-userlevel.ps1` | Sync `mcp/claude-userlevel/` SSOT → `~/.claude/{hooks,settings.json,mcp.json}` (modes: install/merge/verify/dry-run) |
| `apply-shared-ai-governance.ps1` | One-shot: MCP sync + closeout inbox seed + bootstrap prompts |
| `verify-shared-ai-governance.ps1` | Verify MCP governance state |
| `sanitize-user-mcp-config.ps1` | Back up `~/.claude/mcp.json` + `~/.claude.json`, then delegate the rewrite to `sync-claude-userlevel.ps1` (the single writer). Does NOT cover `%APPDATA%\Claude\claude_desktop_config.json`, which is ungoverned and holds plaintext keys -- see TASKS.md |
| `patch-codex-user-mcp-config.ps1` | Patch Codex user MCP config |
| `ensure-agent-bootstrap-prompts.ps1` | Generate bootstrap prompt packs for other AI agents |
| `run-llm-mcp.ps1` | Stdio launcher for LLM MCP servers (Claude/GPT/Gemini/Grok) |
| `run-filesystem-mcp.ps1` | Stdio launcher for filesystem MCP |
| `run-postgres-mcp.ps1` | Stdio launcher for Postgres MCP |
| `run-n8n-mcp.mjs` | n8n MCP runner (Node.js) |
| `start-trigger-mcp.ps1` | Start Trigger.dev MCP server |

## Secrets

| Script | Purpose |
|--------|---------|
| `secrets-vault.ps1` | DPAPI-backed local secrets vault (set / get / list / import-mcp) |

## Git

| Script | Purpose |
|--------|---------|
| `git-align-main-aoresume-feature.ps1` | Align main with origin before AO-RESUME |
| `git-audit-tracked-remote.ps1` | Audit tracked remotes |
| `git-prune-merged-local-branches.ps1` | Prune merged local branches |
| `sync-enterprise-cursor-rules-to-monorepo-root.ps1` | Sync Cursor rules to monorepo root |

## Scheduling

| Script | Purpose |
|--------|---------|
| `register-monthly-system-review-task.ps1` | Register monthly task in Windows Task Scheduler |
| `scheduled-task-launcher.ps1` | Launcher wrapper used by all scheduled tasks |
| `monthly-system-review.ps1` | Monthly: build gates + status report + Supabase memory check |
| `check-supabase-memory-monthly.ps1` | Monthly Supabase memory usage check |
| `archive-old-reports.ps1` | Archive old reports to keep reports/ clean |

> Remote agents (cloud, machine-independent): see `claude.ai/code/routines` — AgencyOS-WeeklyReview and AgencyOS-MonthlyReview are set up there, not via Task Scheduler.

## Observability / Infrastructure

| Script | Purpose |
|--------|---------|
| `open-grafana-ssh-tunnel.ps1` | Open SSH tunnel to Grafana |
| `open-supabase-ssh-tunnel.ps1` | Open SSH tunnel to Supabase Postgres |
| `sync-hetzner-grafana-alerting-slack.ps1` | Sync Grafana alerting → Slack |
| `sync-hetzner-observability-grafana-content.ps1` | Sync Grafana dashboards/content |
| `sync-hetzner-pagerduty-endpoint-alert.ps1` | Sync PagerDuty endpoint alerts |
| `sync-hetzner-slack-alert-webhooks.ps1` | Sync Slack alert webhooks |
| `public-endpoint-smoke.ps1` | Smoke test public endpoints (HTTP-only; Playwright gives browser-level equivalent) |
| `playwright-runner.ps1` | Playwright E2E orchestrator — smoke / qa / client / screenshot / a11y / perf / install. Called by `/playwright` skill. |
| `ops-console-bootstrap.ps1` | Bootstrap ops console |
| `ops-console-smoke.ps1` | Smoke test ops console |
| `ops-network-precheck.ps1` | Network precheck before ops |
| `n8n-mcp-smoke.ps1` | n8n MCP smoke test |
| `n8n-mcp-smoke.mjs` | n8n MCP smoke test (Node.js) |
| `supabase-tunnel-smoke.mjs` | Supabase tunnel smoke test |
| `supabase-set-pooler-tenant-on-host.sh` | Set Supabase pooler tenant on host |
| `notify-ops.ps1` | Send ops notification |

## Always-On Command Plane

| Script | Purpose |
|--------|---------|
| `setup-command-plane.ps1` | One-shot client-side setup (vault → user env → setWebhook). Pass `-BotToken -UserId -OrgId` |
| `configure-telegram-webhook.ps1` | Standalone setWebhook + setMyCommands (use `-Clear` to disable) |
| `command-plane-smoke.ps1` | 8-check smoke (Telegram ingress + kill switch + idempotency) — see `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` |

## Autopilot

| Script | Purpose |
|--------|---------|
| `autopilot-phase1.ps1` | Autopilot Phase 1 main loop |
| `autopilot-alert-loop.ps1` | Autopilot alert monitoring loop |
| `register-autopilot-phase1.ps1` | Register Autopilot Phase 1 scheduled tasks |

## Lobster Factory / Database

| Script | Purpose |
|--------|---------|
| `apply-lobster-rls-migrations-eu.mjs` | Apply Lobster Factory RLS migrations (EU Supabase) |
| `apply-supabase-splinter-fixes.mjs` | Apply Supabase splinter schema fixes |
| `ensure-lobster-workflows-deps.ps1` | Ensure Lobster workflows npm deps are installed |

## WordPress Management (Managed Client Sites)

| Script | Purpose |
|--------|---------|
| `update-client-wp-plugins.ps1` | Safe one-command plugin updater: backup-first → wave update → health check → auto-rollback. Config per client at `tenants/*/core/wp-update-config.json`. Owner doc: `agency-os/docs/operations/WP_MANAGED_UPDATES.md` |
| `verify-wp-plugin-stack-sync.mjs` | Drift check: `WP_CLIENT_PLUGIN_STACK.md` (human SSOT) vs `wp-plugin-stack-catalog.ts` (machine mirror). Exit 0 = aligned; exit 1 = drift. Owner doc: `agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md` §八.5 |

## WordPress / Local Dev

| Script | Purpose |
|--------|---------|
| `bootstrap-local-wordpress-windows.ps1` | Full local WordPress setup on Windows |
| `setup-wp-cli-windows.ps1` | Install WP-CLI on Windows |
| `ensure-mariadb-on-user-path.ps1` | Ensure MariaDB is on user PATH |

## Client Onboarding

| Script | Purpose |
|--------|---------|
| `init-onboarding-a10-2-evidence-skeleton.ps1` | Init A10-2 onboarding evidence skeleton |
| `preflight-onboarding-a10-2-readiness.ps1` | Preflight check for A10-2 onboarding |

## Documentation

| Script | Purpose |
|--------|---------|
| `register-new-governance-doc.ps1` | Register a new governance doc (change-impact-map + README) |
| `render-program-timeline-from-schedule.ps1` | Render program timeline from schedule JSON |
| `build-product-bundle.ps1` | Build product delivery bundle |

## AI / LLM CLI

| Script | Purpose |
|--------|---------|
| `grok-cli.ps1` | Grok CLI wrapper |
| `perplexity-cli.ps1` | Perplexity CLI wrapper |
| `posthog-api.ps1` | PostHog API wrapper |

## RAG

| Script | Purpose |
|--------|---------|
| `rag_query.ts` | RAG query (TypeScript) |
| `rag_seed_and_embedding.ts` | RAG seed and embedding (TypeScript) |
| `setup-rag-env.ps1` | Set up RAG environment |

---

## Adding a new script

1. Place it here (flat, no subdirectories)
2. Name it `verb-noun-context.ps1` (kebab-case)
3. Add it to the appropriate category table above
4. If it is called by other scripts, reference it as `Join-Path $WorkRoot "scripts\your-script.ps1"`
