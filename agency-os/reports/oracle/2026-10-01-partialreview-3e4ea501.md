# codex-oracle review -- 2026-10-01 20:35:16 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS type scale: every font-size literal in the shared stylesheet becomes one of six tokens (28/20/18/16/14/12px); 12px (--fs-tag) only for glance labels (TAG_OK); prose capped at 80 characters of its own size (--measure:80em on p/.lead/.how/.sub/.read/.finding/.station .why/.mocknote/.banner); content column widened 1000->1360px; phone padding tightened; --muted darkened #7a7261->#6f6757 for WCAG AA; .conf radius 999->10px so a wrapped badge is a box. check-mocks.py rule U22 pins the tokens, forbids size literals, restricts --fs-tag, requires the measure on PROSE; selftest mutations for each. Rounds 1-5 of this review found static-rule bypasses; the cascade cases (a more specific override, an inherited 12px) are now closed by render-mocks.cjs measuring computed styles (text you read >= 14px outside TAG_OK; PROSE inner width <= 80 x its font size, also at a 1920px measured-only pass), with the sets read from check-mocks.py --type-sets; the static rule stays as the fast first line. The 5 mock HTML files and apps/cognitive-web/app/design-system.css are byte copies written by sync-design-system.py (not in this diff). Check especially: overrides made dead by rule order or specificity (a media rule placed before the base rule), elements that now inherit an unintended size, false negatives/positives of the new rules in check_rule/check_tokens.
- exit: 0 | elapsed: 680509ms | answer: 2029B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The computed-style U22 check is not enforced by the publishing gate
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/build-artifact.py:37,41 -> render-mocks.cjs:73
  confidence  -> CONFIRMED
  scenario    -> `check-mocks.py` returns 0 while a cascade-only type violation exists -> `build-artifact.py` still publishes because it never runs `render-mocks.cjs`.
  why missed  -> The renderer is documented as a manual pre-publish step, but the actual build gate invokes only the static checker.

FINDING 2: `--measure` is incorrectly accepted as a font-size token
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:27,374 -> render-mocks.cjs:39
  confidence  -> CONFIRMED
  scenario    -> `.read{font-size:var(--measure)}` -> static checking passes, computed size is 1280px, and rendering reports neither under-14 text nor an over-wide prose block.
  why missed  -> `--measure` shares the `TYPE_TOKENS` map with the six font-size tokens.

FINDING 3: U22 skips font-size literals inside `@keyframes`
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:159 -> check-mocks.py:381
  confidence  -> CONFIRMED
  scenario    -> Add `@keyframes tiny{from{font-size:13px}}` to the shared stylesheet -> the parser skips the block and `check_type` never sees the forbidden literal; the checker stays green.
  why missed  -> The existing CSS parser deliberately discards all keyframe bodies before rule validation.

FINDING 4: A later horizontal-overflow failure overwrites the U22 exit code
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs:85 -> render-mocks.cjs:76
  confidence  -> CONFIRMED
  scenario    -> An early page finds U22 and sets exit code 4, then a later page has horizontal overflow -> line 85 changes the final exit code to 1, so callers cannot distinguish the U22 failure.
  why missed  -> U22 assignment is guarded, but overflow assignment is unconditional.

TOTAL: 4 findings
