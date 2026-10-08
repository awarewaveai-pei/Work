# codex-oracle review -- 2026-10-08 10:43:39 +08:00

- mode: `review`
- scope: whole repo
- target: `1e1b23385`
- context: GATHER round 5b (fixes your 3 findings on 3013230ea): _language takes the reading (collected body/record with no letters -> 無法檢查); a word open at a 20,000-char chunk end is carried to the next chunk; collect sink drops the whole outlinks field when cutting, engine trusts [] only with imageUrl present; LINKS_CUT note for any site whose links are not known whole; a set-aside page gives 無法檢查 for date and ellipsis-cut title. Hunt: any absence conclusion still reachable from partial/unread input; the imageUrl heuristic wrong for older collect output; carry logic edge cases; guards whose removal leaves tests green.
- exit: 0 | elapsed: 298849ms | answer: 481B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/core/domain/source.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/gather.py, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json, Projects/internal/cognitive-engineering-os/tests/unit/test_block_gather.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-wire-v2.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An unread URL with no archive result is mislabeled as a pasted file.

  gather.py:319 -> gather.py:325  
  confidence  -> CONFIRMED  
  scenario    -> `text=None`, URL present, and `looked=None` -> `_first_seen` returns 「你貼的檔案沒寫日期，也沒有網址…」 instead of saying the unread page cannot be checked.  
  why missed  -> The test supplies an archive result for set-aside pages, so it does not exercise the `looked=None` path.

TOTAL: 1 findings
