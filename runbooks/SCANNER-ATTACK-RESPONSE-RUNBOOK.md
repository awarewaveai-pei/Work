# Scanner Attack Response Runbook

> **現役主機（2026-08-31）**：只連 **ks-aw-01**：`ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47`。Origin lockdown 改由 OVH Edge Network Firewall；見 `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`。舊 iptables/origin-lockdown 指令不可套用。

**Symptom**: Netdata `infra-alerts` — `bad_request %` spike (> 30%), `successful %` drops, multiple recovery/trigger cycles. Slack #infra-alerts flooding.

**Root cause category**: Automated credential-harvesting scanner hitting server directly (/.env, /.aws, /phpinfo, etc.)

---

## Triage (2 min)

```bash
# 1. Confirm scanner — check top attacking IPs and paths
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47 "sudo sh -lc '
  echo '=== Top bad-request IPs ===' &&
  awk '\$9 ~ /^[45]/ {print \$1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
  echo '=== Top bad-request paths ===' &&
  awk '\$9 ~ /^[45]/ {print \$7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
'"
```

**If paths include `/.env`, `/.aws`, `/phpinfo`, `/wp-config`, `/id_rsa`, `/database` → confirmed scanner.**

---

## Decision Tree

```
Is Origin Lockdown active?
  YES → Scanner should NOT reach nginx. Something is wrong.
        Check: is the scanner using a CF-proxied path? Is CF WAF path-block working?
        Run: /origin-lockdown status
        Run: curl https://aware-wave.com/.env → should be 403 (CF WAF path block)
        If 403 → CF WAF is blocking; alert may be from pre-lockdown traffic. Monitor.
        If 200/404 → CF WAF path rule missing. See §CF WAF Path Block below.

  NO  → Scanner is hitting origin directly. Three options (not mutually exclusive):

        Option A (RECOMMENDED): Apply Origin Lockdown
          → See: runbooks/CLOUDFLARE-WAF-SETUP.md §Origin Lockdown SOP
          → /origin-lockdown apply (HIGH RISK, needs go-ahead)
          → Effect: ALL direct-origin scans → iptables DROP, nginx never sees them,
                    Netdata bad_request % stays clean permanently.

        Option B: Block attacker IP/CIDR in CF WAF
          → Check if CF WAF path block already covers it (curl test below)
          → If scanner is directly hitting origin, CF WAF has no effect — do Option A.
          → If scanner is going through CF, add IP block: see CF WAF API section below.

        Option C: Wait it out (if low severity)
          → Scanners typically run once and move on (4-6h duration)
          → All returning 404/403 → no actual breach
          → Monitor: watch Netdata recovery alerts
```

---

## CF WAF Path Block Verification

```bash
# All should return 403 if CF WAF rule is active
curl -s -o /dev/null -w "/.aws/credentials: %{http_code}\n" https://aware-wave.com/.aws/credentials
curl -s -o /dev/null -w "/.env: %{http_code}\n"             https://aware-wave.com/.env
curl -s -o /dev/null -w "/phpinfo.php: %{http_code}\n"      https://aware-wave.com/phpinfo.php
curl -s -o /dev/null -w "/wp-config.bak: %{http_code}\n"    https://aware-wave.com/wp-config.bak
# Legit path should return 200
curl -s -o /dev/null -w "/: %{http_code}\n"                 https://aware-wave.com/
```

If any sensitive path returns 200/404 → path-block rule missing. See `CLOUDFLARE-WAF-SETUP.md §API 維護` to restore it.

---

## CF WAF: Block Specific Attacker IP/CIDR (if scanner goes through CF)

Only relevant when scanner traffic is proxied through CF (scanner → CF → origin).
Check: if attacker IP appears in nginx logs AND is NOT a CF IP range, they are hitting origin directly → Origin Lockdown is the fix, not CF WAF IP block.

```bash
CF_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" mcp/user-env.ps1 | sed 's/.*= "\(.*\)"/\1/')
ZONE_ID="f21b1919632fee2221647908a94fdcac"
RULESET_ID="f290fd58b69c4cedb7a0688ca959034f"

# Add IP block rule (replace CIDR with actual attacker)
ATTACKER_CIDR="185.177.72.0/24"
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/$RULESET_ID/rules" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"block\",\"expression\":\"(ip.src in {$ATTACKER_CIDR})\",\"description\":\"Block scanner $ATTACKER_CIDR\",\"enabled\":true}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else d.get('errors'))"
```

---

## Key Insight

> **If Origin Lockdown is active, scanner traffic hitting origin directly is impossible.**
> The scanner requests are dropped at the iptables level before reaching nginx.
> Netdata never sees the bad requests. You receive zero notifications.
>
> This is why the 2026-06-12 incident caused notification flooding: Origin Lockdown was not yet active.
> Once applied, this class of attack becomes completely silent.

---

## Damage Assessment Checklist

- [ ] Any scanner path returned 200 (not 404/403)? → Check server files immediately
- [ ] Any auth endpoint (wp-login, xmlrpc) hit successfully? → Check LLAR logs on WP server
- [ ] SSH auth failures in auth.log? → May be follow-up brute force attempt
- [ ] Docker containers still healthy? `docker ps --format 'table {{.Names}}\t{{.Status}}'`
- [ ] No new processes: `ps aux | grep -v '\[' | sort -rk3 | head -20`

---

## WORKLOG template

```
[已修改] Scanner attack response — YYYY-MM-DD HH:MM CST
[根因] Automated scanner from <IP/CIDR> hitting origin directly on port 443
[步驟] Verified via nginx log → paths returning 404 (no data leak) → [action taken]
[驗證結果]
- REALTEST_EVIDENCE: tool=curl | cmd=curl .../.env | exit=0 | ms=N
- REVIEW_DONE: critic=Quick | verdict=pass | findings=0c/0m/0n
- BUGHUNT_DONE: scope=agency-os,scripts | grep=scanner|185.177 | hits=0
[剩餘風險] Origin lockdown not yet applied / CF WAF path rule may drift
[rollback] /origin-lockdown rollback (if lockdown was applied)
```

---

## Related
- `runbooks/CLOUDFLARE-WAF-SETUP.md` — CF WAF API mechanics (SSOT for rule IDs + PATCH commands)
- `lobster-factory/infra/hetzner-phase1-core/scripts/cf-origin-lockdown.sh` — lockdown script
- `/origin-lockdown` was deleted 2026-09-20 (it targeted the retired SG host). Use `runbooks/CLOUDFLARE-WAF-SETUP.md` §Origin Lockdown SOP plus the OVH Edge Firewall alternative.
- `scripts/check-cloudflare-security.ps1` — automated CF posture check
