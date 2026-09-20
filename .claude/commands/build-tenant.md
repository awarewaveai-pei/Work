---
name: build-tenant
description: Provision a new client tenant through the Lobster Factory: GitHub repo, Sentry project, PostHog project, Supabase schema, n8n workflows. Creates irreversible external resources.
argument-hint: <client-slug>
disable-model-invocation: true
---

Provision a new client tenant using the Lobster Factory workflow.

Before starting, ask for:
- **Client name** (slug, e.g. `acme-corp`)
- **Domain** (e.g. `acme.aware-wave.com`)
- **Services to provision** (Sentry project, GitHub repo, PostHog project, Supabase schema, n8n workflows)

Then follow the Lobster Factory provisioning checklist:
- `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- `lobster-factory/docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`

Routing rules: `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`

Use MCP tools for each provider (GitHub MCP for repo creation, PostHog MCP for project setup, etc.). Log each step to `agency-os/WORKLOG.md`. After provisioning, run `/verify` to confirm gates pass.

Do NOT hardcode client secrets — use the vault or environment variables.
