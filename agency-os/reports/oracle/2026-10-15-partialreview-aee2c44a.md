# codex-oracle review -- 2026-10-15 18:53:59 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cognitive OS: new GET /exists/{kind}/{id} (ai_lego/apps/api/blocks/exists.py) answers 204 / the read route's own 404 body for project, interpretation (any state), group, method, using the SAME guard each read route uses (main._project_or_404, new main._asked_interpretation_or_404 extracted from GET /interpretations/{id}, groups.member_group, catalog.is_resolvable). The web middleware (apps/cognitive-web/lib/known-address.ts) calls it on page loads instead of the full read routes, deadline 3000->800 ms; non-404 or a 404 without the kind code = pass through. Must not disclose existence to non-owners beyond what the read route does. Also verify: does this change depend on something NOT visible in this diff - a config value, timeout, schema assumption, or upstream default defined elsewhere? If it contradicts the change, report it. If you cannot support a real finding, say so and return no findings; do not invent weak findings.
- exit: 0 | elapsed: 240732ms | answer: 1302B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/known-address.ts, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/exists.py, Projects/internal/cognitive-engineering-os/tests/unit/test_exists_api.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `/exists/method/{id}` adds authentication absent from the public method read route.
  ai_lego/apps/api/blocks/exists.py:29-31 -> ai_lego/apps/api/main.py:1321-1328
  confidence  -> CONFIRMED
  scenario    -> Active, form-resolvable method with no session cookie -> `/methods/{id}/form` returns 200, but `/exists/method/{id}` resolves `require_session` first and returns 401 instead of 204.
  why missed  -> The test logs in before checking all kinds and omits method from its read-route parity map (`tests/unit/test_exists_api.py:16,22-25`).

FINDING 2: Non-method existence checks unnecessarily depend on method-catalog health.
  ai_lego/apps/api/blocks/exists.py:29-31 -> ai_lego/apps/api/main.py:651-663; ai_lego/platform/ai_execution/contract_catalog.py:61-70
  confidence  -> CONFIRMED
  scenario    -> An unreadable or duplicate method contract causes catalog loading to fail; `/projects/{id}` still works, but `/exists/project/{id}` fails before `_project_or_404`. The web probe maps that failure to `null` (`apps/cognitive-web/lib/known-address.ts:38-45`), so an unknown project page streams with 200 instead of being rewritten to 404.
  why missed  -> The catalog dependency is resolved before the `kind` branch, while happy-path tests use a healthy catalog only.

TOTAL: 2 findings
