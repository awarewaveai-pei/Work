---
name: codex-review
description: Cross-model oracle review for a change WRITTEN BY CLAUDE -- the primary R0 verification Review action. Produces an ORACLE gate artifact.
---

Run the standard cross-model oracle review for R0 [驗證計畫] Review 動作 (AGENTS.md §跨模型 oracle, primary entry point since 2026-08-30). This command exists so two things are never left to memory: the two mandatory focus-text additions in Step 2, and the capture-before-review sequencing in Step 1.5 (2026-08-30 rewrite, closing a critic Critical finding — see Step 1.5's own note).

## Step 0 — Quota circuit breaker (2026-09-04, operator: 撞到額度就停)

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action check -Tool codex
```

Exit 3 = Codex is recorded as BLOCKED until the printed time: **stop here**, do not run Step 2 at all, write `- ORACLE_WAIVED: codex quota blocked until <time> (scripts/oracle-quota.ps1)` in today's WORKLOG and do the written self-review + mutation evidence instead (memory `feedback_self_review_when_oracle_down`). Exit 0 = continue.

## Step 1 — Estimate size

```bash
git status --short --untracked-files=all
git diff --shortstat --cached
git diff --shortstat
```

Treat untracked files as reviewable work even when the diff shortstat is empty. If nothing changed, report "No changes to review" and stop.

**Route by file count (2026-10-01).** Count the changed files above (staged + unstaged + untracked).
- **≤ 2 files** → Steps 1.5–3 below (companion `adversarial-review`, foreground `--wait`).
- **> 2 files** → skip Steps 1.5–3 and run `scripts/codex-oracle.ps1 -Mode review -Context "<one line>"` (background; it captures, inlines the diff, and writes its own artifact). Why: the companion inlines the diff only up to 2 files (`plugins/codex/scripts/lib/git.mjs:8` `DEFAULT_INLINE_DIFF_MAX_FILES = 2`); above that Codex must read the tree itself, and its managed shell rejects `git diff`/`Get-Content` outside `D:\Work` — on 2026-10-01 two of six rounds reviewed nothing, one of them returning a vacuous `approve`. `codex-oracle.ps1` always inlines (`:408`), so the reviewer never has to read files to see the change.

A review whose output says it could not read the diff/files is **not a review**: never land it as an artifact, never count it toward `REVIEW_DONE`.

## Step 1.5 — Capture the diff BEFORE calling codex

**Do not skip this step.** The first version of this command's artifact-writer computed `files-reviewed`/`deletions-reviewed` from a fresh `git diff` taken AFTER the review answer came back — completely disconnected from what was actually reviewed. Critic caught it as Critical: `-Answer "x"` (nothing reviewed) produced the exact same gate-satisfying token as a real review. The fix is capture-then-review, always in that order:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/write-oracle-artifact.ps1 -Mode capture -Out "$env:TEMP\oracle-capture-<stamp>.diff"
```

Real exit code 2 if there is nothing to review, or if HEAD looks like it just absorbed an auto-checkpoint commit (report that to the user rather than proceeding). Keep the `-Out` path — Step 3 needs it.

## Step 2 — Run the review with both mandatory focus-text additions

Neither addition below exists in the official `/codex:adversarial-review` prompt (verified 2026-08-30 by reading `~/.claude/plugins/marketplaces/openai-codex/plugins/codex/prompts/adversarial-review.md` in full) — do not drop either one, and do not paraphrase them.

`${CLAUDE_PLUGIN_ROOT}` is only set when Claude Code is executing the plugin's OWN command file — it is empty when this project command runs it instead (verified 2026-08-30: `echo $CLAUDE_PLUGIN_ROOT` prints nothing here). Use the resolved plugin path directly:

```bash
node "$HOME/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs" adversarial-review --wait "Also verify: does this change depend on something NOT visible in this diff — a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo? If it contradicts the change (e.g. makes it silently unreachable / dead code), report that as a finding even if it wasn't otherwise in scope. Reminder: if you cannot support a real finding after checking the above, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful -- that is worse than reporting nothing."
```

If that path doesn't exist (plugin reinstalled under a different marketplace/version), fall back to running the literal `/codex:adversarial-review` slash command with the same focus text as its argument instead of the `node` call above.

(Swap `--wait` for `--background` per Step 1's size call — same `Bash({..., run_in_background: true})` pattern `/codex:adversarial-review`'s own command file uses.)

Return the command's output verbatim to the user for this turn, same as `/codex:adversarial-review`'s own contract — do not paraphrase, summarize, or fix anything it reports.

**If the output contains `usage limit` / `rate limit` / `429` / `try again at`:** immediately record the breaker with the reset time from the message (`scripts/oracle-quota.ps1 -Action set -Tool codex -Until "<parsed time>" -Reason "<verbatim>"`; no time in the message → `-Hours 5`), then go straight to the fallback below. **Do not retry Codex in this session.** The `codex-oracle.ps1` fallback uses the same Codex quota, so on a quota error skip it too.

Note: Step 1.5's capture and this step's own diff collection run moments apart, not atomically — a change to the working tree in between (another concurrent session's auto-commit, for example) could make them diverge slightly. This is the same class of imperfection `codex-oracle.ps1` has always had; it is a real but small residual gap, not a regression from Step 1.5 not existing.

## Step 3 — Land the ORACLE-gate artifact

The command in Step 2 does not write into `agency-os/reports/oracle/`, so `verify-closeout-completeness.ps1`'s ORACLE gate will not see that a review happened until this step runs. Pass Step 1.5's capture file as `-ReviewedDiff` — without it, the artifact is written but honestly marked as unbound and will not satisfy a deletion-confirmation check:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/write-oracle-artifact.ps1 -Mode review -ReviewedDiff "$env:TEMP\oracle-capture-<stamp>.diff" -Context "<what this change is for, one line>" -AnswerFile "<path to a temp file holding Step 2's output>"
```

Always use `-AnswerFile` (write Step 2's output to a temp file first), not `-Answer` — avoids shell-quoting a multi-KB JSON blob.

## Step 4 — Record in WORKLOG

`write-oracle-artifact.ps1`'s own output prints the exact `REVIEW_DONE:` line to copy into today's WORKLOG `[驗證結果]` section — use it verbatim. If it prints `findings=<unknown>`, do not guess a number; read the artifact and count by hand. If it warns that no `-ReviewedDiff` was given, do not claim `REVIEW_DONE` for a commit that touches deleted files — re-run from Step 1.5.

## Fallback

If `/codex:adversarial-review` fails twice in a row (timeout, no output), drop to `.\scripts\codex-oracle.ps1 -Mode review -Context "<what changed>"` instead — it captures and reviews in one step with its own artifact, skip Steps 1.5 and 3 in that case. See AGENTS.md §跨模型 oracle for the full three-layer fallback chain (critic → `/codex-review` → `codex-oracle.ps1`).
