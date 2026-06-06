# AwareWave Hetzner static infrastructure (OpenTofu).
#
# Scope (Decision 2 — Hybrid IaC): this manages the STATIC, rarely-changing,
# review-before-apply shared infra — Cloud Firewalls + Private Network. Per-tenant
# dynamic server creation lives in the imperative HetznerHostingAdapter (Trigger by CLI),
# NOT here. Keep this declarative + drift-detectable; keep tenant churn out of state.
#
# Apply requires a real Hetzner project token + the hcloud provider (cannot be validated
# offline). The firewall ids produced here are fed to the adapter via
# buildServerAdapterFromEnv({ firewallIds }).

terraform {
  required_version = ">= 1.6.0" # OpenTofu / Terraform

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.64"
    }
  }

  # Encrypted remote state on Hetzner Object Storage (S3-compatible / Ceph).
  # Credentials via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env. The skip_* flags are
  # required because Ceph RGW is not full AWS S3.
  backend "s3" {
    bucket = "awarewave-tofu-state"
    key    = "hetzner/static/terraform.tfstate"
    region = "main" # ignored by Hetzner, required by the backend

    endpoints = {
      s3 = "https://fsn1.your-objectstorage.com"
    }

    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "hcloud" {
  token = var.hcloud_token
}
