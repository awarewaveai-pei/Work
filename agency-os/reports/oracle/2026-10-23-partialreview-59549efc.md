# codex-oracle review -- 2026-10-23 13:46:55 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/__tests__/integration-health.test.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, scripts/check-cloudflare-security.ps1, mcp/user-env.template.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cloudflare credential convergence: one token name CLOUDFLARE_API_TOKEN (account-owned token) + CLOUDFLARE_ACCOUNT_ID; health check verifies on /accounts/<id>/tokens/verify; retired CLOUDFLARE_AUTH_BEARER_TOKEN removed everywhere. lobster-nginx container (published only on 127.0.0.1:8083, peer always host gateway) drops inert hard-coded Cloudflare ranges from set_real_ip_from and the trusted-source geo; trusted peers 127.0.0.1, 172.18.0.1, 172.16.0.0/12 unchanged. Already applied on prod via safe-infra-patch.
- exit: 0 | elapsed: 339270ms | answer: 1149B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, mcp/user-env.template.ps1, scripts/check-cloudflare-security.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/__tests__/integration-health.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Setup documentation omits the required account ID and still advertises the retired credential name
  mcp/DESKTOP_MCP_SETUP.md:80-82 -> integration-health.ts:48,380
  confidence  -> CONFIRMED
  scenario    -> A fresh setup follows the documented variables, sets an account-owned `CLOUDFLARE_API_TOKEN` but no `CLOUDFLARE_ACCOUNT_ID`; health falls back to `/user/tokens/verify` and reports failure. The same setup still exposes the retired bearer variable.
  why missed  -> The code, template, and compose changes were updated, but operational documentation outside the diff was not.

FINDING 2: The fallback test cannot detect the account-token failure it is meant to guard against
  integration-health.test.ts:30-37 -> integration-health.ts:48,380
  confidence  -> CONFIRMED
  scenario    -> With an account-owned token and no account ID, Cloudflare returns 401 from the user endpoint, but the test mock always returns 200 `{success:true}` and only checks the URL; the test passes despite broken production behavior.
  why missed  -> The test verifies routing only, not the endpoint response for an account-owned token.

TOTAL: 2 findings
