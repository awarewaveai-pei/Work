# codex-oracle review -- 2026-09-24 13:12:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/ssh-target-env.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of the hosting-bridge review. Round 1 finding (confirmed): readSshTargetFromEnv silently defaulted a missing HOSTING_BRIDGE_SSH_PORT to 22. Fix: readSshTargetFromEnv(prefix, {explicit:true}) returns null (warns) when _SSH_PORT or _SSH_USER is unset; the route calls it with explicit:true at both call sites (provision + seed); Auto-Repair keeps its defaults on purpose because prod .env sets no AUTO_REPAIR_SG_SSH_USER. Verify the fix and anything else in these files. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 73430ms | answer: 1196B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Explicit SSH configuration still silently defaults an invalid port to 22  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts:130-131`  
  confidence  -> CONFIRMED  
  scenario    -> `HOSTING_BRIDGE_SSH_PORT=not-a-number` is set -> `Number(...)` becomes `NaN`, the reader returns port `22`, and the bridge connects to the wrong port instead of rejecting configuration.  
  why missed  -> `explicit:true` checks only whether the variable is present; the legacy Auto-Repair fallback remains active for malformed values.

FINDING 2: The claimed UUID validation accepts many non-UUID site IDs  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts:39` -> `route.ts:350`  
  confidence  -> CONFIRMED  
  scenario    -> `siteId="abcdef"` passes `SITE_ID_RE`, derives valid-looking slug/database names, and provisions a site even though the upstream contract requires `z.string().uuid()`.  
  why missed  -> The regex validates only hexadecimal/hyphen characters and length, while the error message and comment describe UUID validation.

Final line: TOTAL: 2 findings
