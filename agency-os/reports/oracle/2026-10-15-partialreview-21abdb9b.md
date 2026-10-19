# codex-oracle review -- 2026-10-15 14:58:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 4, test-only: round 3 (artifact 2026-10-15-partialreview-5fd1fb1f.md) found the matcher-vs-nginx test only compared token names. The test now runs the nginx deny pattern itself as a RegExp against probe paths (/<prefix>, /<prefix>/x, /<prefix>?a=1) for every path the middleware matcher skips except _next, favicon.ico and login, and checks that door paths (/, /social, /api/social/brands, /login, /_next/static) are not refused. Round 3 finding 1 (buyout host env not wired into compose/nginx) is deferred by ADR 018 section 4 to the ADR 017 step-5 installer; do not re-report it.
- exit: 0 | elapsed: 218413ms | answer: 645B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The encoded-path guard rejects product login redirects containing encoded slashes.
  lobster-factory/infra/hetzner-phase1-core/nginx/default.conf:479 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts:160
  confidence  -> CONFIRMED
  scenario    -> An unauthenticated request to `/` sets `next=/`, producing `/login?next=%2F`; `$request_uri` includes the query, so nginx returns 400 before serving `/login`. `_next/image?url=%2F...` is also rejected.
  why missed  -> middleware-portal-guards.test.ts:145 checks only the redirect response, and line 174 tests kept paths without query strings.

TOTAL: 1 finding
