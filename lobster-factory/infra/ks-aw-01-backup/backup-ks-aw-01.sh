#!/usr/bin/env bash
# ks-aw-01 (OVH SYS-GAME-2, Soulful migration host) daily backup.
# Mirror of backup-eu-stack.sh design: local snapshot + encrypt secrets + R2 offsite + verify.
#
# ---------------------------------------------------------------------------
# EXPECT_SERVICES is the single source of truth for "what must be backed up".
#
# Declared once in /etc/default/ks-aw-01-backup, read by BOTH this script and
# verify-backup-ks-aw-01.sh. Do NOT gate backup sections on live docker state
# (`docker ps | grep -q ...`): if backup and verify both derive expectations
# from the same live state, then "container renamed / crashed / dockerd down"
# is indistinguishable from "not deployed yet", every layer SKIPs, and
# check-backup-health.ps1 reports PASS on an empty backup — forever.
#
# Rule: a service listed here that is missing at runtime is an ERROR, never a SKIP.
# A service not listed here is simply not deployed yet and is silently ignored.
# When P5 (Chatwoot) / P7 (Soulful) land, add them to EXPECT_SERVICES in the
# same change that deploys them, and confirm the container/volume names below
# match what docker compose actually created (the active stack explicitly names
# its MariaDB container `soulful-db`; other compose projects may use
# <project>-<service>-<N> instead).
# ---------------------------------------------------------------------------
#
# Environment (from shell or /etc/default/ks-aw-01-backup):
#   EXPECT_SERVICES      — space-separated list of deployed services to back up.
#                          Valid tokens: soulful chatwoot. Empty = pre-P5/P7 state.
#   CLIENT_WP_REGISTRY_DIR — client site registry (default /etc/awarewave/sites.d; section 4b). Every
#                          <slug>.json there is backed up as <slug>-db.sql.gz + <slug>-wordpress.tgz, and its
#                          <CLIENT_WP_SITES_ROOT>/<slug>/.env (default root /root/sites) goes into env.tar.gz.enc (section 5).
#   BACKUP_DIR           — output root (default: /root/backups)
#   BACKUP_RETAIN_DAYS   — delete local backups older than N days (default: 7)
#   BACKUP_ENC_KEY       — AES key for .env encryption (required once any .env exists)
#   R2_API_TOKEN         — Cloudflare R2 Bearer token
#   R2_ACCOUNT_ID        — default aea1a836e6f8b8d7f18206dc8e848bd6
#   R2_BUCKET            — default lobster-backup
#   R2_PREFIX            — default ks-aw-01 (exported below; consumed by upload-to-r2.sh)
#
# Cron: /etc/cron.d/ks-aw-01-backup (02:15 UTC daily — offset from SG 02:00/EU 02:30)
# Log:  /var/log/ks-aw-01-backup.log
set -euo pipefail

set -a
[[ -f /etc/default/ks-aw-01-backup ]] && source /etc/default/ks-aw-01-backup
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
DATE="$(date +%Y-%m-%d)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
EXPECT_SERVICES="${EXPECT_SERVICES:-}"
export R2_PREFIX="${R2_PREFIX:-ks-aw-01}"
OUT="${BACKUP_DIR}/${STAMP}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

# expects <token> — is this service declared as deployed?
expects() {
  case " ${EXPECT_SERVICES} " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

mkdir -p "$OUT"
ERRORS=0

log "EXPECT_SERVICES='${EXPECT_SERVICES:-(none — pre-P5/P7)}'"

# --- 0. Docker daemon must be reachable, else every check below degrades to
#        "nothing deployed" and certifies an empty backup as green. ---
if ! docker info >/dev/null 2>&1; then
  log "FATAL: docker daemon unreachable — cannot distinguish 'not deployed' from 'down'"
  exit 1
fi

# require_container <name> <label> — ERROR if a declared service's container is absent
require_container() {
  if docker ps --format '{{.Names}}' | grep -qx "$1"; then
    return 0
  fi
  log "  ERROR: ${2} container '${1}' declared in EXPECT_SERVICES but NOT running"
  ERRORS=$((ERRORS + 1))
  return 1
}

require_volume() {
  if docker volume inspect "$1" >/dev/null 2>&1; then
    return 0
  fi
  log "  ERROR: ${2} volume '${1}' declared in EXPECT_SERVICES but NOT found"
  ERRORS=$((ERRORS + 1))
  return 1
}

# --- 1. Soulful WordPress DB ---
if expects soulful; then
  if require_container "${SOULFUL_DB_CONTAINER:-soulful-db}" "Soulful DB"; then
    log "Dumping Soulful WordPress DB..."
    # MariaDB 11.8 publishes its native client names and MARIADB_* variables;
    # the legacy mysql/mysqldump aliases and MYSQL_ROOT_PASSWORD are absent.
    if docker exec "${SOULFUL_DB_CONTAINER:-soulful-db}" sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" --single-transaction soulful' 2>/dev/null | gzip > "${OUT}/soulful-db.sql.gz"; then
      if gzip -t "${OUT}/soulful-db.sql.gz" 2>/dev/null && [[ -s "${OUT}/soulful-db.sql.gz" ]]; then
        SIZE=$(du -h "${OUT}/soulful-db.sql.gz" | cut -f1); log "  soulful-db.sql.gz OK (${SIZE})"
      else
        log "  ERROR: soulful-db.sql.gz integrity failed or empty"; ERRORS=$((ERRORS + 1))
      fi
    else
      log "  ERROR: Soulful MariaDB dump failed"; ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# --- 2. Soulful WordPress uploads + code ---
if expects soulful; then
  if require_volume "${SOULFUL_WP_VOLUME:-soulful_wordpress_data}" "Soulful WordPress"; then
    log "Archiving Soulful WordPress volume..."
    if docker run --rm -v "${SOULFUL_WP_VOLUME:-soulful_wordpress_data}":/data:ro -v "$(realpath "${OUT}")":/backup \
         alpine tar czf /backup/soulful-wordpress.tgz -C /data . 2>/dev/null && [[ -s "${OUT}/soulful-wordpress.tgz" ]]; then
      SIZE=$(du -h "${OUT}/soulful-wordpress.tgz" | cut -f1); log "  soulful-wordpress.tgz OK (${SIZE})"
    else
      log "  ERROR: soulful-wordpress.tgz failed"; ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# --- 3. Chatwoot PG ---
if expects chatwoot; then
  if require_container "${CHATWOOT_DB_CONTAINER:-chatwoot-postgres}" "Chatwoot DB"; then
    log "Dumping Chatwoot Postgres..."
    if docker exec "${CHATWOOT_DB_CONTAINER:-chatwoot-postgres}" pg_dump -U chatwoot chatwoot_production 2>/dev/null | gzip > "${OUT}/chatwoot.sql.gz"; then
      if gzip -t "${OUT}/chatwoot.sql.gz" 2>/dev/null && [[ -s "${OUT}/chatwoot.sql.gz" ]]; then
        SIZE=$(du -h "${OUT}/chatwoot.sql.gz" | cut -f1); log "  chatwoot.sql.gz OK (${SIZE})"
      else
        log "  ERROR: chatwoot.sql.gz integrity failed or empty"; ERRORS=$((ERRORS + 1))
      fi
    else
      log "  ERROR: Chatwoot pg_dump failed"; ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# --- 4. Chatwoot uploads volume ---
if expects chatwoot; then
  if require_volume "${CHATWOOT_STORAGE_VOLUME:-chatwoot_chatwoot_storage}" "Chatwoot storage"; then
    log "Archiving Chatwoot storage volume..."
    if docker run --rm -v "${CHATWOOT_STORAGE_VOLUME:-chatwoot_chatwoot_storage}":/data:ro -v "$(realpath "${OUT}")":/backup \
         alpine tar czf /backup/chatwoot-storage.tgz -C /data . 2>/dev/null && [[ -s "${OUT}/chatwoot-storage.tgz" ]]; then
      SIZE=$(du -h "${OUT}/chatwoot-storage.tgz" | cut -f1); log "  chatwoot-storage.tgz OK (${SIZE})"
    else
      log "  ERROR: chatwoot-storage.tgz failed"; ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# --- 4b. Client WordPress sites registered in sites.d (SITE-FLOW SF-F) ---
# The registry IS the declaration for these sites (same rule as EXPECT_SERVICES: registered + missing = ERROR).
# Format and names: hetzner-phase1-core/scripts/templates/client-wp/render.sh (<slug>-db, <slug>_wordpress_data);
# a file whose values differ from those names is refused, never guessed. Same dump/archive commands as Soulful.
# A site's failure counts in SITE_ERRORS: it fails the run and verify, but does not cost every other store its
# offsite copy (the abort gate below reads ERRORS only). No registry files = no output here at all.
SITES_DIR="${CLIENT_WP_REGISTRY_DIR:-/etc/awarewave/sites.d}"
SITES_ROOT="${CLIENT_WP_SITES_ROOT:-/root/sites}"   # = render.sh client_wp_env_file: <root>/<slug>/.env
SITE_ENV_FILES=()
SITE_ERRORS=0
site_error() { log "  ERROR: $1"; SITE_ERRORS=$((SITE_ERRORS + 1)); }
if compgen -G "${SITES_DIR}/*.json" >/dev/null; then
  # One line per file: ok<TAB>slug<TAB>db container<TAB>files volume | bad<TAB>file<TAB>reason (no file content).
  if ! SITE_LIST="$(python3 - "$SITES_DIR" <<'PY'
import json, os, re, sys
sys.stdout.reconfigure(newline="\n")  # LF even where Python would write CRLF: bash splits on LF only
d = sys.argv[1]
keys = {"slug", "domain", "ingress", "container", "db_container", "volumes", "port", "compose_file", "vhost_file", "created_at"}
for name in sorted(os.listdir(d)):
    if name.startswith(".") or not name.endswith(".json"):  # bash globs skip dotfiles too
        continue
    slug = name[:-5]
    try:
        with open(os.path.join(d, name), encoding="utf-8") as fh:
            r = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"bad\t{name}\tunreadable ({type(e).__name__})")
        continue
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", slug):
        why = "file name is not a site slug"
    elif not isinstance(r, dict) or set(r) != keys:
        why = "keys differ from the template"
    elif (r["slug"], r["container"], r["db_container"], r["volumes"]) != (
            slug, f"{slug}-wp", f"{slug}-db", [f"{slug}_wordpress_data", f"{slug}_db_data"]):
        why = "slug/container/db_container/volumes differ from what render.sh derives"
    else:
        print(f"ok\t{slug}\t{r['db_container']}\t{r['volumes'][0]}")
        continue
    print(f"bad\t{name}\t{why}")
PY
  )"; then
    site_error "cannot read the site registry ${SITES_DIR} (python3 failed) -- registered sites NOT backed up"
    SITE_LIST=""
  fi
  # Not under set -e: a docker hiccup here must fail the sites, not abort before the other stores' upload.
  RUNNING="$(docker ps --format '{{.Names}}')" || { site_error "docker ps failed -- registered sites NOT backed up"; RUNNING=""; }
  while IFS=$'\t' read -r kind slug db vol; do
    [[ -n "$kind" ]] || continue
    if [[ "$kind" != ok ]]; then site_error "registry ${SITES_DIR}/${slug} refused: ${db} -- that site is NOT backed up"; continue; fi
    # Its DB passwords: encrypted with the other .env files in section 5, same as Soulful/Chatwoot (present -> included).
    [[ -f "${SITES_ROOT}/${slug}/.env" ]] && SITE_ENV_FILES+=("${SITES_ROOT}/${slug}/.env")
    for f in "${slug}-db.sql.gz" "${slug}-wordpress.tgz"; do
      [[ ! -e "${OUT}/${f}" ]] || { site_error "site ${slug}: ${f} already written by another section -- slug clashes"; continue 2; }
    done
    if grep -qx "$db" <<<"$RUNNING"; then
      log "Dumping site ${slug} WordPress DB..."
      if docker exec "$db" sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" --single-transaction wordpress' 2>/dev/null | gzip > "${OUT}/${slug}-db.sql.gz"; then
        if gzip -t "${OUT}/${slug}-db.sql.gz" 2>/dev/null && [[ -s "${OUT}/${slug}-db.sql.gz" ]]; then
          SIZE=$(du -h "${OUT}/${slug}-db.sql.gz" | cut -f1); log "  ${slug}-db.sql.gz OK (${SIZE})"
        else
          site_error "${slug}-db.sql.gz integrity failed or empty"
        fi
      else
        site_error "site ${slug} MariaDB dump failed"
      fi
    else
      site_error "site ${slug} DB container '${db}' registered in ${SITES_DIR} but NOT running"
    fi
    if docker volume inspect "$vol" >/dev/null 2>&1; then
      log "Archiving site ${slug} WordPress volume..."
      if docker run --rm -v "$vol":/data:ro -v "$(realpath "${OUT}")":/backup \
           alpine tar czf "/backup/${slug}-wordpress.tgz" -C /data . 2>/dev/null && [[ -s "${OUT}/${slug}-wordpress.tgz" ]]; then
        SIZE=$(du -h "${OUT}/${slug}-wordpress.tgz" | cut -f1); log "  ${slug}-wordpress.tgz OK (${SIZE})"
      else
        site_error "${slug}-wordpress.tgz failed"
      fi
    else
      site_error "site ${slug} volume '${vol}' registered in ${SITES_DIR} but NOT found"
    fi
  done <<<"$SITE_LIST"
fi

# --- 5. Secrets: any .env files present, ENCRYPTED before leaving host ---
ENV_FILES=()
for f in /root/soulful/.env /root/chatwoot/.env; do
  [[ -f "$f" ]] && ENV_FILES+=("$f")
done
ENV_FILES+=(${SITE_ENV_FILES[@]+"${SITE_ENV_FILES[@]}"})   # registered client sites (4b); names only, never values
if [[ ${#ENV_FILES[@]} -gt 0 ]]; then
  if [[ -n "${BACKUP_ENC_KEY:-}" ]]; then
    log "Archiving + encrypting ${#ENV_FILES[@]} .env file(s) (AES-256)..."
    export BACKUP_ENC_KEY
    # tar -v lists members on stderr -> env.tar.gz.enc.members (checked by backup-coverage-check.py; "tar: " lines
    # there are notices or errors, not members).
    if tar czvf - "${ENV_FILES[@]}" 2>"${OUT}/env.tar.gz.enc.members" \
         | openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -out "${OUT}/env.tar.gz.enc" 2>/dev/null \
         && [[ -s "${OUT}/env.tar.gz.enc" ]]; then
      SIZE=$(du -h "${OUT}/env.tar.gz.enc" | cut -f1); log "  env.tar.gz.enc OK (${SIZE})"
    else
      log "  ERROR: .env encrypt failed"; ERRORS=$((ERRORS + 1))
    fi
  else
    log "  ERROR: BACKUP_ENC_KEY not set — ${#ENV_FILES[@]} .env file(s) found but NOT backed up (secrets unprotected)"
    ERRORS=$((ERRORS + 1))
  fi
else
  log "  No .env files on host yet"
fi

# --- 6. Manifest, written BEFORE the abort gate so a failed run still leaves a
#        readable record of what went wrong (errors>0 is the useful case). ---
cat > "${OUT}/manifest.json" <<EOF
{"host":"ks-aw-01","stamp":"${STAMP}","date":"${DATE}","expect_services":"${EXPECT_SERVICES}","errors":$((ERRORS + SITE_ERRORS)),"files":$(ls -1 "${OUT}" | grep -v manifest.json | wc -l)}
EOF
log "manifest.json written (errors=$((ERRORS + SITE_ERRORS)))"

# --- 7. Abort if critical errors ---
if [[ $ERRORS -gt 0 ]]; then
  log "FATAL: ${ERRORS} critical error(s). Backup at ${OUT} is INCOMPLETE — not uploading."
  exit 1
fi

# --- 8. Retention cleanup ---
if [[ "${BACKUP_RETAIN_DAYS}" -gt 0 ]]; then
  # -name '20[0-9][0-9]...' is NOT cosmetic: retention must only ever delete
  # snapshots THIS script created. Without it, `find -maxdepth 1 -type d` matches
  # EVERY directory in BACKUP_DIR, including long-lived ones other processes put
  # there. That is not hypothetical: on 2026-08-24 02:32 UTC this exact line on EU
  # deleted /root/backups/clients/ -- the entire 769 MB soulfulexpression.org
  # migration safety net (DB + uploads + code) -- 7 days after its mtime went
  # static, silently, with every health check still reporting PASS.
  # Still in the blast radius today: `from-sg/` on EU and `from-eu/` on SG, the
  # cross-VPS offsite copies. They survive only because daily rsync keeps their
  # mtime fresh -- meaning "the peer host has been down for a week" would trigger
  # "delete all of the peer's offsite backups", precisely when they are needed.
  # Invariant: a cleanup job may only delete what it created.
  _snap_glob='20[0-9][0-9][01][0-9][0-3][0-9]-[0-2][0-9][0-5][0-9][0-5][0-9]'
  DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" 2>/dev/null | wc -l)
  if [[ "$DELETED" -gt 0 ]]; then
    find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "$_snap_glob" -mtime +"${BACKUP_RETAIN_DAYS}" -exec rm -rf {} + 2>/dev/null || true
    log "Retention: deleted ${DELETED} backup(s) older than ${BACKUP_RETAIN_DAYS} days"
  else
    log "Retention: nothing to clean (keep ${BACKUP_RETAIN_DAYS} days)"
  fi
fi

# --- 9. Summary ---
TOTAL_SIZE=$(du -sh "${OUT}" | cut -f1)
log "=== Backup complete: ${OUT} (${TOTAL_SIZE}) ==="

# --- 10. Cloudflare R2 upload (offsite) ---
# Key uses STAMP (date+time), not just DATE — the ks-aw-01/ prefix carries a
# 14-day WORM lock (P3.2), so a date-only key would make any retry after a
# partial upload permanently impossible (already-uploaded objects are locked
# and cannot be overwritten for 14 days).
if [[ -z "${R2_API_TOKEN:-}" ]]; then
  log "FATAL: R2_API_TOKEN not set — no offsite copy"
  exit 2
fi
UPLOAD_TO_R2="${UPLOAD_TO_R2:-/root/scripts/upload-to-r2.sh}"   # override for throwaway tests only
if [[ ! -x "${UPLOAD_TO_R2}" ]]; then
  log "FATAL: ${UPLOAD_TO_R2} not found or not executable"
  exit 2
fi
log "Uploading to Cloudflare R2..."
if "${UPLOAD_TO_R2}" "${OUT}" "${STAMP}" 2>&1; then
  log "  R2 upload OK"
  echo "${STAMP}" > "${OUT}/.verify"
else
  log "FATAL: R2 upload failed"
  exit 2
fi

# --- 11. Registered-site errors (4b) fail the run only after the other stores reached R2 ---
if [[ $SITE_ERRORS -gt 0 ]]; then
  log "FATAL: ${SITE_ERRORS} registered-site error(s) -- see ERROR lines above; other stores uploaded"
  exit 1
fi
