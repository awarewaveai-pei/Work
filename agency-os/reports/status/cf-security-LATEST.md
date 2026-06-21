# Cloudflare security check

- Generated: 2026-06-21 22:41:03
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: WARN**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | error |
| WAF firewall rules count | 0 (informational; wp-login is server-side) |
| xmlrpc.php block rule | server-side (nginx/LLAR) |
| Origin lockdown (SG) | unknown |
| CF ipset cf-ipv4 entries | N/A |
| CF ipset cf-ipv6 entries | N/A |

## wp-login / xmlrpc protection
- Mode: **server-side** (LLAR + nginx rate-limit + fail2ban) -- architecture decision 2026-06-04.
- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock.
- CF WAF scanner/path rules may exist, but wp-login health is judged by the server-side layer.
- This check verifies CF posture plus Origin Lockdown; WordPress plugin protection is verified separately (client-status / WP plugin checks).

## Origin Lockdown (SG 5.223.93.113)
- Status: **unknown**
- CF IPv4 ranges in ipset: 0
- CF IPv6 ranges in ipset: 0
- Architecture: iptables allows only CF IPs on 80/443 -- direct-origin scanners DROP before nginx
- To apply: /origin-lockdown apply (HIGH RISK, go-ahead required)
- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP

## Errors
- bot_management API: 無法解析遠端名稱: 'api.cloudflare.com'
