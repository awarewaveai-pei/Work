# Origin lockdown (retired command)

The old SG iptables/ipset procedure is retired and must not be run. Its target
host no longer exists. Current production is ks-aw-01 (`145.239.195.47`) and
uses OVH Edge Network Firewall.

For an origin-bypass incident, use `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`
and validate the OVH firewall plus Cloudflare proxy state. Any firewall change
is High risk and requires explicit operator approval.
