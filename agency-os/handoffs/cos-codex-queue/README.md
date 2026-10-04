# Codex card queue — how Codex keeps building without a Claude session

One command starts it (the operator runs it; nothing here runs by itself):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1
```

It takes the next card of `queue.json`, runs `codex exec --approve-for-me` in a throwaway worktree (`D:/tmp/cos-codex`, detached HEAD), then checks the result ITSELF (a new commit, a clean worktree, a row in `agency-os/reports/review-debt.md`, every `check` command of the card exits 0). Only then the card is done and the next starts. State and logs live outside git in `D:/tmp/cos-codex-state/` (`state.json`, `logs/`).

## What it never does

- push, merge into main, create a branch, deploy, apply a migration, touch a remote host (the preamble forbids it and a `high_stop` card is skipped);
- trust Codex's own "done": the driver re-runs the checks outside Codex.

Codex's commits stay reachable as `refs/codex/work` in the main repository (`git log refs/codex/work`). They go into main only after a Claude session reviewed them (`/claude-review`, the reviewer is never the author) and cleared their rows in `agency-os/reports/review-debt.md`; cherry-pick the cleared commits onto main then.

## When it stops (and what you do)

| Message | Meaning | What to do |
|---|---|---|
| `needs a decision: ...` | the card needs a product or security decision | answer in `cards/<id>.md` (add a `## Decision made` section), then set the card's status back: edit `D:/tmp/cos-codex-state/state.json`, remove that card's entry; run again |
| `blocked: ...` | the code contradicts the card, or 3 attempts failed the checks | read `D:/tmp/cos-codex-state/logs/<id>-*.txt`; fix the card text or the code; remove the card's entry from `state.json`; run again |
| `waits for gate 'x'` | a card needs something that is not true yet | create `gates/x` (one line of evidence) once it is true (see `gates/README.md`) |
| `Codex quota is blocked` | the ChatGPT-side quota; recorded by `scripts/oracle-quota.ps1` | run again after the reset |
| `High-STOP card ... skipped` | the card applies something to a real host | the operator does that step, with the card's own checklist |

Run one card to look first: `... codex-continue.ps1 -MaxCards 1`. List what would run: `... -DryRun`.

## Adding a card

1. Write `cards/NN-name.md` (Decision / Constraints / Files / Acceptance; the acceptance is a test that FAILS when the guard is removed, and a mutation list).
2. Add the entry to `queue.json` (`depends` = earlier ids, `gate` = a name from `gates/README.md` or null, `check` = commands that must exit 0, `high_stop` = true when the card's last step touches a real host).
3. `python -m unittest tests.unit.test_codex_queue` (card 00 creates it) must stay green.

## Standing rules

`PREAMBLE.md` is read by Codex before every card. Change it only by a dated line in the commit message.
