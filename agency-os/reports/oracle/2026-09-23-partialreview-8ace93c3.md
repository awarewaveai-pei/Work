# codex-oracle review -- 2026-09-23 22:41:16 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 4 of high-risk-bash-warn rule 4 (prod ssh deploy-script gate). Rounds 1-3 authored by a session that hit its usage limit; this round reviews the fixes for round-3 findings: (F1) quoted remote commands spanning lines were only inspected on the ssh line -- the rule now scans the WHOLE command text for every prod-ssh occurrence (PROD_SSH_LINE_RE gets the m flag, a global exec loop) and treats a newline as a command-list separator inside executesDeployScript; (F2) a deploy script read by an earlier pipeline segment and consumed by a later shell (cat < sg-deploy.sh | bash, cat sg-deploy.sh | sudo bash) is now caught: pipeline segments are reduced in order and a script mentioned upstream counts as that shells stdin. 7 new P4-1d cases (4 exec, 3 read) added; suite 160/160. Please attack: any remaining position where a deploy script executes but the rule says read; false positives on common read-only diagnostics (tail, grep, cmp, stat, less, git log) after the change; regressions in the older P4-1d cases; performance on long multi-line commands.
- exit: 0 | elapsed: 115671ms | answer: 614B
- files-reviewed: mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Compact `bash -c` options can execute a deploy script without triggering the gate
  high-risk-bash-warn.js:58   -> high-risk-bash-warn.js:55
  confidence  -> CONFIRMED
  scenario    -> `ssh ks-aw-01 'sudo bash -c/root/lobster-phase1/scripts/sg-deploy.sh next-admin'` reaches Bash with `-c` and its command attached; the scanner treats `-c/root...` as an unknown option, reaches the end without a script verdict, and allows the deploy.
  why missed  -> Existing tests cover whitespace-separated `bash -lc`, but not compact single-letter option arguments such as `-cCOMMAND`.

Final line: TOTAL: 1 finding
