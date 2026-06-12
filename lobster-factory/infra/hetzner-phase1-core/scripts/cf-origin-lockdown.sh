#!/usr/bin/env bash
# =============================================================================
# cf-origin-lockdown.sh -- Cloudflare Origin Lockdown for SG VPS (5.223.93.113)
#
# Purpose:
#   Restrict iptables port 80/443 to Cloudflare IP ranges only, blocking
#   scanner bots that bypass Cloudflare and hit the origin directly.
#   Uses ipset for efficient IP-set matching.
#
# Usage:
#   ./cf-origin-lockdown.sh --preview   # Dry-run: print what would change
#   ./cf-origin-lockdown.sh --apply     # Apply rules (120s auto-revert safety)
#   ./cf-origin-lockdown.sh --confirm   # Cancel auto-revert, persist rules
#   ./cf-origin-lockdown.sh --rollback  # Restore from last backup
#   ./cf-origin-lockdown.sh --refresh   # Re-download CF IPs and update ipsets
#
# Rollback (emergency, run as root):
#   iptables-restore  < /root/cf-lockdown-backup-YYYYMMDD-HHMMSS/rules.v4.bak
#   ip6tables-restore < /root/cf-lockdown-backup-YYYYMMDD-HHMMSS/rules.v6.bak
#   netfilter-persistent save
#
# IPv6/ufw caveat:
#   IPv6 80/443 managed via ip6tables directly using ipset.
#   Blanket ufw allow-all for 80/443 removed; ufw stays active for SSH.
#
# Rule insertion order:
#   Blanket ACCEPT for 0.0.0.0/0 on 80/443 is REMOVED and replaced with
#   CF-only ACCEPT. Implicit DROP from INPUT policy DROP handles non-CF
#   traffic. CF-allow rules appended AFTER existing f2b-* jump, loopback,
#   RELATED/ESTABLISHED, and SSH rules already in place.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
IPSET_V4="cf-ipv4"
IPSET_V6="cf-ipv6"
CF_IPS_URL_V4="https://www.cloudflare.com/ips-v4"
CF_IPS_URL_V6="https://www.cloudflare.com/ips-v6"
BACKUP_DIR="/root/cf-lockdown-backup-$(date +%Y%m%d-%H%M%S)"
REVERT_PID_FILE="/tmp/cf-lockdown-revert.pid"

# Hardcoded CF IPv4 ranges (fallback if download fails)
CF_IPV4_RANGES=(
  "173.245.48.0/20"
  "103.21.244.0/22"
  "103.22.200.0/22"
  "103.31.4.0/22"
  "141.101.64.0/18"
  "108.162.192.0/18"
  "190.93.240.0/20"
  "188.114.96.0/20"
  "197.234.240.0/22"
  "198.41.128.0/17"
  "162.158.0.0/15"
  "104.16.0.0/13"
  "104.24.0.0/14"
  "172.64.0.0/13"
  "131.0.72.0/22"
)

# Hardcoded CF IPv6 ranges (fallback if download fails)
CF_IPV6_RANGES=(
  "2400:cb00::/32"
  "2606:4700::/32"
  "2803:f800::/32"
  "2405:b500::/32"
  "2405:8100::/32"
  "2a06:98c0::/29"
  "2c0f:f248::/32"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[cf-lockdown] $*"; }
warn() { echo "[cf-lockdown] WARN: $*" >&2; }
die()  { echo "[cf-lockdown] ERROR: $*" >&2; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || die "Must be run as root."; }

ensure_ipset() {
  if ! command -v ipset &>/dev/null; then
    log "ipset not found -- installing..."
    apt-get install -y ipset
  fi
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
take_backup() {
  mkdir -p "$BACKUP_DIR"
  log "Backup -> $BACKUP_DIR"
  iptables-save  > "$BACKUP_DIR/rules.v4.bak"
  ip6tables-save > "$BACKUP_DIR/rules.v6.bak"
  iptables -S    > "$BACKUP_DIR/rules-current.txt"
  ufw status verbose > "$BACKUP_DIR/ufw-status.txt" 2>/dev/null || true
  ipset list > "$BACKUP_DIR/ipset-list.txt" 2>/dev/null || true
  log "Backup complete."
  log "  Emergency rollback:"
  log "    iptables-restore  < $BACKUP_DIR/rules.v4.bak"
  log "    ip6tables-restore < $BACKUP_DIR/rules.v6.bak"
  log "    netfilter-persistent save"
}

# ---------------------------------------------------------------------------
# Download CF IPs (with fallback to hardcoded list)
# ---------------------------------------------------------------------------
fetch_cf_ips_v4() {
  local downloaded
  if downloaded=$(curl -sf --max-time 10 "$CF_IPS_URL_V4"); then
    echo "$downloaded"
  else
    warn "Could not download CF IPv4 list -- using hardcoded fallback."
    printf "%s\n" "${CF_IPV4_RANGES[@]}"
  fi
}

fetch_cf_ips_v6() {
  local downloaded
  if downloaded=$(curl -sf --max-time 10 "$CF_IPS_URL_V6"); then
    echo "$downloaded"
  else
    warn "Could not download CF IPv6 list -- using hardcoded fallback."
    printf "%s\n" "${CF_IPV6_RANGES[@]}"
  fi
}

# ---------------------------------------------------------------------------
# ipset management
# ---------------------------------------------------------------------------
create_or_flush_ipset() {
  local name="$1" family="$2"
  if ipset list "$name" &>/dev/null; then
    ipset flush "$name"
    log "ipset $name flushed."
  else
    ipset create "$name" hash:net family "$family" maxelem 65536
    log "ipset $name created (family $family)."
  fi
}

populate_ipset_v4() {
  local ranges
  mapfile -t ranges < <(fetch_cf_ips_v4)
  create_or_flush_ipset "$IPSET_V4" "inet"
  for r in "${ranges[@]}"; do
    [[ -z "$r" ]] && continue
    ipset add "$IPSET_V4" "$r"
  done
  log "ipset $IPSET_V4 populated with ${#ranges[@]} ranges."
}

populate_ipset_v6() {
  local ranges
  mapfile -t ranges < <(fetch_cf_ips_v6)
  create_or_flush_ipset "$IPSET_V6" "inet6"
  for r in "${ranges[@]}"; do
    [[ -z "$r" ]] && continue
    ipset add "$IPSET_V6" "$r"
  done
  log "ipset $IPSET_V6 populated with ${#ranges[@]} ranges."
}

# ---------------------------------------------------------------------------
# iptables rule helpers
# ---------------------------------------------------------------------------
ipv4_rule_exists() { iptables  -C "$@" 2>/dev/null; }
ipv6_rule_exists() { ip6tables -C "$@" 2>/dev/null; }

# ---------------------------------------------------------------------------
# Core: apply CF lockdown rules to iptables (IPv4)
# Rule logic:
#   - Remove blanket ACCEPT tcp dport 80/443 from 0.0.0.0/0
#   - Append CF ipset ACCEPT rules (idempotent via -C check)
#   - INPUT policy DROP provides implicit deny for all non-CF traffic
# ---------------------------------------------------------------------------
apply_ipv4_rules() {
  local preview="${1:-0}"

  # Step 1: Remove blanket ACCEPT for tcp dport 80/443 (any source)
  for port in 80 443; do
    while iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; do
      if [[ "$preview" == "1" ]]; then
        log "[PREVIEW] Would DELETE: iptables -D INPUT -p tcp --dport $port -j ACCEPT"
        break
      else
        iptables -D INPUT -p tcp --dport "$port" -j ACCEPT
        log "Removed blanket ACCEPT for tcp dport $port."
      fi
    done
  done

  # Step 2: Add CF ipset ACCEPT rules (idempotent via -C check)
  for port in 80 443; do
    if ipv4_rule_exists INPUT -p tcp --dport "$port" -m set --match-set "$IPSET_V4" src -j ACCEPT; then
      log "CF ipset rule for port $port already present -- skipping."
    else
      if [[ "$preview" == "1" ]]; then
        log "[PREVIEW] Would ADD: iptables -A INPUT -p tcp --dport $port -m set --match-set $IPSET_V4 src -j ACCEPT"
      else
        iptables -A INPUT -p tcp --dport "$port" -m set --match-set "$IPSET_V4" src -j ACCEPT
        log "Added CF ipset ACCEPT for tcp dport $port (IPv4)."
      fi
    fi
  done
}

# ---------------------------------------------------------------------------
# Core: apply CF lockdown rules to ip6tables (IPv6) + ufw cleanup
# ---------------------------------------------------------------------------
apply_ipv6_rules() {
  local preview="${1:-0}"

  # Step 1: Remove ufw blanket allow for 80/443 if present
  for port in 80 443; do
    if ufw status 2>/dev/null | grep -qE "^${port}[[:space:]]"; then
      if [[ "$preview" == "1" ]]; then
        log "[PREVIEW] Would run: ufw delete allow ${port}/tcp"
      else
        ufw delete allow "${port}/tcp" 2>/dev/null || true
        ufw delete allow "${port}"     2>/dev/null || true
        log "Removed ufw blanket allow for port $port."
      fi
    fi
  done

  # Step 2: Remove blanket ip6tables ACCEPT for 80/443 from any source
  for port in 80 443; do
    while ip6tables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; do
      if [[ "$preview" == "1" ]]; then
        log "[PREVIEW] Would DELETE: ip6tables -D INPUT -p tcp --dport $port -j ACCEPT"
        break
      else
        ip6tables -D INPUT -p tcp --dport "$port" -j ACCEPT
        log "Removed blanket ip6tables ACCEPT for tcp dport $port."
      fi
    done
  done

  # Step 3: Add CF IPv6 ipset ACCEPT rules
  for port in 80 443; do
    if ipv6_rule_exists INPUT -p tcp --dport "$port" -m set --match-set "$IPSET_V6" src -j ACCEPT; then
      log "CF ipv6 ipset rule for port $port already present -- skipping."
    else
      if [[ "$preview" == "1" ]]; then
        log "[PREVIEW] Would ADD: ip6tables -A INPUT -p tcp --dport $port -m set --match-set $IPSET_V6 src -j ACCEPT"
      else
        ip6tables -A INPUT -p tcp --dport "$port" -m set --match-set "$IPSET_V6" src -j ACCEPT
        log "Added CF ipset ACCEPT for tcp dport $port (IPv6)."
      fi
    fi
  done
}

# ---------------------------------------------------------------------------
# Auto-revert safety (background timer)
# ---------------------------------------------------------------------------
schedule_auto_revert() {
  local backup_v4="$1" backup_v6="$2"
  log ""
  log "==================================================================="
  log "  AUTO-REVERT IN 120 SECONDS"
  log "  Verify connectivity, then confirm within 120s:"
  log "    $0 --confirm"
  log "==================================================================="
  log ""

  # Kill any stale revert timer
  if [[ -f "$REVERT_PID_FILE" ]]; then
    old_pid=$(cat "$REVERT_PID_FILE")
    kill "$old_pid" 2>/dev/null || true
    rm -f "$REVERT_PID_FILE"
  fi

  # Launch background revert process
  (
    sleep 120
    echo "[cf-lockdown] AUTO-REVERT triggered -- restoring backup..."
    iptables-restore  < "$backup_v4"
    ip6tables-restore < "$backup_v6"
    netfilter-persistent save 2>/dev/null || true
    echo "[cf-lockdown] AUTO-REVERT complete."
  ) &
  echo $! > "$REVERT_PID_FILE"
  log "Auto-revert PID: $(cat "$REVERT_PID_FILE")"
}

cancel_auto_revert() {
  if [[ -f "$REVERT_PID_FILE" ]]; then
    pid=$(cat "$REVERT_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      rm -f "$REVERT_PID_FILE"
      log "Auto-revert cancelled (PID $pid killed)."
    else
      log "Auto-revert already completed or not running."
      rm -f "$REVERT_PID_FILE"
    fi
  else
    log "No pending auto-revert found."
  fi
}

persist_rules() {
  log "Persisting rules via netfilter-persistent..."
  netfilter-persistent save
  log "Rules saved to /etc/iptables/rules.v4 and /etc/iptables/rules.v6"
}

# ---------------------------------------------------------------------------
# --preview
# ---------------------------------------------------------------------------
cmd_preview() {
  require_root; ensure_ipset
  log "=== PREVIEW MODE -- no changes will be made ==="
  log ""
  log "Current INPUT chain (IPv4):"
  iptables -L INPUT --line-numbers -n
  log ""
  log "Current INPUT chain (IPv6):"
  ip6tables -L INPUT --line-numbers -n 2>/dev/null || log "(ip6tables not available)"
  log ""
  log "Current ufw status:"
  ufw status verbose 2>/dev/null || log "(ufw not available)"
  log ""
  log "--- IPv4 changes that would be applied ---"
  apply_ipv4_rules "1"
  log ""
  log "--- IPv6 changes that would be applied ---"
  apply_ipv6_rules "1"
  log ""
  log "[PREVIEW] Would populate ipset cf-ipv4 with ${#CF_IPV4_RANGES[@]} CF ranges"
  log "[PREVIEW] Would populate ipset cf-ipv6 with ${#CF_IPV6_RANGES[@]} CF ranges"
  log "=== End preview ==="
}

# ---------------------------------------------------------------------------
# --apply
# ---------------------------------------------------------------------------
cmd_apply() {
  require_root; ensure_ipset
  log "=== APPLY MODE ==="
  take_backup
  populate_ipset_v4
  populate_ipset_v6
  apply_ipv4_rules "0"
  apply_ipv6_rules "0"
  schedule_auto_revert "$BACKUP_DIR/rules.v4.bak" "$BACKUP_DIR/rules.v6.bak"
  log ""
  log "Done. Test connectivity NOW, then run within 120s:"
  log "  $0 --confirm"
  log ""
  log "Manual revert:"
  log "  iptables-restore  < $BACKUP_DIR/rules.v4.bak"
  log "  ip6tables-restore < $BACKUP_DIR/rules.v6.bak"
}

# ---------------------------------------------------------------------------
# --confirm  (cancel auto-revert + persist to disk)
# ---------------------------------------------------------------------------
cmd_confirm() {
  require_root
  cancel_auto_revert
  persist_rules
  log ""
  log "CF origin lockdown ACTIVE and persisted."
  log "Verify:"
  log "  iptables -L INPUT --line-numbers -n"
  log "  ipset list cf-ipv4 | head -20"
  log "  curl -I https://aware-wave.com"
}

# ---------------------------------------------------------------------------
# --rollback
# ---------------------------------------------------------------------------
cmd_rollback() {
  require_root
  local latest_backup
  latest_backup=$(ls -dt /root/cf-lockdown-backup-* 2>/dev/null | head -1)
  [[ -z "$latest_backup" ]] && die "No backup found at /root/cf-lockdown-backup-*"
  log "Rolling back from: $latest_backup"
  iptables-restore  < "$latest_backup/rules.v4.bak"
  ip6tables-restore < "$latest_backup/rules.v6.bak"
  netfilter-persistent save
  log "Rollback complete."
}

# ---------------------------------------------------------------------------
# --refresh  (re-download CF IPs, update live ipsets in place)
# ---------------------------------------------------------------------------
cmd_refresh() {
  require_root; ensure_ipset
  ipset list "$IPSET_V4" &>/dev/null || die "ipsets not found. Run --apply first."
  ipset list "$IPSET_V6" &>/dev/null || die "ipsets not found. Run --apply first."
  log "=== REFRESH -- downloading latest CF IP ranges ==="
  populate_ipset_v4
  populate_ipset_v6
  ipset save > /etc/iptables/ipsets.conf 2>/dev/null || true
  log "ipsets refreshed. No iptables rule changes needed."
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
case "${1:-}" in
  --preview)  cmd_preview  ;;
  --apply)    cmd_apply    ;;
  --confirm)  cmd_confirm  ;;
  --rollback) cmd_rollback ;;
  --refresh)  cmd_refresh  ;;
  *)
    echo "Usage: $0 --preview | --apply | --confirm | --rollback | --refresh"
    echo "  --preview   Dry-run, no changes"
    echo "  --apply     Apply CF origin lockdown (120s auto-revert safety)"
    echo "  --confirm   Confirm and persist after --apply"
    echo "  --rollback  Restore from most recent backup"
    echo "  --refresh   Re-download CF IPs and update ipsets (live)"
    exit 1
    ;;
esac
