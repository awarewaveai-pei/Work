# codex-oracle review -- 2026-10-24 13:53:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/newsletter, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/social-admin/integrations, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/presets, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/public-https.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/public-https.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/ssrf.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/wp-sites.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/brand-voice, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/workbench  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 after review: customers may not write wp_sites URLs (every stored URL is fetched with credentials by unpinned, org-unscoped consumers); staffOnly guard; presets tenant checks; content sources/newsletter/integrations staff-only; brand-voice via pinned fetcher with reasons; fetcher bad Location -> CollectFetchError; isSafePublicHttps blocks trailing-dot/single-label/.local/multicast/NAT64; gate 5: DB-reading route must import AND call a named authorizer, db = any driver import, entitlement skip narrowed, resolveTenant dropped
- exit: 0 | elapsed: 117324ms | answer: 1641B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/brand-voice/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/brand-voice/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/newsletter/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/newsletter/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/__tests__/sites-customer.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/social-admin/integrations/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/social-admin/integrations/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/presets/customer.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/presets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/workbench/bootstrap/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/ssrf.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/public-https.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/wp-sites.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/workbench/bootstrap/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/public-https.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: IPv6 multicast addresses bypass `isSafePublicHttps`
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/public-https.ts:22 -> :30
  confidence  -> CONFIRMED
  scenario    -> `https://[ff02::1]/` passes validation because only dotted IPv4 multicast is rejected, so the URL is accepted and reaches the feed fetch path.
  why missed   -> Tests cover IPv4 multicast but no IPv6 multicast address.

FINDING 2: Customers cannot edit sites whose stored URL has a trailing slash
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts:30 -> :33
  confidence  -> CONFIRMED
  scenario    -> A legacy row stores `https://shop.example.com/`; the customer submits the unchanged form URL, which is normalized to `https://shop.example.com`. The comparison treats it as changed, invokes `staffOnly`, and rejects an otherwise-valid name edit with 403.
  why missed   -> The test uses a stored URL without a trailing slash.

FINDING 3: Gate 5 can be satisfied by calling a shadowing local function instead of the imported authorizer
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts:58 -> :86
  confidence  -> CONFIRMED
  scenario    -> A DB-reading route imports `effectiveOrgId` but declares a local parameter/function with the same name and calls it. The scanner records the identifier text as called and authorizes the route even though the real authorizer is never invoked.
  why missed   -> The scanner tracks callee names, not symbol bindings or scope.

Final line: TOTAL: 3 findings
