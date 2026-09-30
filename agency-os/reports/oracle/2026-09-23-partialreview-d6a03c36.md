# codex-oracle review -- 2026-09-23 17:00:03 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2. high-risk-bash-warn rule 4: deploy-script names match only in COMMAND POSITION of the remote ssh command (executesDeployScript). Round-1 finding (if/then/do not treated as command position) fixed: SHELL_KEYWORDS + ) } separators, plus su -c / xargs / eval / setsid wrappers; tests P4-1d cover them. Hunt remaining FALSE NEGATIVES the old substring regex blocked, and confirm the round-1 fix. If no real finding, say so; do not invent weak findings.
- exit: 0 | elapsed: 139715ms | answer: 1203B
- files-reviewed: mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Production SSH commands wrapped or chained in a local shell are silently missed.
  mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:7 -> mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:80
  confidence  -> CONFIRMED
  scenario    -> `cd /tmp && ssh ks-aw-01 'sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin'` -> the anchored SSH regex does not match, so the deploy proceeds without the warning.
  why missed  -> The parser assumes the SSH command starts the line; the added tests even include a `bash -c` wrapper that this regex cannot match.

FINDING 2: The stdin check falsely blocks read-only remote commands containing `< script`.
  mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:28-31 -> mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:29
  confidence  -> CONFIRMED
  scenario    -> `ssh ks-aw-01 'cat < /root/lobster-phase1/scripts/sg-deploy.sh'` -> quote removal exposes `< ...sg-deploy.sh`, so the hook treats it as feeding the script to `ssh` and blocks a read-only `cat`.
  why missed  -> Quotes are deliberately erased before scanning, so local SSH stdin redirection and remote-shell redirection become indistinguishable.

TOTAL: 2 findings
