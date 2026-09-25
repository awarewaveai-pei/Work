# codex-oracle review -- 2026-09-25 14:06:22 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: mockkit._yaml duplicate-key loader crashed on YAML merge keys (<<: *anchor), same bug the golden runner had (40366864a run_golden_tests.py:131-146). Fix: a plain constructor function (not SafeLoader generator) checks explicit keys only, then flatten_mapping, then builds the dict; unhashable key -> ValueError. A generator-based override was tried first and failed a nested merge chain (z:&z{k,v}; x:{inner:&a{<<:*z,v:2}}; y:{<<:*a,w}) because deferred construction let a later merge flatten the anchor node before its own check. Selftest: refactored mutation step into mutate(), added one CASES entry (duplicate key caught) and an ACCEPT list (valid variants must exit 0: a merge key in recipe-display-metadata.yaml). Look for: wrong precedence, missed duplicates, false duplicates, selftest counting/exit-code errors.
- exit: 0 | elapsed: 294003ms | answer: 11B
- files-reviewed: Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
