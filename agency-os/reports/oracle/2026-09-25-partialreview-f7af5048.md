# codex-oracle review -- 2026-09-25 18:29:26 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/chips-test.cjs, Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs, Projects/internal/cognitive-engineering-os/docs/mockups/partials/home-catalog-script.html, Projects/internal/cognitive-engineering-os/docs/mockups/partials/page-actions-script.html, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Mock catalogue: every tool gets its own page (home sub-view section#tool[data-under=tools], one hidden article.tpage#t-<id> per tool, generated from SPEC registries incl. contract recommended_next; ids that are not ACTIVE tools shown as not yet built, never linked). Router: sub-view keeps the menu on tools; tool page opens at top; back from a page restores the list scroll. No dead controls on all five pages: no span.btn, no href=#, every button has a behaviour; mock-only actions are button[data-mock=正式版...] and page-actions-script writes a note under the row; in-page links open their details fold. Checker rules: controls, per-page h1, crumbs only in tool pages on home, tool view/pages/rows, sub-view placement, cross-page artifact#anchor must land on an id of that page and be a plain anchor. chips-test: every check passes on the page and must FAIL on a copy without the script it tests. Look for: router scroll/back bugs, search interplay with tool pages, checker false passes/false reds, a11y of mock notes, selftest mutation anchors.
- exit: 0 | elapsed: 184520ms | answer: 11B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/chips-test.cjs, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/partials/home-catalog-script.html, Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs, Projects/internal/cognitive-engineering-os/docs/mockups/partials/page-actions-script.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
