# Private Network — DB / Redis / service-to-service traffic stays off the public interface.
# NOTE: a private network is NOT encryption (Hetzner FAQ) — sensitive service traffic still
# needs TLS / mTLS / WireGuard on top. This just keeps internal ports off the public IP.

resource "hcloud_network" "internal" {
  name     = "lf-internal"
  ip_range = "10.10.0.0/16"

  labels = {
    managed_by = "lobster_factory"
    layer      = "static"
  }
}

resource "hcloud_network_subnet" "delivery" {
  network_id   = hcloud_network.internal.id
  type         = "cloud"
  network_zone = var.network_zone
  ip_range     = "10.10.1.0/24"
}

output "network_id" {
  value = hcloud_network.internal.id
}
