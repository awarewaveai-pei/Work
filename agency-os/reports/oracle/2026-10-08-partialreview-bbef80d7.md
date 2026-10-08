# codex-oracle review -- 2026-10-08 09:18:43 +08:00

- mode: `review`
- scope: whole repo
- target: `3013230ea`
- context: GATHER round 5 of the Cognitive Sovereignty Platform engine (Projects/internal/cognitive-engineering-os) fixing your round-4 findings. Invariant (module docstring of ai_lego/platform/block_hooks/gather.py): a conclusion that rests on absence (查不到, 「只互相引用」) may only come from input read whole; every partial reader says so (READ_BODY, READ_RECORD, outlinks_whole, COLLECT_TITLE_CHARS) and such conclusions become 無法檢查 or the page is left out. F1 footer stripped -> operator cell 無法檢查 for collected pages; F2 outlink cap -> outlinks_whole() and non-whole pages never in a circle, collect sends the list whole or not at all; F3 no text cache, per-page fingerprint, tracemalloc-bounded test. Caps gate tests list every cut in http-html.ts, sinks/cognitive.ts and gather.py. Hunt: a remaining absence-based conclusion drawn from a partial read; a cut not in the caps list; the memory bound really bounded at 800 cards; backward compatibility with the deployed collect; tests that stay green if a guard is removed.
- exit: 0 | elapsed: 337427ms | answer: 1903B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/source.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/gather.py, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_SHARED_RULES.md, Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json, Projects/internal/cognitive-engineering-os/tests/unit/test_absent_is_none.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_gather.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-wire-v2.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/collectors/http-html.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A partial body with no letters is reported as “not found” language.
  file:line   -> `ai_lego/platform/block_hooks/gather.py:208-209` and `ai_lego/platform/block_hooks/gather.py:344`
  confidence  -> CONFIRMED
  scenario    -> A collected page’s extracted body is empty or contains only digits/punctuation, while its stripped footer contains language text -> `_language()` returns `查不到` instead of `無法檢查`.
  why missed  -> The tests exercise `_language()` directly and do not pass a partial collect reading through `_cells()`.

FINDING 2: Chunking splits words at 20,000-character boundaries and changes language classification.
  file:line   -> `ai_lego/platform/block_hooks/gather.py:198` -> `ai_lego/platform/block_hooks/gather.py:204`
  confidence  -> CONFIRMED
  scenario    -> A 40,000-character text has `the` as the last token of chunk one and `and` as the first token of chunk two, forming `theand` in the real text -> whole-text analysis is uncheckable, but chunk-local counting reports English.
  why missed  -> The regression test checks letters beyond the first chunk, not tokens crossing a chunk boundary.

FINDING 3: Relevance trimming can send a cut outlink list as an empty list that `outlinks_whole()` accepts as complete.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts:183` -> `Projects/internal/cognitive-engineering-os/ai_lego/core/domain/source.py:37-42`
  confidence  -> CONFIRMED
  scenario    -> One outlink plus oversized image/anchor metadata exceeds 4096 bytes -> the sink removes the sole link, retains `outlinks: []`, and removes other fields until it fits -> `outlinks_whole()` returns true, so GATHER omits the `LINKS_CUT` warning.
  why missed  -> The test uses enough links that trimming stops with a non-empty list; it never tests the one-link-to-empty case.

TOTAL: 3 findings
