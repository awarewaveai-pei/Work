# Cloudflare security check

- Generated: 2026-06-12 18:20:51
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: PASS**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | ON |
| WAF firewall rules count | 1 (by design -- empty; server-side defense) |
| xmlrpc.php block rule | present |
| Origin lockdown (SG) | active |
| CF ipset cf-ipv4 entries | 15 |
| CF ipset cf-ipv6 entries | 7 |

## wp-login / xmlrpc protection
- Mode: **server-side** (LLAR + nginx rate-limit + fail2ban) -- architecture decision 2026-06-04.
- CF WAF rules intentionally empty: operator travels globally; CF geo rules would self-lock. CF layer = Bot Fight Mode only.
- This check only verifies the CF layer (Bot Fight Mode). Server-side layer is verified separately (client-status / WP plugin checks).

## Origin Lockdown (SG 5.223.93.113)
- Status: **active**
- CF IPv4 ranges in ipset: 15
- CF IPv6 ranges in ipset: 7
- Architecture: iptables allows only CF IPs on 80/443 -- direct-origin scanners DROP before nginx
- Maintenance: use /origin-lockdown status or scripts/refresh-cf-origin-ips.ps1; rollback only for emergency recovery.
- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP
