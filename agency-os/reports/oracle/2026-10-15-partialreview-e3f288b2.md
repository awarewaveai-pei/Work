# codex-oracle review -- 2026-10-15 14:20:13 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/apps/cognitive-web, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: cognitive-web: unknown ids under app/(shell) answered HTTP 200 because (shell)/loading.tsx streams before the page notFound(). middleware.ts now asks lib/known-address.ts (one rule per dynamic page, each asking what its page reads: catalog/lessons/demos, or the API with the visitor cookie) and answers NextResponse.rewrite(sameUrl,{status:404}) for GET/HEAD page loads (not RSC); null (API down/401/timeout) = pass through. Also: projects/demo/[method]/loading.tsx re-export (pre-existing loading.test failure), toolOf/demoOf use Object.hasOwn. Also verify: does this change depend on something NOT visible in this diff - a config value, timeout, schema assumption, or upstream default defined elsewhere? If it contradicts the change, report it. If you cannot support a real finding, say so and return no findings; do not invent weak findings.
- exit: 0 | elapsed: 372524ms | answer: 694B
- files-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/methods/[id]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/[method]/[[...domain]]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/invite.test.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/middleware.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/demos.spec.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/[method]/loading.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/known-address.test.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/known-address.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/not-found-status.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Method-address checks can hang indefinitely when the catalog API stalls.
  file:line   -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/known-address.ts:50` -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts:38`
  confidence  -> CONFIRMED
  scenario    -> `/methods/unknown` receives a session cookie while `/catalog` accepts the connection but never responds; `loadCatalog()` has no abort signal, so middleware waits until the platform request timeout instead of passing through as `null`.
  why missed  -> The timeout only bounds `probe()`; the catalog lookup used by the methods rule has no equivalent timeout.

TOTAL: 1 findings
