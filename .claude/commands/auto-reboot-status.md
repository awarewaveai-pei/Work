Check VPS auto-reboot system health (B-Minimal, deployed 2026-05-23). Read-only diagnostic — no changes to any VPS or repo.

Use when:
- Verifying SSOT files still present on SG + EU (paranoid check / monthly governance review)
- AGENTS.md 16h escalation rule fires (diagnose before deciding manual `/sg-reboot` or `/eu-reboot`)
- Operator wants to know "when is the next auto-reboot window" or "did Tuesday's CVE batch fire correctly"
- Right after onboarding a new VPS to confirm config deployed correctly

Owner runbook: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`
Risk tier: **Low** (read-only SSH probes; same credentials as `/sg-reboot` and `/eu-reboot`).

## SSH connections (via `hetzner-ssh` MCP)

- **SG**: host=`5.223.93.113`, user=`root`, privateKeyPath=`$env:USERPROFILE\.ssh\hetzner_trigger`
- **EU**: host=`204.168.175.41`, user=`root`, privateKeyPath=`$env:USERPROFILE\.ssh\hetzner_trigger`

## Steps

Connect to both VPSes in parallel, then run this combined probe on EACH:

```bash
echo "=== HOST ===" && hostname
echo "=== TZ ===" && date -u +"%Y-%m-%dT%H:%M:%SZ"
echo "=== KERNEL + UPTIME ===" && uname -r && uptime
echo "=== APT-CONFIG (ground truth) ===" && apt-config dump | grep -i "Automatic-Reboot"
echo "=== SSOT FILES + SHA256 ===" && ls -la /etc/apt/apt.conf.d/52awarewave-auto-reboot* /etc/apt/apt.conf.d/53awarewave* 2>&1 | grep -v "No such file" ; sha256sum /etc/apt/apt.conf.d/52awarewave-auto-reboot 2>&1 ; sha256sum /etc/apt/apt.conf.d/53awarewave-stagger-eu.conf 2>&1
echo "=== UNATTENDED-UPGRADES DAEMON ===" && systemctl is-active unattended-upgrades && systemctl is-enabled unattended-upgrades
echo "=== PENDING REBOOT MARKER ===" && cat /var/run/reboot-required.pkgs 2>/dev/null && echo "↑ packages needing reboot" || echo "no reboot pending"
echo "=== LAST 3 REBOOTS ===" && last reboot | head -4
```

## Expected (clean state)

Compare SG and EU outputs against this expected baseline (2026-05-23):

| Check | SG expected | EU expected |
|-------|------------|------------|
| `Automatic-Reboot` | `"true"` | `"true"` |
| `Automatic-Reboot-Time` | `"20:00"` (= 04:00 TPE) | **`"20:30"`** (53 stagger override) |
| `Automatic-Reboot-WithUsers` | `"true"` | `"true"` |
| `52awarewave-auto-reboot` SHA256 | `0529840831f670311723ef0608552ccdfe5723811219bd1e8848b35facf2053d` | same (byte-identical) |
| `53awarewave-stagger-eu.conf` | **absent** (SG should NOT have this file) | present, SHA256 `c07273c3d7aa009ab56fe2ca97c0f8ffd1baa019c2ea1347571beb6aa5cf438d` |
| `unattended-upgrades` daemon | `active` + `enabled` | `active` + `enabled` |
| `/var/run/reboot-required` | usually absent; if present, will auto-fire @ 20:00 UTC | usually absent; if present, will auto-fire @ 20:30 UTC |

## Cross-check against repo SSOT

After collecting the SHA256 from both VPSes, compare to repo SSOT files:

```bash
# On dev machine (PowerShell):
Get-FileHash -Algorithm SHA256 lobster-factory\infra\hetzner-phase1-core\auto-reboot\52awarewave-auto-reboot.conf
Get-FileHash -Algorithm SHA256 lobster-factory\infra\hetzner-phase1-core\auto-reboot\53awarewave-stagger-eu.conf
```

Repo SSOT hashes (2026-05-23 baseline):
- `52awarewave-auto-reboot.conf` → `0529840831f670311723ef0608552ccdfe5723811219bd1e8848b35facf2053d`
- `53awarewave-stagger-eu.conf` → `c07273c3d7aa009ab56fe2ca97c0f8ffd1baa019c2ea1347571beb6aa5cf438d`

Any mismatch → **drift**; either repo or VPS edited out-of-band. Investigate before remediating.

## Report format

Output a single table summarising both VPSes:

```
| VPS | apt-config Automatic-Reboot | Time | SSOT match | unattended daemon | reboot pending | last reboot | uptime |
|-----|----------------------------|------|------------|-------------------|----------------|-------------|--------|
| SG  | true                       | 20:00 | ✓         | active+enabled    | no             | <date>      | <d>    |
| EU  | true                       | 20:30 | ✓         | active+enabled    | no             | <date>      | <d>    |
```

Then a one-line verdict:
- **🟢 Healthy** — all expected; no drift; auto-reboot will run at 20:00 / 20:30 UTC daily as needed
- **🟡 Drift** — apt-config or SSOT SHA256 mismatch; recommend re-deploy from SSOT
- **🔴 Broken** — daemon stopped, conf missing, or pending reboot > 16h (escalate to manual `/sg-reboot` or `/eu-reboot`)

If reboot is pending on either VPS, note the time-to-next-window:
- SG: next 20:00 UTC
- EU: next 20:30 UTC

## Related

- Owner runbook: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`
- SSOT files: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/{52awarewave-auto-reboot.conf,53awarewave-stagger-eu.conf}`
- AGENTS.md trigger rule (auto-escalation @ 16h): `agency-os/AGENTS.md` §代理自動工具使用規則 reboot 訊號段
- Manual override (emergency reboot): `/sg-reboot` / `/eu-reboot`
- Health endpoint with `auto_reboot` field: `https://app.aware-wave.com/api/ops/repairs/health` (requires nginx Basic Auth)
- Memory entry: `~/.claude/projects/d--Work/memory/project_vps_auto_reboot.md`
