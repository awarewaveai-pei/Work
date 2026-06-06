variable "hcloud_token" {
  description = "Hetzner Cloud project API token (Read+Write). Per-environment project (Decision: token isolation is by PROJECT — Hetzner has no per-action scopes)."
  type        = string
  sensitive   = true
}

variable "ssh_allowlist_v4" {
  description = "IPv4 CIDRs permitted to reach SSH (22). Operator static IP / VPN only — never 0.0.0.0/0."
  type        = list(string)
  default     = []
}

variable "ssh_allowlist_v6" {
  description = "IPv6 CIDRs permitted to reach SSH (22)."
  type        = list(string)
  default     = []
}

variable "network_zone" {
  description = "Private network zone. ap-southeast for Singapore delivery; eu-central for Helsinki control plane."
  type        = string
  default     = "ap-southeast"
}
