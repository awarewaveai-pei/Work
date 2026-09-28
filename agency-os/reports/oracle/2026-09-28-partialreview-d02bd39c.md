# codex-oracle review -- 2026-09-28 22:49:06 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_synthesis.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/svgtext.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-result-mock.html  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3, after fixing round 2 finding 1 (a metered call now starts only if its worst case fits what is left today: _require_ai reserve parameter) and refuting round 2 finding 2 by measurement (foreignObject HTML is laid out in SVG user units, then scaled: at 390px viewport a 370-unit box has clientWidth 370 and 109px on screen). Original change: fix for a Codex finding (an interpretation retry was not checked against the daily token budget): _MeteredProvider now meters EVERY paid call (budget check + worst-case reservation before it, usage recorded after it, billed failures too; the tenant lock never spans the model call) and is used by both interpretation and synthesis; the interpretation runner lost its own one-shot reservation. Plus P-16: post-mount line measurement (useLines in svgtext.tsx) so SVG boxes are as tall as the browser wraps their text. Plus I-15: input-card extras written into the mock; LazyFill says things in words, not codes; DescribeFirst/SaveTo shared by RunPage and the parity test. Also verify: does this change depend on something NOT visible in this diff (config, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 90896ms | answer: 802B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/svgtext.tsx, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-result-mock.html, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_synthesis.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LazyFill.test.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Draft endpoints bypass the new worst-case reservation and per-call metering.

  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:1306` -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/draft.py:248`
  confidence  -> CONFIRMED
  scenario    -> A tenant has 195,000/200,000 tokens used; `/ai/draft/method/...` passes `_require_ai(..., reserve=0)`, then the draft parser retries at `draft.py:248-262`. Both paid calls run, potentially exceeding the daily budget, and the tenant lock remains held across the model call.
  why missed   -> The change wrapped interpretation and synthesis, but the existing method/recipe draft paths still call the provider directly and only record usage after the whole draft operation.

TOTAL: 1 finding
