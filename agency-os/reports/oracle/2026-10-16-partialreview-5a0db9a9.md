# codex-oracle review -- 2026-10-16 09:32:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator saves their own Chatwoot User access token from the CS tab into the server vault (separate key cs:chatwoot:<org>:user_token; customer-visible sends stay on the AgentBot api_token). PUT verifies via GET /api/v1/profile (bot token gets 401; must be a member of the configured accountId) before storing; never returns or logs the value; owner/admin only; audited without the value. Reads (listMessages/getContactName/updateContactName) prefer the user token and fall back to the bot token.
- exit: 0 | elapsed: 316769ms | answer: 1976B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Profile validation accepts tokens that Chatwoot cannot use for account APIs.
  file:line   -> `apps/next-admin/lib/cs/chatwoot-client.ts:87-91` -> `apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.ts:71-83`
  confidence  -> CONFIRMED
  scenario    -> Chatwoot Cloud disables API access: `/profile` returns 200 with the account listed but an empty `access_token` ([profile spec](https://github.com/chatwoot/chatwoot/blob/develop/spec/controllers/api/v1/profiles_controller_spec.rb)); this code stores the token, then later reads fail with 403 because account APIs reject disabled access ([controller](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/app/controllers/api/v1/accounts/base_controller.rb)).
  why missed  -> The test checks only `accounts` membership and mocks a usable `access_token` (`route.test.ts:150-159`).

FINDING 2: Successful storage can be reported without an audit record.
  file:line   -> `app/.../chatwoot-token/route.ts:76-83` -> `lib/ops-audit.ts:13-29`
  confidence  -> CONFIRMED
  scenario    -> Vault write succeeds but Supabase audit insertion fails or is unavailable; `recordOpsAudit` only warns and resolves, so PUT returns 200 while the credential has no audit row.
  why missed  -> The route awaits the helper, masking its best-effort behavior; the test mocks audit as always successful (`route.test.ts:119-123`).

FINDING 3: The new UI cannot save tokens in the simulated-role development mode.
  file:line   -> `ClientHubTabs.tsx:1195-1199` -> `middleware.ts:291-327` -> `ops-role.ts:42-49`
  confidence  -> CONFIRMED
  scenario    -> Development runs without Supabase auth and sends `x-ops-simulated-role: admin`; middleware strips that header, passes the request through, and the route resolves viewer/operator, so PUT/DELETE returns 403.
  why missed  -> The route test calls the handler directly with `x-ops-claims-role`, bypassing middleware (`route.test.ts:136-141`).

TOTAL: 3 findings
