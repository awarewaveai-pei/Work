# codex-oracle review -- 2026-09-24 15:06:25 +08:00

- mode: `review`
- scope: -Path scripts/lib/prod-host.ps1, scripts/sync-endpoint-alert-heartbeat.ps1, scripts/sync-slack-alert-webhooks.ps1, scripts/sync-pagerduty-endpoint-alert.ps1, scripts/sync-observability-grafana-content.ps1, scripts/sync-grafana-alerting-slack.ps1, scripts/open-grafana-ssh-tunnel.ps1, scripts/diff-env-vs-vault.ps1, scripts/verify-no-released-addresses.mjs, tests/scripts/verify-no-released-addresses.test.mjs, scripts/system-health-check.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator scripts defaulted to machine-local ssh aliases that resolve to released addresses (5.223.93.113 / 204.168.175.41). Change: (1) scripts/lib/prod-host.ps1 = single source of production host facts (145.239.195.47:58122, ubuntu, id_ed25519; root ops under sudo); Get-ProdSshArgs/Get-ProdScpArgs/Get-ProdLabel with an explicit -SshTarget override still honoured; (2) 7 scripts retargeted, 5 renamed sync-hetzner-* -> sync-* (git mv); diff-env-vs-vault target alias prod = production host; (3) verify-no-released-addresses.mjs --ssh-config: enumerates concrete Host aliases (incl. Include files), checks BOTH ssh -G hostname and the static HostName, resolves DNS names, unresolvable = fail closed; wired warn-only into system-health-check.ps1 like its sibling check. Verified: parse ok, real ssh/scp through the lib, diff-env-vs-vault real read 7/7 MATCH, heartbeat -DryRun, Grafana tunnel health 200, tests 40/40, mutation (drop static HostName) -> 2 red, the old ssh config flagged 3 NEW, health 328/328. Check especially: PowerShell native-arg splatting of arrays to ssh/scp, the scp option/dest composition, override semantics, anything that could now target the wrong host. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 63090ms | answer: 11B
- files-reviewed: scripts/sync-endpoint-alert-heartbeat.ps1, scripts/sync-grafana-alerting-slack.ps1, scripts/sync-observability-grafana-content.ps1, scripts/sync-pagerduty-endpoint-alert.ps1, scripts/sync-slack-alert-webhooks.ps1, scripts/diff-env-vs-vault.ps1, scripts/open-grafana-ssh-tunnel.ps1, scripts/system-health-check.ps1, scripts/verify-no-released-addresses.mjs, tests/scripts/verify-no-released-addresses.test.mjs, scripts/lib/prod-host.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
