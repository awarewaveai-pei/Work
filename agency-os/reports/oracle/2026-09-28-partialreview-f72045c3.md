# codex-oracle review -- 2026-09-28 22:41:38 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/svgtext.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-result-mock.html  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fix for a Codex finding (an interpretation retry was not checked against the daily token budget): _MeteredProvider now meters EVERY paid call (budget check + worst-case reservation before it, usage recorded after it, billed failures too; the tenant lock never spans the model call) and is used by both interpretation and synthesis; the interpretation runner lost its own one-shot reservation. Plus P-16: post-mount line measurement (useLines in svgtext.tsx) so SVG boxes are as tall as the browser wraps their text. Plus I-15: input-card extras written into the mock; LazyFill says things in words, not codes; DescribeFirst/SaveTo shared by RunPage and the parity test. Also verify: does this change depend on something NOT visible in this diff (config, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 111480ms | answer: 1373B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/svgtext.tsx, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-result-mock.html, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.test.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Budget validation ignores the reservation being added, so a call can exceed the daily token budget even when no retry occurs.

  file:line   -> `ai_lego/apps/api/main.py:1241-1244` -> `ai_lego/apps/api/main.py:2002-2008`
  confidence  -> CONFIRMED
  scenario    -> Daily budget is 30 tokens and usage is 0; `_require_ai` passes because `0 < 30`, then the call reserves roughly 28,000 tokens and proceeds, exceeding the budget before any retry.
  why missed   -> The retry test only proves the second call is rejected after actual usage is recorded; it does not detect that the first call itself bypasses the worst-case reservation limit.

FINDING 2: Post-mount SVG measurement uses CSS pixels while chart widths are SVG viewBox units, causing incorrect line counts on responsive charts.

  file:line   -> `apps/cognitive-web/components/result/svgtext.tsx:39-43` -> `apps/cognitive-web/app/design-system.css:112`
  confidence  -> CONFIRMED
  scenario    -> A 460-unit chart renders at 320 CSS pixels; a 150-unit box is actually about 104 CSS pixels wide, but the probe measures at 150 CSS pixels, counts fewer wrapped lines, and leaves the SVG box too short for its text.
  why missed   -> The implementation assumes the drawing units and DOM CSS pixels are identical; the global `svg { width: 100% }` rule makes that false on narrower screens.

TOTAL: 2 findings
