# General Codex queue (/codex-do)

A Claude session hands one card-sized task to Codex with `/codex-do` (`.claude/commands/codex-do.md`). The driver is the same one the COS build uses (`scripts/codex-continue.ps1`); this folder only declares its own settings in `queue.json`:

| setting | value | why |
|---|---|---|
| `profile` | `general` | check shapes for the whole repo (`npm test`, `node --test`, `python -m pytest`, any `python -m unittest` module, `npx tsc --noEmit`, `npx vitest run`); SSOT `command_shape_error` in `Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py` |
| `worktree` / `state_dir` | `D:/tmp/codex-do`, `D:/tmp/codex-do-state` | never shared with the COS queue |
| `work_ref` | `refs/codex/do` | Codex's commits stay here until reviewed |

Run (the slash command does this):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1 -QueueDir agency-os/handoffs/codex-queue -MaxCards 1
```

After a card is done: `/claude-review` the commit, cherry-pick it onto main, strike its row in `agency-os/reports/review-debt.md`. Stop messages and what to do: same table as `agency-os/handoffs/cos-codex-queue/README.md` (state file here is `D:/tmp/codex-do-state/state.json`).
