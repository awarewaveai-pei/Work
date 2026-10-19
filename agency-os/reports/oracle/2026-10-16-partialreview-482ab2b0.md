# codex-oracle review -- 2026-10-16 19:56:13 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/view.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/cs-baseline-job.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/system-modes/__tests__/production-change-coverage.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Chatwoot baseline (lib/cs/chatwoot-baseline.ts, already on main) now applies automatically: once after the operator saves the Chatwoot User token (PUT chatwoot-token; a failed apply never fails the save, outcome in `baseline`), and daily via a new registry job cs_chatwoot_baseline in lib/schedules/jobs.ts (the existing hourly heartbeat /api/internal/schedules/run-due runs enabled rows; a throw records last_error and raises an incident; a blocking system mode is reported, not raised). view.ts gains a per-job unavailable() so clients without client_config.chatwoot show 瘝???Chatwoot. Default enabled=false per AGENTS.md automation-default-OFF. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 179380ms | answer: 619B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/view.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/system-modes/__tests__/production-change-coverage.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `unavailable()` is display-only; an enabled job still runs and raises incidents for clients without Chatwoot.

  `lib/schedules/jobs.ts:22-23,59-62` -> `lib/schedules/view.ts:31-34`  
  confidence  -> CONFIRMED  
  scenario    -> An enabled `cs_chatwoot_baseline` row remains after `client_config.chatwoot` is removed; the next sweep executes `run()`, throws `chatwoot_not_configured`, and records an error/incident instead of skipping the unavailable client.  
  why missed  -> The implementation adds the unavailable state to the schedules view but does not use it as an execution guard.

TOTAL: 1 findings
