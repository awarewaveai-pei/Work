# codex-oracle review -- 2026-09-23 16:55:59 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: high-risk-bash-warn rule 4: deploy-script names (sg-deploy/rollback-phase1/auto-deploy-next-admin) now match only in COMMAND POSITION of the remote ssh command (executesDeployScript) instead of as bare substrings, which blocked read-only tail/grep/cmp/stat. Verbs (systemctl restart/stop, docker compose down/stop/restart, reboot, shutdown) unchanged. Hunt FALSE NEGATIVES: realistic ways to EXECUTE one of these scripts over ssh to 145.239.195.47/ks-aw-01 that now pass but the old regex blocked. Also: does it depend on something not in the diff (runner.js expandCommand / ctx.commandExpanded)? If no real finding, say so; do not invent weak findings.
- exit: 0 | elapsed: 162801ms | answer: 763B
- files-reviewed: mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Shell control-flow commands can execute a deploy script without being recognized as command position.
  mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:35   -> mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:56
  confidence  -> CONFIRMED
  scenario    -> `ssh ks-aw-01 'if test -f /root/flag; then /root/lobster-phase1/scripts/sg-deploy.sh next-admin; fi'` with `/root/flag` present -> the remote script executes, but segments beginning with `then` are not treated as wrappers/command-position prefixes, so the gate passes.
  why missed  -> The parser splits only on shell separators and assumes the first token of each segment is the executable; it does not model `then`, `do`, or similar shell grammar tokens.

Final: TOTAL: 1 finding
