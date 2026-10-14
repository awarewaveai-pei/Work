# codex-oracle review -- 2026-10-04 15:38:40 +08:00

- mode: `review`
- scope: whole repo
- target: `6025f5ac5`
- context: GATHER round 4 (Claude-written) answering your whole-block review. Check each fix closes its class: a copyright line alone is 查不到 with the line quoted (operator only from explicit phrases at the start of a line/sentence on the whole page); original/copy decided only from archive-observed dates for every page of a same-article group; link groups need every pair reciprocal and no link outside the group; the original cell is never FOUND for a group that is not 同一篇; grouping compares the WHOLE text via a bounded content-defined sample (max 2500 pieces per page), a short page searched in a long page's full text; the under-two-origins stop shows after a finished empty search. Rulesets gather.outlets and gather.grouping are v4. Also look for: performance blowups (memory per card, 800 cards, a 1,000,000-letter page), a way a cell claims more than its evidence, grouping that merges unlike pages, tests that pass with the guard removed. Every finding with file:line.
- exit: 0 | elapsed: 658475ms | answer: 2028B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/gather.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GatherPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GatherPage.tsx, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_SHARED_RULES.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_gather.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: HTML footers are removed before copyright/operator evidence is evaluated  
  file:line   -> `ai_lego/platform/block_hooks/gather.py:216`; `http-html.ts:19`, `http-html.ts:124`, `http-html.ts:230`  
  confidence  -> CONFIRMED  
  scenario    -> A fetched page contains `<footer>© 2024 Acme Photography</footer>` and no operator phrase -> extraction removes the footer, so GATHER returns the generic “這一頁沒寫是誰經營的” and cannot quote the required copyright line.  
  why missed  -> The added tests pass plain text directly to `_operator` (`tests/unit/test_block_gather.py:772`), bypassing HTML extraction.

FINDING 2: The 50-host outlink cap can produce false `只互相引用` groups  
  file:line   -> `ai_lego/platform/block_hooks/gather.py:517`; `http-html.ts:175`, `http-html.ts:182`  
  confidence  -> CONFIRMED  
  scenario    -> 51 sites mutually link to one another and each also links to an external 52nd host after its first 50 links -> extraction drops the outside link, and `_only_each_other` incorrectly labels the 51-site clique `只互相引用`.  
  why missed  -> The grouping code assumes `outlinks` is complete; the test only uses small link lists (`tests/unit/test_block_gather.py:814`).

FINDING 3: Full-text retention can exhaust memory at the documented card/page limits  
  file:line   -> `ai_lego/platform/block_hooks/gather.py:618`, `:666`; `ai_lego/platform/block_hooks/gather.py:366`; `ai_lego/core/domain/kinds/gather.py:15`; `apps/api/main.py:1500`, `:3446`  
  confidence  -> CONFIRMED  
  scenario    -> 800 active pages each contain 1,000,000 CJK letters, individually under the 5 MiB limit -> `_sources_arrived` retains every raw text and every normalized full `letters` string while grouping, consuming several GB and potentially being killed before saving the gather cards/origins.  
  why missed  -> The sample-piece cap limits hashes, but not the raw-text cache or `_Item.letters`; a bounded sample therefore does not bound memory per card.

TOTAL: 3 findings
