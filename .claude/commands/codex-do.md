---
name: codex-do
description: Hand one card-sized task to Codex (it writes the code in its own worktree; Claude reviews before main). Trigger on 派給 Codex, 交給 Codex 做, codex-do.
---

Dispatch `$ARGUMENTS` to Codex through the general queue (`agency-os/handoffs/codex-queue/`, driver `scripts/codex-continue.ps1`). Codex writes; the driver accepts on what it sees; Claude reviews; only then main.

## Step 0 — Is it worth dispatching?

Dispatch only a task whose every step can be written down now (AGENTS.md §5 「卡已寫死每一步」): a known set of files, a testable Acceptance, check commands that exist. A one-line fix, a lookup, or anything that still needs a design choice: do it here instead and say so in one line. Codex starts cold (reads AGENTS.md + the files), so small tasks cost more there than here.

Quota: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action check -Tool codex` — exit 3 = blocked, do the task here.

## Step 1 — Write the card

`agency-os/handoffs/codex-queue/cards/NN-<slug>.md`, NN = next free number (two digits), first line `# Card NN — <title>`. Sections, each with grep-verified `file:line`:

- **Decision** — what to build and why, settled (no open choices left to Codex).
- **Constraints** — what must not change; invariants.
- **Files** — the exact paths to touch.
- **Acceptance** — the tests that must exist and pass (named), plus mutations if the change guards privacy / visibility / erasure / consent / ownership.

Add the entry to `queue.json` `cards`: `{"id": "NN-<slug>", "file": "cards/NN-<slug>.md", "gate": null, "depends": [], "high_stop": false, "check": [{"cwd": "<dir>", "cmd": "<command>"}]}`. Allowed `cmd` shapes (anything else is refused): `npm test`, `npx tsc --noEmit`, `npx vitest run <x.test.ts>`, `node --test <x.test.mjs>`, `python -m pytest <x.py>`, `python -m unittest <module>`. A task whose last step needs a deploy, migration or SSH: `high_stop: true` — the driver skips it and the operator does that step.

Validate: `python Projects/internal/cognitive-engineering-os/scripts/validate-codex-queue.py --queue agency-os/handoffs/codex-queue --profile general` must print `queue valid`.

## Step 2 — Run it in the background

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1 -QueueDir agency-os/handoffs/codex-queue -MaxCards 1
```

Bash `run_in_background: true` (a card can take up to 120 minutes). Tell the operator in one line what was dispatched; keep working on other things. Never poll.

## Step 3 — When it finishes

| driver says | do |
|---|---|
| `done: <id> at <hash>` | `/claude-review` on that commit (`git show <hash>`); pass → bring the change onto main (`git cherry-pick <hash>`; when a touched file has another session's uncommitted hunks, copy Codex's lines into the worktree and commit through `scripts/git-partial-worktree-commit.py`), strike its row in `agency-os/reports/review-debt.md` with the review result, then reset the Codex side to main so the next card starts clean: `git update-ref refs/codex/do main` and `git -C D:/tmp/codex-do checkout -q --detach main`; fail → fix here or write a follow-up card |
| `needs a decision: …` | ask the operator that one question; write the answer into the card under `## Decision made`; remove the card from `D:/tmp/codex-do-state/state.json`; rerun |
| `blocked: …` | read `D:/tmp/codex-do-state/logs/<id>-*`; fix the card or the code; remove it from `state.json`; rerun |
| `Codex quota …` | do the rest here |

The queue entry and card stay in git as the record (commit them with the cherry-pick).
