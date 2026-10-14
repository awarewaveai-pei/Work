# codex-oracle review -- 2026-10-01 20:19:04 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS type scale: every font-size literal in the shared stylesheet becomes one of six tokens (28/20/18/16/14/12px); 12px (--fs-tag) only for glance labels (TAG_OK); prose capped at 80 characters of its own size (--measure:80em on p/.lead/.how/.sub/.read/.finding/.station .why/.mocknote/.banner); content column widened 1000->1360px; phone padding tightened; --muted darkened #7a7261->#6f6757 for WCAG AA; .conf radius 999->10px so a wrapped badge is a box. check-mocks.py rule U22 pins the tokens, forbids size literals, restricts --fs-tag, requires the measure on PROSE; four new selftest mutations. The 5 mock HTML files and apps/cognitive-web/app/design-system.css are byte copies written by sync-design-system.py (not in this diff). Check especially: overrides made dead by rule order or specificity (a media rule placed before the base rule), elements that now inherit an unintended size, false negatives/positives of the new rules in check_rule/check_tokens.
- exit: 0 | elapsed: 698310ms | answer: 904B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The prose-width check ignores more-specific `max-width` overrides.
  file: `design-system.css:124` -> `check-mocks.py:425`
  confidence -> CONFIRMED
  scenario -> Add `.card p{max-width:none}` -> paragraphs inside cards exceed `--measure`, but `p` remains in `measured` and the checker passes.
  why missed -> The self-test only removes a prose selector from the measure rule (`check-mocks-selftest.py:54-55`), never testing an overriding rule.

FINDING 2: U22 allows inherited font sizes on selectors outside `TAG_OK`.
  file: `design-system.css:29` -> `check-mocks.py:374`
  confidence -> CONFIRMED
  scenario -> At widths ≤760px, add `.navi .read{font-size:inherit}` -> `.read` inherits the navigation’s 12px size, but U22 reports no violation.
  why missed -> The self-test covers literal and shorthand sizes, but no `inherit` case (`check-mocks-selftest.py:51-62`).

TOTAL: 2 findings
