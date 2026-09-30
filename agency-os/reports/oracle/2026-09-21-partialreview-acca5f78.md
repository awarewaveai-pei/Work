# codex-oracle review -- 2026-09-21 12:09:43 +08:00

- mode: `review`
- scope: -Path Projects/internal/hci30/infra/local, Projects/internal/hci30/tests/architecture, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0029-isolated-fetch-worker-not-trigger-dev.md, scripts/oracle-capture-policy.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: HCI-30 fetch-runner: move iptables egress policy from one-shot hci-network-guard sidecar into the runner own entrypoint (applied every start), then setpriv drop to uid node with empty cap bounding set + no_new_privs; add restart unless-stopped; delete network-guard; tests assert policy survives restart + /proc/1/status caps empty. Plus scripts/oracle-capture-policy.ps1 AllowEmptyCollection fix. Also verify: does this depend on something NOT visible in this diff (config value, default, upstream behavior)? If no real finding, say so; do not invent weak findings.
- exit: 0 | elapsed: 82464ms | answer: 11B
- files-reviewed: Projects/internal/hci30/infra/local/compose.fetch-runner.yml, Projects/internal/hci30/infra/local/fetch-runner/Dockerfile, Projects/internal/hci30/infra/local/fetch-runner/entrypoint.sh, Projects/internal/hci30/infra/local/fetch-runner/server.mjs, Projects/internal/hci30/infra/local/network-guard/Dockerfile, Projects/internal/hci30/infra/local/network-guard/entrypoint.sh, Projects/internal/hci30/tests/architecture/fetch-runner-content-isolation.test.ps1, Projects/internal/hci30/tests/architecture/fetch-runner-network-isolation.test.ps1, Projects/internal/hci30/tests/architecture/fetch-runner-object-storage-write-path.test.ps1, agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0029-isolated-fetch-worker-not-trigger-dev.md, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, scripts/oracle-capture-policy.ps1
- deletions-reviewed: Projects/internal/hci30/infra/local/network-guard/Dockerfile@78e3453b3, Projects/internal/hci30/infra/local/network-guard/entrypoint.sh@777558fba

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
