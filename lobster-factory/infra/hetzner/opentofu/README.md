# Hetzner static infra (OpenTofu)

Decision 2 (Hybrid IaC): this manages the **static, shared, review-before-apply** infra —
Cloud Firewalls + Private Network. Per-tenant dynamic server creation is **NOT** here; it
lives in the imperative `HetznerHostingAdapter` (triggered by `/provision-client`).

## Files
- `main.tf` — provider (`hetznercloud/hcloud ~> 1.64`) + encrypted S3 remote state on Hetzner Object Storage
- `firewall.tf` — Cloud Firewall (v4+v6 allowlist: 80/443 public, 22 operator-only, icmp/icmpv6)
- `network.tf` — Private Network for DB/Redis (NOT encryption — still needs TLS on top)
- `variables.tf` — `hcloud_token` (per-environment project), `ssh_allowlist_v4/v6`, `network_zone`

## Apply (needs a real Hetzner project token — cannot be validated offline)
```bash
export HCLOUD_TOKEN=<staging-or-prod-project-token>      # provider token
export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...   # Object Storage state creds
export TF_VAR_hcloud_token=$HCLOUD_TOKEN
export TF_VAR_ssh_allowlist_v4='["<operator-ip>/32"]'

tofu init
tofu fmt -check
tofu validate
tofu plan        # review-before-apply (destructive plans need go-ahead)
tofu apply
```

## Wiring
`tofu output web_firewall_id` → feed to the adapter:
`buildServerAdapterFromEnv({ region, firewallIds: [<web_firewall_id>] })` so every
provisioned server gets the provider-level firewall (second layer) on top of the in-guest
cloud-init iptables (first layer).

## Token model (official-source audited)
Hetzner API tokens have NO per-action scopes — only project-level Read / Read+Write, bound
to one project. Isolation is by **separate projects**: a `staging` project token and a
`production` project token, each Read+Write. This OpenTofu state is per-project.
