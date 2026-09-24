# codex-oracle review -- 2026-09-24 13:14:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/ssh-target-env.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. Round 2 findings: (1) explicit mode coerced an invalid HOSTING_BRIDGE_SSH_PORT (NaN) to 22; (2) SITE_ID_RE accepted non-uuid hex. Invariant applied (not per-instance): in explicit mode every connection value is taken verbatim and must be valid; anything the reader would substitute or coerce means unconfigured -> port must be 1..65535 digits, user must match ^[a-z_][a-z0-9_-]{0,31}$; SITE_ID_RE is now the canonical uuid shape (same as zod uuid). Auto-Repair default mode unchanged on purpose. Verify and report anything else real in these files. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 57001ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
