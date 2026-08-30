Manage Cloudflare origin lockdown on SG VPS — restricts port 80/443 to CF IP ranges only.

> **🚨 2026-08-30 已失效**：本指令針對的機器（SG `5.223.93.113`）已整併入 ks-aw-01（`149.202.64.114`）並於 Hetzner console 刪除退租——下方 SSH 指令會直接連線失敗。ks-aw-01 改用 **OVH Edge Network Firewall** 達成同一目的（已啟用，見 `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` 或 `TASKS.md` P2.5c），非本指令的 iptables/ipset script。
> 單機拓樸下的 reboot = 全站停機窗口，一律 High-risk 手動 + 明示 go-ahead；auto-reboot 決策見 TASKS.md。


## Subcommands

### `/origin-lockdown status`
Check if origin lockdown is active on SG:
```bash
ssh -i ~/.ssh/hetzner_trigger -o StrictHostKeyChecking=no root@5.223.93.113 \
  "ipset list cf-ipv4 2>/dev/null | head -3; iptables -C INPUT -p tcp --dport 443 -m set --match-set cf-ipv4 src -j ACCEPT 2>&1 && echo 'LOCKDOWN: ACTIVE' || echo 'LOCKDOWN: INACTIVE'"
```
Also run `check-cloudflare-security.ps1` and show the Origin Lockdown row from `reports/status/cf-security-LATEST.md`.

### `/origin-lockdown preview`
Dry-run — show what `--apply` would change without making any changes:
```bash
ssh -i ~/.ssh/hetzner_trigger -o StrictHostKeyChecking=no root@5.223.93.113 \
  "bash /root/cf-origin-lockdown.sh --preview"
```
Script must be uploaded first (see Apply section).

### `/origin-lockdown refresh`
Re-download CF IPs from cloudflare.com and update live ipsets (safe, no firewall rule changes):
```bash
ssh -i ~/.ssh/hetzner_trigger -o StrictHostKeyChecking=no root@5.223.93.113 \
  "bash /root/cf-origin-lockdown.sh --refresh"
```
Only works if lockdown has already been applied (`--apply` done previously).

---

## ⛔ HIGH RISK — Require explicit go-ahead

### `/origin-lockdown apply`
**STOP. Confirm with user before executing. This is a prod iptables change.**

Risk: wrong rule order → all web traffic dropped on production server.
Rollback: automatic 120s revert timer + manual restore command.

Steps (only after go-ahead):
1. Upload script to SG:
```bash
scp -i ~/.ssh/hetzner_trigger lobster-factory/infra/hetzner-phase1-core/scripts/cf-origin-lockdown.sh root@5.223.93.113:/root/cf-origin-lockdown.sh
```
2. Run preview on SG (read output before applying):
```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --preview"
```
3. Apply (120s auto-revert safety):
```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --apply"
```
4. Verify within 120s:
   - `curl -sI https://aware-wave.com/ | grep -E "HTTP|CF-Ray"` → must show CF-Ray
   - `curl -sk https://5.223.93.113/ --resolve aware-wave.com:443:1.2.3.4` → must timeout/refuse
   - `ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 echo ok` → must succeed (SSH on 22)
5. Confirm (cancel auto-revert + persist):
```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --confirm"
```

### `/origin-lockdown rollback`
**STOP. Confirm with user. Removes the lockdown.**
```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --rollback"
```

---

## Context
- Script: `lobster-factory/infra/hetzner-phase1-core/scripts/cf-origin-lockdown.sh`
- Runbook: `runbooks/CLOUDFLARE-WAF-SETUP.md` §Origin Lockdown SOP
- Incident that prompted this: 2026-06-12 scanner flood (185.177.72.0/24 bypassed CF, hit origin directly)
- After lockdown: direct-origin attacks → iptables DROP before nginx → Netdata never alerts
- Travel note: lockdown is IP-based (CF ranges only), NOT geo-based — safe abroad