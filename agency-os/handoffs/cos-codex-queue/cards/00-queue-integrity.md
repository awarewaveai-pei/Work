# Card 00 — the queue checks itself (also the smoke test of the driver)

## Decision
The card queue (`agency-os/handoffs/cos-codex-queue/queue.json`, `cards/`, `gates/`, `PREAMBLE.md`) is what keeps Codex building when no Claude session is around. A malformed queue (a card file that does not exist, two cards with one id, a card that depends on a later card, a check command that is empty) would stop the driver or, worse, skip work silently. One test holds the queue's shape.

## Constraints
- New test only: `Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py`. Read the queue from the MAIN checkout's path relative to the repository root (`Path(__file__)` upward until a `agency-os` folder exists; in a worktree that folder is the worktree's own copy, which is correct).
- Do not edit `queue.json` or any card. If the queue is wrong, `BLOCKED:` with the line.
- Plain `unittest`, no new dependency.

## Files
- new: `Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py`
- `agency-os/reports/review-debt.md` (one row)

## Acceptance (the test must prove all of these on the real queue and fail on a broken copy)
1. `queue.json` parses; every card has `id`, `file`, `check` (a non-empty list of `{cwd?, cmd}` with a non-empty `cmd`), `depends` (a list), `gate` (a string or null), `high_stop` (a boolean).
2. ids are unique; every `file` exists under the queue folder and its first line starts with `# Card <the id's number>`; every id in `depends` is an EARLIER card.
3. every gate named is a file name that `gates/README.md` documents (read that file: each gate has a line `- <name>: <what must be true before it is created>`).
4. every `cmd` that starts with `python -m unittest` names a module that exists under `tests/unit/` (the module is allowed to be created by the same card: if the module is missing, the card's own `file` text must mention the module name).
5. a card with `high_stop: true` has no `check` command that contains `docker compose up`, `ssh`, `safe-infra-patch`, `git push` or `apply-db-migration`.
6. `PREAMBLE.md` exists and contains the words `CARD_DONE`, `DECISION_NEEDED:` and `BLOCKED:`; the driver script `scripts/codex-continue.ps1` exists and the same three tokens appear in it.
Build the broken copies inside the test with `tempfile` (a duplicate id, a missing file, a forward dependency, an empty cmd, a high_stop card with `ssh`) and assert each one is reported by the same function that validates the real queue (write that function so it takes a dict and a base folder). Mutations to run and report: delete each rule's check in turn -> its broken-copy test goes red.
