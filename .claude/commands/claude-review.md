Cross-model oracle for a change **written by Codex** — the R0 [驗證計畫] Review 動作 when Codex is the writer. AGENTS.md §4: the reviewer is always the model that did NOT write the change, so a Claude session uses `/codex-review` and a Codex session uses this command. Codex reaches this file through the `claude-compat` command index.

## Step 0 — Quota circuit breaker

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action check -Tool critic
```

`critic` is the Claude quota. Exit 3 → stop: write `- ORACLE_WAIVED: claude quota blocked until <time>` in today's WORKLOG and do the written adversarial self-review + mutation evidence instead. Exit 0 → continue.

## Step 1 — Run the oracle

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claude-oracle.ps1 -Context "<what this change solves, one line>"
```

The script captures the diff BEFORE the review (same capture-then-review rule as `/codex-review` Step 1.5), runs `claude -p` read-only (Read/Grep/Glob, hooks and MCP off), then lands the ORACLE-gate artifact `agency-os/reports/oracle/<date>-review-*.md` with `reviewer: claude`.

Exit codes: 0 artifact written · 2 nothing to review · 3 quota blocked (breaker already set; go to the Step 0 fallback) · 4 refused because this is a Claude session (Claude would be reviewing its own change) · 1 failure (read the message; a second failure → ask the operator one question).

## Step 2 — Record

Copy the printed `REVIEW_DONE:` line into today's WORKLOG verbatim. Verify every `file:line` finding against the repo before acting; report findings to the operator unedited. Any edit to staged source after the review makes the artifact stale for the ORACLE gate → re-run Step 1.
