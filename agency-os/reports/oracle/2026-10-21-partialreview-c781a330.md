# codex-oracle review -- 2026-10-21 10:26:57 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/inbox, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/inbox, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C29 social inbox: /api/social/inbox response gains sanitized home link (no credentials, http/https only); Inbox.tsx adds a button opening Chatwoot in a new tab and a how-to-connect note; new inbox.css; render-views.mjs inbox mock + 17-inbox. Read-only Chatwoot unread summary; must never leak baseUrl or token.
- exit: 0 | elapsed: 448733ms | answer: 1541B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/inbox/Inbox.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/inbox/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/inbox/inbox.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Failed refreshes silently display stale unread counts as current  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/inbox/Inbox.tsx:30,39`  
  confidence  -> CONFIRMED  
  scenario    -> Initial load shows 3 unread; refresh returns 500; `data` remains populated, the error is hidden by `error && !data`, and stale “3 unread” remains displayed without warning.  
  why missed  -> The e2e flow covers only successful loading.

FINDING 2: The new e2e check does not verify the real inbox route or generated links  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs:163-165,291-292`  
  confidence  -> CONFIRMED  
  scenario    -> Backend URL sanitization or row mapping is broken, but the interceptor supplies a fabricated valid payload and the test checks only one link’s `_blank` target; the regression passes.  
  why missed  -> The screenshot test was treated as inbox integration coverage.

FINDING 3: Chatwoot links drop valid base-URL path prefixes  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/inbox/route.ts:13-17`  
  confidence  -> PLAUSIBLE  
  scenario    -> `baseUrl` is `https://host/chatwoot`; API calls use `/chatwoot/api/...`, but the generated link replaces the pathname with `/app/...`, opening a nonexistent route.  
  why missed  -> Tests use origin-only URLs, and the config accepts any string without enforcing origin-only values.

TOTAL: 3 findings
