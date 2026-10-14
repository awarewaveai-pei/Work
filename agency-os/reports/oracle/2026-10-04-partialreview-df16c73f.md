# codex-oracle review -- 2026-10-04 14:18:27 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/gather.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GatherPage.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `22e37008d~1..e0a823d55`
- context: GATHER block of the cognitive engine (whole block, all commits, code only). Rule: every stored or set-aside page gets a source card that says ONLY what a registry (asked through collect lookups), the web archive, a list or the page itself states; every cell is one of ?亙 (with a value) / ?乩???or ?⊥?瑼Ｘ (with why, never a value); pages copying one origin are grouped (a group is ??蝭?only when every pair is alike; original or copy is decided only for ??蝭?; under two independent origins or too few search channels the system stops and the person decides; a case holds at most 800 cards; the AI is never the source of a cell. Find: a cell that claims more than its evidence (a look-alike read as the real outlet, a copyright line read as the operator, a date from the page's own claim read as first seen), grouping that merges unlike pages or splits like ones, ways one origin counts as two (or two as one), cases where ?乩???is said without having looked, injection through page text into a cell, and unhandled edge cases (empty text, huge pages, odd encodings, non-http urls). Every finding with file:line.
- exit: 0 | elapsed: 828181ms | answer: 3641B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/gather.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GatherPage.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: GATHER cannot import because `_COPYRIGHT` has an unmatched parenthesis.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:38
  confidence  -> CONFIRMED
  scenario    -> API imports the module -> `re.error` aborts startup or disables the GATHER hook.
  why missed  -> No import/startup smoke test exercises the regex.

FINDING 2: A copyright or photo-credit line is promoted to the operator.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:162
  confidence  -> CONFIRMED
  scenario    -> Footer says `© 2024 Acme Photography` -> operator cell is FOUND as “Acme Photography”, although the page only identifies a copyright holder.
  why missed  -> The explanatory `why` admits the limitation but the state remains FOUND.

FINDING 3: Operator `NOT_FOUND` is emitted after inspecting only the final 800 characters.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:160
  confidence  -> CONFIRMED
  scenario    -> Page body says “About us: Acme”, footer has no copyright line -> operator cell says NOT_FOUND.
  why missed  -> The implementation silently treats the footer slice as the whole page.

FINDING 4: A page’s published date is treated as its first-seen date.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:187
  confidence  -> CONFIRMED
  scenario    -> Page claims `2026-01-01`, archive lookup is unavailable -> first_seen is FOUND as `2026-01-01`, and grouping may mark an older copy as original.
  why missed  -> Publication metadata was conflated with an observed archive date.

FINDING 5: A closed link component is grouped even when links are not reciprocal.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:337
  confidence  -> CONFIRMED
  scenario    -> A links B, B links A, C links only A -> all three are unioned into one “只互相引用” group.
  why missed  -> The algorithm checks that links stay inside the component, not that every pair mutually links.

FINDING 6: The original/copy cell is populated for groups that are not `同一篇`.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:374
  confidence  -> CONFIRMED
  scenario    -> Two unrelated pages are grouped solely by mutual links -> `original` becomes FOUND with “只互相引用，沒有別的依據”.
  why missed  -> The branch encodes “insufficient basis” as a found value instead of leaving original/copy undecided.

FINDING 7: Large copied pages can be split because grouping compares only the first 20,000 normalized characters.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py:255
  confidence  -> CONFIRMED
  scenario    -> Two pages have different 30,000-character headers but identical article text afterward -> no text edge is found and they count as separate origins.
  why missed  -> The performance cap is treated as a complete comparison.

FINDING 8: A completed zero-result search does not trigger the required stop.
  file:line   -> Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GatherPage.tsx:292
  confidence  -> CONFIRMED
  scenario    -> Search completes with zero cards and adequate channel coverage -> `cards.length > 0` is false, so the under-two-origins stop panel is hidden.
  why missed  -> The condition suppresses the pre-search warning but cannot distinguish it from a completed empty result.

TOTAL: 8 findings
