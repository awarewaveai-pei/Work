# codex-oracle review -- 2026-10-01 19:31:36 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS type scale: every font-size literal in the shared stylesheet becomes one of six tokens (28/20/18/16/14/12px); 12px (--fs-tag) only for glance labels (TAG_OK); prose capped at 80 characters of its own size (--measure:80em on p/.lead/.how/.sub/.read/.finding/.station .why/.mocknote/.banner); content column widened 1000->1360px; phone padding tightened; --muted darkened #7a7261->#6f6757 for WCAG AA; .conf radius 999->10px so a wrapped badge is a box. check-mocks.py rule U22 pins the tokens, forbids size literals, restricts --fs-tag, requires the measure on PROSE; four new selftest mutations. The 5 mock HTML files and apps/cognitive-web/app/design-system.css are byte copies written by sync-design-system.py (not in this diff). Check especially: overrides made dead by rule order or specificity (a media rule placed before the base rule), elements that now inherit an unintended size, false negatives/positives of the new rules in check_rule/check_tokens.
- exit: 0 | elapsed: 860755ms | answer: 1704B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: U22 accepts undefined `--fs-*` tokens.
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:383
  confidence  -> CONFIRMED
  scenario    -> `.bad{font-size:var(--fs-ghost)}` passes the checker; the browser treats the undefined variable as invalid and falls back to an unintended size.
  why missed  -> The regex validates the naming pattern, not membership in `TYPE_TOKENS`.

FINDING 2: U22 allows `--fs-tag` through the `font` shorthand.
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:385
  confidence  -> CONFIRMED
  scenario    -> `.read{font:var(--fs-tag)/1 system-ui}` passes despite `.read` not being in `TAG_OK`, rendering readable text at 12px.
  why missed  -> The `--fs-tag` restriction only examines `font-size` declarations, not `font` shorthand.

FINDING 3: U22 skips declarations on every `:root*` selector.
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:364
  confidence  -> CONFIRMED
  scenario    -> Adding `:root{font-size:13px}` passes all checks, so a forbidden literal can change root/rem sizing without detection.
  why missed  -> Root rules are returned from `check_rule` before the new U22 checks run.

FINDING 4: The prose-width check omits `.mocknote` and `.banner`.
  file:line   -> Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py:30
  confidence  -> CONFIRMED
  scenario    -> Removing `.mocknote,.banner` from `design-system.css:124` still passes U22, allowing those blocks to exceed the 80em measure.
  why missed  -> `PROSE` contains only seven selectors, while the stylesheet requirement includes nine.

TOTAL: 4 findings
