# codex-oracle review -- 2026-10-01 19:52:05 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS type scale: every font-size literal in the shared stylesheet becomes one of six tokens (28/20/18/16/14/12px); 12px (--fs-tag) only for glance labels (TAG_OK); prose capped at 80 characters of its own size (--measure:80em on p/.lead/.how/.sub/.read/.finding/.station .why/.mocknote/.banner); content column widened 1000->1360px; phone padding tightened; --muted darkened #7a7261->#6f6757 for WCAG AA; .conf radius 999->10px so a wrapped badge is a box. check-mocks.py rule U22 pins the tokens, forbids size literals, restricts --fs-tag, requires the measure on PROSE; four new selftest mutations. The 5 mock HTML files and apps/cognitive-web/app/design-system.css are byte copies written by sync-design-system.py (not in this diff). Check especially: overrides made dead by rule order or specificity (a media rule placed before the base rule), elements that now inherit an unintended size, false negatives/positives of the new rules in check_rule/check_tokens.
- exit: 0 | elapsed: 489928ms | answer: 777B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: U22 rejects valid whitespace inside `var()` references.
  check-mocks.py:25 -> check-mocks.py:370
  confidence  -> CONFIRMED
  scenario    -> `font-size:var( --fs-body );` is valid CSS, but `FS_VAR.fullmatch()` fails and the checker reports U22.
  why missed  -> Selftests only use the whitespace-free spelling.

FINDING 2: Valid system-font shorthands bypass the type-scale check.
  check-mocks.py:26 -> check-mocks.py:368
  confidence  -> CONFIRMED
  scenario    -> `body{font:caption}` is valid CSS, but `caption` is absent from `FONT_SIZE_WORD`; the parser falls back to `"inherit"` and accepts it, allowing a browser-dependent size.
  why missed  -> The keyword list omits CSS system-font keywords such as `caption`, `menu`, and `status-bar`.

TOTAL: 2 findings
