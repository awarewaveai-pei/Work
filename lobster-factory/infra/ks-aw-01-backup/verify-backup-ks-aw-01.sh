#!/usr/bin/env bash
# Verify today's ks-aw-01 backup integrity. Logs verdict
# "=== verify-backup-ks-aw-01 PASSED/FAILED ===" to /var/log/ks-aw-01-backup.log +
# exits non-zero on failure. Read by scripts/check-backup-health.ps1 at AO-RESUME.
#
# ---------------------------------------------------------------------------
# Expectations come from EXPECT_SERVICES in /etc/default/ks-aw-01-backup — the
# SAME declaration backup-ks-aw-01.sh uses. This script deliberately does NOT
# call `docker ps` / `docker volume inspect`: if the verifier re-derived its
# expectations from the same live state the producer used, then a renamed or
# crashed container would make both of them agree that nothing was expected,
# and an empty backup would verify PASSED. The declaration is the contract;
# live state is what gets checked against it.
# ---------------------------------------------------------------------------
set -euo pipefail

[[ -f /etc/default/ks-aw-01-backup ]] && source /etc/default/ks-aw-01-backup

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
EXPECT_SERVICES="${EXPECT_SERVICES:-}"
DATE="$(date +%Y%m%d)"
ERRORS=0

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }
fail() { log "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
ok() { log "  OK: $1"; }

expects() {
  case " ${EXPECT_SERVICES} " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# require_gzip <file> <label>
require_gzip() {
  local f="${TODAY_DIR}/$1"
  if [[ -f "$f" && -s "$f" ]] && gunzip -t "$f" 2>/dev/null; then
    ok "$1 ($(du -h "$f" | cut -f1), gzip OK)"
  else
    fail "$1 missing/empty/corrupt (${2} declared in EXPECT_SERVICES)"
  fi
}

# require_tgz <file> <label>
require_tgz() {
  local f="${TODAY_DIR}/$1"
  if [[ -f "$f" && -s "$f" ]] && tar tzf "$f" >/dev/null 2>&1; then
    ok "$1 ($(du -h "$f" | cut -f1), tar OK)"
  else
    fail "$1 missing/empty/corrupt (${2} declared in EXPECT_SERVICES)"
  fi
}

log "=== verify-backup-ks-aw-01 START (EXPECT_SERVICES='${EXPECT_SERVICES:-(none)}') ==="

TODAY_DIR=""
if [[ -d "${BACKUP_DIR}" ]]; then
  TODAY_DIR="$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "${DATE}-*" | sort -r | head -1)"
fi

if [[ -z "$TODAY_DIR" || ! -d "$TODAY_DIR" ]]; then
  fail "No backup directory for today (${DATE}) in ${BACKUP_DIR}"
  log "=== verify-backup-ks-aw-01 FAILED ==="
  exit 1
fi

log "Checking: ${TODAY_DIR}"

# manifest.json — always required, proves the pipeline ran at all
if [[ -f "${TODAY_DIR}/manifest.json" && -s "${TODAY_DIR}/manifest.json" ]]; then
  # manifest records the producer's own error count; non-zero means it aborted
  MANIFEST_ERRORS="$(grep -o '"errors":[0-9]*' "${TODAY_DIR}/manifest.json" | cut -d: -f2 || echo "")"
  if [[ -n "$MANIFEST_ERRORS" && "$MANIFEST_ERRORS" != "0" ]]; then
    fail "manifest.json reports ${MANIFEST_ERRORS} error(s) during backup"
  else
    ok "manifest.json present (errors=0)"
  fi
  # Cross-check: the producer's declared scope must match ours, or one of the
  # two read a stale config and we are verifying against the wrong contract.
  MANIFEST_EXPECT="$(grep -o '"expect_services":"[^"]*"' "${TODAY_DIR}/manifest.json" | cut -d'"' -f4 || echo "")"
  if [[ "$MANIFEST_EXPECT" != "$EXPECT_SERVICES" ]]; then
    fail "EXPECT_SERVICES mismatch: backup ran with '${MANIFEST_EXPECT}', verify sees '${EXPECT_SERVICES}'"
  fi
else
  fail "manifest.json missing or empty"
fi

if expects soulful; then
  require_gzip "soulful-db.sql.gz" "soulful"
  require_tgz  "soulful-wordpress.tgz" "soulful"
fi

if expects chatwoot; then
  require_gzip "chatwoot.sql.gz" "chatwoot"
  require_tgz  "chatwoot-storage.tgz" "chatwoot"
fi

# Encrypted .env bundle — required whenever any target .env exists on the host
if [[ -f /root/soulful/.env || -f /root/chatwoot/.env ]]; then
  F="${TODAY_DIR}/env.tar.gz.enc"
  if [[ -f "$F" && -s "$F" ]]; then
    ok "env.tar.gz.enc ($(du -h "$F" | cut -f1), present)"
  else
    fail "env.tar.gz.enc missing or empty (secrets NOT protected, but .env file(s) exist on host)"
  fi
fi

# R2 offsite marker (.verify written by backup-ks-aw-01.sh only after upload succeeds)
if [[ -f "${TODAY_DIR}/.verify" ]]; then
  ok "R2 offsite: .verify marker present"
else
  fail "R2 offsite: .verify marker missing (upload did not complete)"
fi

if [[ $ERRORS -gt 0 ]]; then
  log "=== verify-backup-ks-aw-01 FAILED: ${ERRORS} error(s) ==="
  exit 1
else
  log "=== verify-backup-ks-aw-01 PASSED ==="
  exit 0
fi
