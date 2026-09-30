# codex-oracle review -- 2026-09-23 17:04:26 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. high-risk-bash-warn rule 4. Invariant: a deploy script (sg-deploy/rollback-phase1/auto-deploy-next-admin) executes iff it is in COMMAND POSITION (local: ssh after line start or chain op; remote: first word past keywords/wrappers) or is stdin of a shell (or of ssh with no/shell remote command). Round-2 fixes: PROD_SSH_LINE_RE now accepts ssh after && || ; | ( then do + sudo/nohup/timeout; stdin redirect counts only when the segment command is a shell or absent (cat < script passes). Known accepted over-match: bash -c cat < script blocks (safe direction). Verify round-2 fixes and hunt remaining FALSE NEGATIVES vs the old substring regex. If no real finding, say so; do not invent weak findings.
- exit: 0 | elapsed: 120140ms | answer: 1290B
- files-reviewed: mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Multiline remote shell commands are not inspected after the SSH line

  `mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:100` -> `mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:103`

  confidence  -> CONFIRMED

  scenario    -> `ssh ks-aw-01 'if test -f /root/flag\nthen /root/.../sg-deploy.sh\nfi'` executes the deploy script, but `text.split('\n')` only extracts the first line as the SSH remote command; subsequent lines are ignored, so the hook allows the deployment.

  why missed  -> The tests cover shell keywords on one physical line, but not quoted remote commands containing embedded newlines.

FINDING 2: A deploy script piped into a shell is missed

  `mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:29` -> `mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:56`

  confidence  -> CONFIRMED

  scenario    -> `ssh ks-aw-01 'cat < /root/.../sg-deploy.sh | bash'` executes the script through `bash`, but the redirect is associated with the `cat` segment. The `bash` segment has no `stdinIsScript`, so `executesDeployScript()` returns false and the hook allows it.

  why missed  -> Redirect handling is evaluated independently per pipeline segment, while the shell consuming the pipeline output is evaluated separately.

TOTAL: 2 findings
