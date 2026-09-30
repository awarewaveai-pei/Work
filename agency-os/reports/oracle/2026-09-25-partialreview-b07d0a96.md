# codex-oracle review -- 2026-09-25 07:21:57 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/partials/home-catalog-script.html, Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS HTML mocks: home becomes an app shell (left main menu, four hash-routed views); router script reveal()/route(); per-page generated menu partial; gate rules (app shell, aria-current, views, in-page links, unique ids, placement) and a selftest coverage gate where every self.bad call site must be proven by a mutation case. Look for router bugs, rules the gate misses, and coverage gaps.
- exit: 0 | elapsed: 126617ms | answer: 585B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/partials/home-catalog-script.html, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The hero-count gate may reject the valid page because its regex requires ASCII parentheses while the displayed text uses full-width Chinese parentheses.
  check-mocks.py:622 -> home-mock.html:hero sentence
  confidence  -> PLAUSIBLE
  scenario    -> home contains `285 個思考工具、12 條工作流（另 7 條平台維運用）` -> regex finds no match and reports the hero sentence missing despite correct counts.
  why missed  -> The expected diagnostic and selftest mutation use full-width `（…）`, but the validation regex uses `\(` and `\)`.

TOTAL: 1 findings
