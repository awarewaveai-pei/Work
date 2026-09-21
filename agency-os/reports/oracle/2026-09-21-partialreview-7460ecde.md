# codex-oracle review -- 2026-09-21 13:22:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/staging-admin-credential.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/staging-admin-credential.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Security fix: provision-staging returned the generated WP admin password in provisioningNotes; notes are persisted in Trigger.dev run output (packages/workflows/src/trigger/create-wp-site.ts:325,531) and ops_action_runs.output_payload. Fix vaults it via existing client_credentials (migration 0050) + lib/secret-vault.ts clientCredSecretRef convention and returns only the credential id; switches Math.random to crypto.randomBytes; skips vaulting when WP reports already installed (retry keeps first password). IGNORE the mainwp-child managementPlugins hunk in route.ts: it belongs to a concurrent session. Also verify: does this change depend on something NOT visible in this diff (schema, RLS, FK on client_credentials.client_id, legacy redactors in app/api/build/runs/route.ts:247 and app/api/onboarding/trigger-build/route.ts:487 that rewrite notes starting with 'Admin:')? If you cannot support a real finding, return no findings.

- exit: 0 | elapsed: 91410ms | answer: 30B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/staging-admin-credential.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/staging-admin-credential.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
