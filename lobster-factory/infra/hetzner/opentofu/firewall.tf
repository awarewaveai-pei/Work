# Cloud Firewall — the PROVIDER-level allowlist (second layer; the in-guest iptables from
# cloud-init is the first). Hetzner firewalls allow listed traffic and DROP everything else.
# Inbound only — outbound is left default-allow (do NOT add an outbound rule here unless you
# list EVERY needed destination, or the firewall flips to deny-all outbound).
#
# Covers BOTH IPv4 and IPv6 source ranges (Hetzner assigns a public /64; an IPv4-only
# allowlist would leave v6 reachable — the same gap the cloud-init firewall closes in-guest).

resource "hcloud_firewall" "web" {
  name = "lf-web-firewall"

  # HTTP — public (Cloudflare proxied; ACME http-01 fallback).
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS — public.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SSH — restricted to the operator allowlist (static IP / VPN). Empty allowlist = no SSH
  # via the cloud firewall (rescue console remains the break-glass path).
  dynamic "rule" {
    for_each = length(concat(var.ssh_allowlist_v4, var.ssh_allowlist_v6)) > 0 ? [1] : []
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = "22"
      source_ips = concat(var.ssh_allowlist_v4, var.ssh_allowlist_v6)
    }
  }

  # ICMP / icmpv6 — ping + IPv6 NDP/PMTUD (v6 needs icmpv6 to function).
  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  labels = {
    managed_by = "lobster_factory"
    layer      = "static"
  }
}

output "web_firewall_id" {
  description = "Feed to the HetznerHostingAdapter via buildServerAdapterFromEnv({ firewallIds: [<this>] })."
  value       = hcloud_firewall.web.id
}
