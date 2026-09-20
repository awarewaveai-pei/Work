---
name: client-onboarding
description: Onboard a new client into the Ops Dashboard: Supabase organizations record, client_config, SSH key placement, and /ops/clients verification. Writes production client records.
argument-hint: <client-slug>
disable-model-invocation: true
---

Onboard a new client into the Ops Dashboard using the client-onboarding subagent.

The subagent will:
1. Ask for: client name, slug, platform (wordpress/saas/static), hosting type, site URL
2. Ask: "你管主機（有 SSH 帳密）還是客戶自管主機？" to pick SSH vs MainWP path
3. Check if org already exists in Supabase → INSERT or UPDATE organizations.metadata.client_config
4. Store SSH key on ks-aw-01 (SSH path only)
5. Set wave1/wave2/wave3 plugin classifications
6. Run §VERIFY: client appears at /ops/clients, health probe passes

Owner doc: `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` §10 — Client Management
