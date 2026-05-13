---
name: Trigger.dev Deploy — Vault Keys & Script
description: How to deploy Trigger.dev workflows and which vault keys are needed
type: project
---
Deploy Trigger.dev workflows with: `.\scripts\lobster-trigger-deploy.ps1`

**Vault prerequisites:**
- `TRIGGER_DEPLOY_PAT` = `tr_pat_*` Personal Access Token (for CLI deploy) — NOT the same as `TRIGGER_ACCESS_TOKEN`
- `TRIGGER_ACCESS_TOKEN` = `tr_prod_*` runtime API key (for triggering/polling runs via REST API)
- `POSTHOG_API_KEY` = PostHog server-side key
- `OPS_INBOX_INGEST_TOKEN` = AW webhook ingest token

**Why:** `TRIGGER_ACCESS_TOKEN` (tr_prod_*) is used for REST API calls. `TRIGGER_DEPLOY_PAT` (tr_pat_*) is what the CLI needs to deploy. They are different keys with different scopes.

**Known pitfalls (now fixed in script):**
- PowerShell pipe to SSH keeps CRLF → script uses `tr -d '\r'` server-side
- `trigger deploy` via `bash -s` (piped stdin) fails → script writes to VPS temp file then executes normally (no -tt needed)
- `workflow_runs` DB schema uses `engine`/`workflow_key`/`input`/`output`/`metadata` — NOT `actor_ref`/`input_snapshot` etc.
- `POSTHOG_HOST=us.i.posthog.com` is ingest-only — health check strips `.i.` to get `us.posthog.com`

**How to apply:** When deploying Trigger.dev, just run the script. If vault keys are missing, the script will throw with the exact key name needed.
