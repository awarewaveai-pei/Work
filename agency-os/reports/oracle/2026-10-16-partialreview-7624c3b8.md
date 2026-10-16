# codex-oracle review -- 2026-10-16 09:39:10 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator saves their own Chatwoot User access token from the CS tab into the server vault (separate key cs:chatwoot:<org>:user_token; customer-visible sends stay on the AgentBot api_token). PUT verifies via GET /api/v1/profile (bot token gets 401; must be a member of the configured accountId) before storing; never returns or logs the value; owner/admin only; audited without the value. Reads (listMessages/getContactName/updateContactName) prefer the user token and fall back to the bot token.
- exit: 0 | elapsed: 306844ms | answer: 800B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Token validation uses contacts access instead of the required profile/account-membership check.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts:81` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.ts:71`
  confidence  -> CONFIRMED
  scenario    -> A valid personal token belongs to a member of the configured account, but that user cannot list contacts (403/404) -> validation returns `not_in_account`, PUT returns 422, and the usable token is never stored.
  why missed    -> The implementation substitutes a capability probe for the specified `/api/v1/profile` membership check, while tests cover only successful and 401 responses.

Final line: TOTAL: 1 findings
