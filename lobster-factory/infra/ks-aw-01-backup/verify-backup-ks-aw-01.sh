#!/usr/bin/env bash
# Verify today's ks-aw-01 backup integrity. Logs verdict
# "=== verify-backup-ks-aw-01 PASSED/FAILED ===" to /var/log/ks-aw-01-backup.log +
# exits non-zero on failure. Read by scripts/check-backup-health.ps1 at AO-RESUME.
#
# ---------------------------------------------------------------------------
# Expectations come from EXPECT_SERVICES in /etc/default/ks-aw-01-backup — the
# SAME declaration backup-ks-aw-01.sh uses — plus the client site registry
# CLIENT_WP_REGISTRY_DIR (default /etc/awarewave/sites.d), also read by both. This script deliberately does NOT
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

# "valid archive" is NOT "has content". `: | gzip` produces a 20-byte file that is a
# perfectly valid gzip and passes both -s and `gunzip -t`; `tar czf -T /dev/null`
# produces a valid tarball with zero entries. Both states occurred on this host on
# 2026-08-27: a failed `wp db export` (PHP exec() disabled on the source) wrote a 4 KB
# gzip of an error backtrace, and the first-generation check called it OK. Every
# threshold below therefore asserts CONTENT, not format.

# require_gzip <file> <label> <min-bytes> <min-create-table> [<completion trailer>]
# The trailer is the dumper's own last line: mariadb-dump "Dump completed", pg_dump "PostgreSQL database dump
# complete" (pg_dump 16.10+/17.6+ writes an unrestrict line after it, hence tail -10).
require_gzip() {
  local f="${TODAY_DIR}/$1" label="$2" minb="${3:-1000000}" mintbl="${4:-50}" want="${5:-Dump completed}"
  if [[ ! -f "$f" ]]; then fail "$1 missing (${label} declared in EXPECT_SERVICES)"; return; fi
  if ! gunzip -t "$f" 2>/dev/null; then fail "$1 corrupt gzip (${label})"; return; fi
  local bytes tbl trailer
  bytes=$(stat -c %s "$f")
  if [[ "$bytes" -lt "$minb" ]]; then
    fail "$1 only ${bytes}B, below ${minb}B floor — almost certainly an error message, not a dump (${label})"
    return
  fi
  tbl=$(zcat "$f" | grep -c "^CREATE TABLE" || true)
  if [[ "$tbl" -lt "$mintbl" ]]; then
    fail "$1 has ${tbl} CREATE TABLE, below ${mintbl} (${label})"
    return
  fi
  # absence means the dump was cut off mid-stream
  trailer=$(zcat "$f" | tail -10 | grep -c "$want" || true)
  if [[ "$trailer" -lt 1 ]]; then
    fail "$1 has no '${want}' trailer — truncated (${label})"
    return
  fi
  ok "$1 ($(du -h "$f" | cut -f1), ${tbl} tables, trailer present)"
}

# require_tgz <file> <label> <min-bytes> <min-entries>
require_tgz() {
  local f="${TODAY_DIR}/$1" label="$2" minb="${3:-1000000}" minent="${4:-100}"
  if [[ ! -f "$f" ]]; then fail "$1 missing (${label} declared in EXPECT_SERVICES)"; return; fi
  if ! tar tzf "$f" >/dev/null 2>&1; then fail "$1 corrupt archive (${label})"; return; fi
  local bytes ent
  bytes=$(stat -c %s "$f")
  if [[ "$bytes" -lt "$minb" ]]; then
    fail "$1 only ${bytes}B, below ${minb}B floor (${label})"
    return
  fi
  ent=$(tar tzf "$f" | wc -l)
  if [[ "$ent" -lt "$minent" ]]; then
    fail "$1 has ${ent} entries, below ${minent} — valid but effectively empty (${label})"
    return
  fi
  ok "$1 ($(du -h "$f" | cut -f1), ${ent} entries)"
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
  require_gzip "soulful-db.sql.gz" "soulful" 5000000 250
  require_tgz  "soulful-wordpress.tgz" "soulful" 100000000 10000
fi

if expects chatwoot; then
  # Floors measured 2026-10-14 (84 tables, 27.9 KB with 3 conversations); an error message is < 1 KB.
  require_gzip "chatwoot.sql.gz" "chatwoot" 10000 50 "PostgreSQL database dump complete"
  # Attachments may legitimately be none yet: a readable archive is the floor. Archiving the wrong volume is
  # caught by backup-coverage-check.py's sources check (hetzner-phase1-core/scripts/backup-inventory.json).
  require_tgz  "chatwoot-storage.tgz" "chatwoot" 0 1
fi

# Client sites registered in sites.d (backup-ks-aw-01.sh section 4b): the registry is their declaration, read here
# directly, not from the producer's output. Names come from the file name (the producer refuses a registry whose
# names differ from it, and that refusal is in manifest errors above). A site registered after this backup's
# manifest was written is first due tomorrow. Floors: a fresh WordPress has 12 core tables and ~3000 core files.
SITES_DIR="${CLIENT_WP_REGISTRY_DIR:-/etc/awarewave/sites.d}"
SITES_ROOT="${CLIENT_WP_SITES_ROOT:-/root/sites}"              # .env of each site: <root>/<slug>/.env (render.sh)
CRON_STATE="${WP_CRON_STATE_DIR:-/var/lib/wp-cron-runner}"     # = wp-cron-runner.sh STATE_DIR
SITE_ENVS=()   # registered sites' .env present on the host: must be members of env.tar.gz.enc (below)
for reg in "${SITES_DIR}"/*.json; do
  [[ -e "$reg" ]] || continue
  slug="$(basename "$reg" .json)"
  if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]]; then fail "${reg}: file name is not a site slug"; continue; fi
  created="$(grep -o '"created_at": *"[^"]*"' "$reg" | cut -d'"' -f4 || true)"
  created_s=0
  [[ -z "$created" ]] || created_s="$(date -u -d "$created" +%s 2>/dev/null || echo 0)"
  # Cutoff = the snapshot's own STAMP (host clock, taken before section 4b read sites.d): conservative, never late.
  stamp="$(basename "$TODAY_DIR")"
  started_s="$(date -d "${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s)"
  if [[ "$created_s" -gt $(( $(date +%s) + 300 )) ]]; then
    fail "site ${slug}: created_at '${created}' is in the future -- registry wrong, the site would never be due"
    continue
  fi
  if [[ "$created_s" -gt "$started_s" ]]; then
    ok "site ${slug} registered ${created}, after this backup started -- first due in the next one"
    continue
  fi
  [[ ! -f "${SITES_ROOT}/${slug}/.env" ]] || SITE_ENVS+=("${SITES_ROOT#/}/${slug}/.env")
  for f in "${slug}-db.sql.gz" "${slug}-wordpress.tgz"; do
    [[ -f "${TODAY_DIR}/${f}" ]] || fail "${f} missing (site ${slug} registered in ${SITES_DIR})"
  done
  # paused.<slug>-wp = WordPress not installed yet (the hosting gate's site-create sets it, `site-wp install` removes
  # it): an empty database and the image's files only, so the content floors cannot hold. Both files must still be
  # whole archives; the floors apply again the night after the flag is gone. The same flag also freezes an INSTALLED
  # site (migration runbook), so the exemption also needs the dump to prove it: zero CREATE TABLE = never installed.
  if [[ -e "${CRON_STATE}/paused.${slug}-wp" && -f "${TODAY_DIR}/${slug}-db.sql.gz" ]] \
     && [[ "$(zcat "${TODAY_DIR}/${slug}-db.sql.gz" 2>/dev/null | grep -c '^CREATE TABLE' || true)" == 0 ]]; then
    ok "site ${slug}: 尚未安裝 (WordPress not installed yet, ${CRON_STATE}/paused.${slug}-wp) -- content floors skipped"
    if [[ -f "${TODAY_DIR}/${slug}-db.sql.gz" ]]; then require_gzip "${slug}-db.sql.gz" "site ${slug}, not installed" 1 0; fi
    if [[ -f "${TODAY_DIR}/${slug}-wordpress.tgz" ]]; then require_tgz "${slug}-wordpress.tgz" "site ${slug}, not installed" 1 1; fi
    continue
  fi
  if [[ -f "${TODAY_DIR}/${slug}-db.sql.gz" ]]; then require_gzip "${slug}-db.sql.gz" "site ${slug}" 2000 12; fi
  if [[ -f "${TODAY_DIR}/${slug}-wordpress.tgz" ]]; then require_tgz "${slug}-wordpress.tgz" "site ${slug}" 1000000 1000; fi
done

# Encrypted .env bundle — required whenever any target .env exists on the host
if [[ -f /root/soulful/.env || -f /root/chatwoot/.env || ${#SITE_ENVS[@]} -gt 0 ]]; then
  F="${TODAY_DIR}/env.tar.gz.enc"
  if [[ -f "$F" && -s "$F" ]]; then
    ok "env.tar.gz.enc ($(du -h "$F" | cut -f1), present)"
  else
    fail "env.tar.gz.enc missing or empty (secrets NOT protected, but .env file(s) exist on host)"
  fi
  # tar -v member list written next to the bundle by backup-ks-aw-01.sh section 5 (names only, no values). GNU tar
  # prints them as given (/root/...), the archive stores them without the leading / -- compared without it, like
  # backup-coverage-check.py's members check.
  for m in ${SITE_ENVS[@]+"${SITE_ENVS[@]}"}; do
    if sed 's#^\./##; s#^/*##' "${F}.members" 2>/dev/null | grep -qxF "$m"; then ok "env.tar.gz.enc holds /${m}"
    else fail "env.tar.gz.enc does not hold /${m} (registered site's DB passwords NOT backed up)"; fi
  done
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
