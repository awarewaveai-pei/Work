# codex-oracle review -- 2026-10-15 12:54:23 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/lessons.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/[method]/[[...domain]]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/iceberg/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/next.config.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/scripts/dev/demo_fixture.cjs, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/demos.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: COS template 15.1 item 3: the free demo result pages become generic. Route app/(shell)/projects/demo/[method]/[[...domain]]/page.tsx (default domain = /projects/demo/<method>, others /<domain>; unknown = notFound) replaces the fixed demo/iceberg page; next.config redirects /projects/demo/iceberg. Fixtures move to fixtures/demo/<method>.<domain>.json (the iceberg one moved unchanged). lessonkit (sync-design-system) scans fixtures/demo and generates into toolsheets.generated.ts DEMOS (per tool: domain, href, title from the example scenario before the first ???? and DEMO_FIXTURES (lazy import per fixture, so no page bundles them); the lesson's ?????游??? is now one button per domain (switched by the domain chips like every other example), linking the demo when it exists, else a note that it is still being made. ProjectList lists one demo row per tool from DEMOS. scripts/dev/demo_fixture.cjs drives the real run page (#demo / #demo=<domain>) -> ?瑁??? -> 蝣箄??瑁? on the local dev web and writes the fixture from GET /interpretations/<id> + GET /methods/<id>/form. e2e demos.spec.ts opens every DEMOS page. Check: route matching (domain array length, default domain given explicitly), client bundle size (DEMO_FIXTURES dynamic imports inside a module ProjectList and ResultPage import), notFound under loading.tsx, fixture script failure handling and selectors, lesson HTML for the hidden spans, title derivation.
- exit: 0 | elapsed: 428679ms | answer: 801B
- files-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/iceberg/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/lessons.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/next.config.ts, Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py, Projects/internal/cognitive-engineering-os/scripts/dev/demo_fixture.cjs, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/demos.spec.ts
- deletions-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/iceberg/page.tsx@35a45987b

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 未知 demo URL 會以 HTTP 200 回應，測試卻把它當成 404 驗證。

  file:line   -> D:\Work\Projects\internal\cognitive-engineering-os\apps\cognitive-web\app\(shell)\projects\demo\[method]\[[...domain]]\page.tsx:17; D:\Work\lobster-factory\infra\hetzner-phase1-core\tests\e2e\cognitive\demos.spec.ts:30

  confidence  -> CONFIRMED

  scenario    -> 請求 `/projects/demo/systems.iceberg_model/no-such-domain` 時呼叫 `notFound()`；因 `loading.tsx` 已開始串流，回應狀態仍是 200，只有頁面內容顯示 not-found。爬蟲、快取與監控會把不存在的 demo 當成有效頁面；e2e 只檢查 heading，會放過這個錯誤。

  why missed  -> 測試註解明確接受 streamed 200，未檢查 `page.goto()` 的 HTTP response status。

TOTAL: 1 findings
