# Cloudflare security check

- Generated: 2026-06-24 01:29:36
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: PASS**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | ON |
| WAF firewall rules count | 1 (informational; wp-login is server-side) |
| xmlrpc.php block rule | present |
| Origin lockdown (SG) | active |
| CF ipset cf-ipv4 entries | 15 |
| CF ipset cf-ipv6 entries | 7 |

## wp-login / xmlrpc protection
- Mode: **server-side** (LLAR + nginx rate-limit + fail2ban) -- architecture decision 2026-06-04.
- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock.
- CF WAF scanner/path rules may exist, but wp-login health is judged by the server-side layer.
- This check verifies CF posture plus Origin Lockdown; WordPress plugin protection is verified separately (client-status / WP plugin checks).

## Origin Lockdown (SG 5.223.93.113)
- Status: **active**
- CF IPv4 ranges in ipset: 15
- CF IPv6 ranges in ipset: 7
- Architecture: iptables allows only CF IPs on 80/443 -- direct-origin scanners DROP before nginx
- Maintenance: use /origin-lockdown status or scripts/refresh-cf-origin-ips.ps1; rollback only for emergency recovery.
- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP
