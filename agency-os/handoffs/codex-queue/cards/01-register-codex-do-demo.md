# Card 01 — Register the general Codex queue in RUNNABLE_DEMOS

## Decision

The general Codex queue (`agency-os/handoffs/codex-queue/`, slash command `.claude/commands/codex-do.md`, driver `scripts/codex-continue.ps1`) is new product tooling. AGENTS.md DoD "Product work" requires one row in `agency-os/docs/operations/RUNNABLE_DEMOS.md` that the operator can run. Add that row.

## Constraints

- Add ONE new row directly under the table header (newest row on top, `RUNNABLE_DEMOS.md:5-6` is the header). Do not change any other row; the file keeps its UTF-8 BOM and LF line endings.
- Columns: 日期 `2026-10-24` | 系統 | 指令（從 `D:\Work` 執行） | 你會看到什麼 | 誠實範圍. Plain Chinese, one idea per sentence.
- Command to put in the row: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-continue.ps1 -QueueDir agency-os/handoffs/codex-queue -DryRun` (lists the cards that would run, changes nothing).
- What you see: one line per pending card `(dry run) would run cards/NN-....md`, then `finished: N card(s) done this run`.
- Honest scope: Codex writes in `D:/tmp/codex-do` only; its commits stay on `refs/codex/do` until Claude reviews them; cards that need deploy, migration or SSH are skipped (`high_stop`).

## Files

- `agency-os/docs/operations/RUNNABLE_DEMOS.md`
- `agency-os/reports/review-debt.md` (the standing review-debt row)

## Acceptance

- `git diff` of `RUNNABLE_DEMOS.md` shows exactly one added line and no removed line.
- The check command below exits 0.
