# Card 80 — close the steps 3+4 wave: checklist, integrity gate, page walk, supervisor facts

## Decision
Everything of steps 3 and 4 is built or listed. This card proves it holds together and leaves the facts in one place for the operator. It changes no feature.

## Constraints
- `docs/platform/STEP34_CHECKLIST.md`: for each of the five cards `docs/platform/step34-cards/*.card.txt`, each line becomes `built: <where, file:line>` or `NOT YET: <why>`; no line may be missing (a test compares the card files line by line with the checklist and fails on a card line absent from it).
- The integrity core (`ai_lego/platform/integrity.py`, read how step 1 and 2 registered `Check(...)` rows) gets one row per new rule that is machine-checkable: blind write, consent read path only, appeals never readable by their subject, no outbound send from EXPRESS, facilitator needs training, no score/rank keys in new kinds. Each row points at the test that proves it. Run its test module (`tests/unit/test_integrity.py`) and fix only what your rows break.
- Page walk: a Playwright script `scripts/page_walk_step34.mjs` (follow `agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/check-supervisor.mjs` and the web app's existing `playwright` use for the launching pattern) that, against a locally running stack with seeded test data, opens each new page (groups list, a group, GOVERN data page, TEACH, EXPRESS, FACILITATE) at 1280 and 400 wide, fails on a console error, on horizontal page scroll, on a `<select>`, on a literal colour in the DOM styles, and on any forbidden word (票 排名 分數 進度), and saves screenshots to a folder given by `--out`. Seed data comes from a fixture script `scripts/seed_step34.py` using test values only (never real credentials; test accounts are created in the local test database only). The walk runs on `localhost`; document the exact commands to start the stack in the script header; if you cannot start the stack from the worktree, `BLOCKED:` with the command and its output rather than faking a pass.
- Supervisor facts file `agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/STEP34_BUILT.md`: per block, what exists, what is NOT YET, the tests and counts, what the operator must decide before go-live (a short list). Do NOT edit `platform-supervisor.html` (a Claude session updates the supervisor page from this file).

## Files
`docs/platform/STEP34_CHECKLIST.md`, `ai_lego/platform/integrity.py`, `tests/unit/test_step34_checklist.py`, `tests/unit/test_integrity.py` (only if rows require), `scripts/page_walk_step34.mjs`, `scripts/seed_step34.py`, `agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/STEP34_BUILT.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`tests/unit/test_step34_checklist.py` passes on the real card files and fails on a temp copy missing one line; `tests/unit/test_integrity.py` green with the new rows; the page walk exits 0 with 12 screenshots (6 pages x 2 widths) in the `--out` folder (list them in your final message); each integrity row has a mutation (remove the guard it names) that turns its test red, reported.
