# codex-oracle review -- 2026-10-16 19:03:25 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-baseline.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/chatwoot-baseline.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-baseline, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Chatwoot baseline applied by code for every CS tenant (hosted or a buyout customer's own Chatwoot): auto-resolve after 48h idle + one global closing macro, idempotent plan (compare settings/macros, write only the difference), gate inside applyChatwootBaseline, POST cs-config/chatwoot-baseline (owner/admin, user token), a Chatwoot refusal mapped to codes the tab explains. Verified against the deployed Chatwoot v4.18 source: accounts_controller permitted_settings_attributes (auto_resolve_after in minutes), AccountPolicy#update? administrator, macros_controller create/update with actions[action_name, action_params]. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 227919ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
