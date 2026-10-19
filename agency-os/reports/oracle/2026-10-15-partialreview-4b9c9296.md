# codex-oracle review -- 2026-10-15 10:43:20 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py, Projects/internal/cognitive-engineering-os/docs/TOOL_PAGE_TEMPLATE.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New unittest: every backticked file:line citation in docs/TOOL_PAGE_TEMPLATE.md must resolve to exactly one file and the cited lines must contain the anchor text registered in ANCHORS; bare :line refused; stale anchors refused. Goal: the template can never again describe code it did not read. Check false-greens (citations the regex misses, anchors too weak to catch a moved line), path resolution ambiguity, Windows encoding.
- exit: 0 | elapsed: 329597ms | answer: 2227B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/TOOL_PAGE_TEMPLATE.md, Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Valid citations to unsupported file types are silently ignored.
  Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:25,97-99 -> Projects/internal/cognitive-engineering-os/docs/TOOL_PAGE_TEMPLATE.md:18
  confidence  -> CONFIRMED
  scenario    -> Add `` `docs/mockups/iceberg-result-mock.html:12` `` without an anchor; the parser filters it out, so all tests remain green.
  why missed  -> A hard-coded extension allowlist silently narrows “every file:line citation.”

FINDING 2: Anchors are weak substring checks and can validate stale lines.
  Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:28,129-130 -> Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md:63
  confidence  -> CONFIRMED
  scenario    -> The I11 section moves to line 64, while unrelated line 63 still mentions “I11”; `"I11" in line` passes and the stale citation remains green.
  why missed  -> The check tests incidental substring presence, not an exact or structurally meaningful anchor.

FINDING 3: Path resolution accepts directories as files and can crash.
  Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:83-87,125 -> Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:125
  confidence  -> CONFIRMED
  scenario    -> A directory named `fixture.py` is uniquely matched; `resolve()` returns it, then `read_text()` raises `IsADirectoryError` instead of reporting an invalid citation.
  why missed  -> `resolve()` never checks `candidate.is_file()`.

FINDING 4: The resolver searches `tests/` despite its documented source scope.
  Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:6,22,121-123 -> Projects/internal/cognitive-engineering-os/tests/unit/test_tool_page_template.py:22
  confidence  -> CONFIRMED
  scenario    -> A template citation to `tests/fixtures/example.py:1` with a matching anchor resolves and passes, allowing a test fixture—not product code—to serve as the cited source.
  why missed  -> `ROOTS` includes `COS / "tests"` although the checker’s contract lists only the web app, `ai_lego`, `docs`, and SPEC.

TOTAL: 4 findings
