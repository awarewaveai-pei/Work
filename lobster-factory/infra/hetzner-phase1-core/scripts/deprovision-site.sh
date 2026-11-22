#!/usr/bin/env bash
# deprovision-site.sh -- tear down one client WordPress site built from templates/client-wp (the site flow, SF-D).
#
# Invariant (SITE-FLOW I5): every persistent thing the site flow creates has this removal path. Host-side script only,
# no HTTP/SSH verb (same reason as deprovision-staging.sh:19-27: a leaked key must not be able to destroy sites).
#
# What it removes = what the registry /etc/awarewave/sites.d/<slug>.json records (templates/client-wp/render.sh has the
# format and the caller contract). Nothing is found by guessing names, and nothing is touched that this flow did not
# create: registry values must equal what render.sh derives from the slug; a vhost file must carry the header and
# proxy_pass client_wp_render_vhost wrote for this slug and port; containers must belong to project <slug> started
# from the site dir. Any mismatch stops the run and leaves that thing alone.
#   1 vhost       (only when the registry names one) sites-enabled link removed, `nginx -t`, reload (link restored if
#                 either fails); file moved to the archive. product-gateway sites have no vhost here.
#   2 containers  `docker compose -p <slug> down` -- never -v; compose file moved to the archive.
#   3 volumes     kept by default, with .env (their DB password) and the marker <site dir>/DEPROVISIONED, which makes
#                 the gate refuse to silently reuse them (render.sh caller contract 4). Deleted only with
#                 --purge-volumes --confirm-purge <slug> (also removes .env, marker and the site dir).
#   4 registry    moved to the archive LAST, so a run that fails midway can simply be run again.
# Archive: /var/lib/awarewave/deprovisioned/<slug>-<UTC stamp>/ (registry, vhost, compose file; never volumes); a re-run
# reuses it (<site dir>/.deprovision-archive). After a default teardown the live registry is gone; a later purge reads
# the archived one named in the marker.
# No registry and no marker but a .env = an abandoned failed create (volumes kept by compose-new's rollback): only
# --purge-volumes removes it, and only volumes labelled com.docker.compose.project=<slug>.
# The DB side (environments row -> archived) is not touched here: the site-flow page derives it from observation (I1).
#
# Usage
#   deprovision-site.sh --slug <slug>                                                    # DRY RUN: lists the four layers
#   deprovision-site.sh --slug <slug> --apply --confirm <slug>                           # keeps volumes
#   deprovision-site.sh --slug <slug> --apply --confirm <slug> --purge-volumes --confirm-purge <slug>
# Exit: 0 done / dry run; 2 refused (arguments, guard, lock); 3 failed while applying (re-run is safe).
# Test: tests/host-scripts/client-wp-template.test.sh (throwaway container, docker/nginx/systemctl shims).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# Path overrides (render.sh's CLIENT_WP_* and DEPROVISION_ARCHIVE_DIR) exist for throwaway tests and need the explicit
# switch CLIENT_WP_TEST_PATHS=1. Without it, any of them set = refused: a variable left in a root shell would otherwise
# send a real teardown to another lock than the gate's (SF-E2 #9).
if [[ "${CLIENT_WP_TEST_PATHS-}" != 1 ]]; then
  for v in CLIENT_WP_SITES_ROOT CLIENT_WP_REGISTRY_DIR CLIENT_WP_NGINX_DIR CLIENT_WP_LOCK_DIR DEPROVISION_ARCHIVE_DIR; do
    [[ -z "${!v+x}" ]] || { echo "DENIED: $v is set; test path overrides need CLIENT_WP_TEST_PATHS=1 (unset it for a real run)"; exit 2; }
  done
fi
# shellcheck source=templates/client-wp/render.sh
source "$HERE/templates/client-wp/render.sh"
ARCHIVE_ROOT=/var/lib/awarewave/deprovisioned
[[ "${CLIENT_WP_TEST_PATHS-}" != 1 ]] || ARCHIVE_ROOT="${DEPROVISION_ARCHIVE_DIR:-$ARCHIVE_ROOT}"

SLUG=""; APPLY=0; CONFIRM=""; PURGE=0; CONFIRM_PURGE=""
say()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
deny() { say "DENIED: $*"; exit 2; }
fail() { say "ERROR: $*"; exit 3; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug|--confirm|--confirm-purge) [[ $# -ge 2 ]] || deny "$1 needs a value" ;;
  esac
  case "$1" in
    --slug)          SLUG="$2"; shift 2 ;;
    --apply)         APPLY=1; shift ;;
    --confirm)       CONFIRM="$2"; shift 2 ;;
    --purge-volumes) PURGE=1; shift ;;
    --confirm-purge) CONFIRM_PURGE="$2"; shift 2 ;;
    -h|--help)       sed -n '2,/^set -euo/p' "$0"; exit 0 ;;
    *)               deny "unknown argument: $1" ;;
  esac
done
client_wp_valid_slug "$SLUG" 2>/dev/null || deny "--slug must match $CLIENT_WP_SLUG_RE (got '$SLUG')"
if (( APPLY )); then
  [[ "$CONFIRM" == "$SLUG" ]] || deny "--apply needs --confirm $SLUG"
  if (( PURGE )); then [[ "$CONFIRM_PURGE" == "$SLUG" ]] || deny "--purge-volumes needs --confirm-purge $SLUG"; fi
fi
[[ -z "$CONFIRM_PURGE" || $PURGE -eq 1 ]] || deny "--confirm-purge without --purge-volumes"

# Same lock as the hosting gate's site-create/site-vhost (render.sh caller contract 1). Dry run writes nothing, so no lock.
if (( APPLY )); then
  why="$(client_wp_lock_dir_ready 2>&1)" || deny "$why"
  exec 9>"$(client_wp_lock_file "$SLUG")" || deny "cannot open lock $(client_wp_lock_file "$SLUG")"
  flock -n 9 || deny "another create/teardown of $SLUG is running (lock $(client_wp_lock_file "$SLUG"))"
fi

SITE_DIR="$(client_wp_site_dir "$SLUG")"; ENV_FILE="$(client_wp_env_file "$SLUG")"
MARKER="$(client_wp_retired_marker "$SLUG")"; POINTER="$SITE_DIR/.deprovision-archive"
ARCHIVE_ROOT_REAL="$(realpath -m "$ARCHIVE_ROOT")"
# An archive dir is accepted only as <archive root>/<slug>-<stamp> after symlinks and `..` are resolved.
archive_dir_ok() {
  local r; r="$(realpath -e "$1" 2>/dev/null)" || return 1
  [[ -d "$r" && "$(dirname "$r")" == "$ARCHIVE_ROOT_REAL" && "$(basename "$r")" =~ ^${SLUG}-[0-9]{8}T[0-9]{6}Z$ ]]
}

# ── which record: live registry / archived one (marker) / failed-create remnant ──────────────────────────────
REGISTRY="$(client_wp_registry_file "$SLUG")"; MODE=live
if [[ ! -f "$REGISTRY" ]]; then
  if [[ -f "$MARKER" ]]; then
    REGISTRY="$(sed -n 's/^registry=//p' "$MARKER" | head -1)"
    [[ "$(basename "$REGISTRY")" == "$SLUG.json" ]] && archive_dir_ok "$(dirname "$REGISTRY")" && [[ -f "$REGISTRY" ]] \
      || deny "marker $MARKER names no archived registry under $ARCHIVE_ROOT/$SLUG-<stamp>/"
    REGISTRY="$(realpath -e "$REGISTRY")"; MODE=retired
  elif [[ -f "$ENV_FILE" ]]; then
    MODE=remnant
  else
    deny "no registry $(client_wp_registry_file "$SLUG"), no marker, no .env: nothing to tear down (names are never guessed)"
  fi
fi

declare -A R=()
if [[ "$MODE" == remnant ]]; then
  # Never registered: only what render.sh derives, and only volumes compose labelled for this project (checked below).
  R=([domain]="" [ingress]=none [container]="$(client_wp_container "$SLUG")" [db_container]="$(client_wp_db_container "$SLUG")"
     [volumes]="$(client_wp_volumes "$SLUG")" [port]="" [compose_file]="$(client_wp_compose_file "$SLUG")" [vhost_file]="")
else
  fields="$(python3 - "$REGISTRY" "$SLUG" "$CLIENT_WP_DOMAIN_RE" <<'PY'
import json, re, sys
path, slug, domain_re = sys.argv[1:4]
try:
    with open(path, encoding="utf-8") as f:
        r = json.load(f)
except (OSError, ValueError) as e:
    sys.exit(f"unreadable registry {path}: {e}")
keys = {"slug", "domain", "ingress", "container", "db_container", "volumes", "port", "compose_file", "vhost_file", "created_at"}
if not isinstance(r, dict) or set(r) != keys:
    sys.exit(f"registry keys differ from the template: {sorted(r) if isinstance(r, dict) else type(r).__name__}")
d = r["domain"]
if r["slug"] != slug or not isinstance(d, str) or len(d) > 253 or not re.fullmatch(domain_re.strip("^$"), d):
    sys.exit("slug or domain invalid")
if r["ingress"] not in ("host-vhost", "product-gateway") or not isinstance(r["volumes"], list):
    sys.exit("ingress or volumes invalid")
if type(r["port"]) is not int or not all(isinstance(r[k], str) for k in ("container", "db_container", "compose_file")):
    sys.exit("port/container/compose_file have the wrong type")
if not (r["vhost_file"] is None or isinstance(r["vhost_file"], str)) or not all(isinstance(v, str) for v in r["volumes"]):
    sys.exit("vhost_file/volumes have the wrong type")
print("domain=" + d)
print("ingress=" + r["ingress"])
print("container=" + r["container"])
print("db_container=" + r["db_container"])
print("volumes=" + " ".join(r["volumes"]))
print("port=" + str(r["port"]))
print("compose_file=" + r["compose_file"])
print("vhost_file=" + ("" if r["vhost_file"] is None else r["vhost_file"]))
PY
  )" || deny "registry $REGISTRY rejected"
  while IFS='=' read -r k v; do R[$k]="$v"; done <<<"$fields"
  vhost_ok=0
  [[ -z "${R[vhost_file]}" ]] && vhost_ok=1
  [[ "${R[ingress]}" == host-vhost && "${R[vhost_file]}" == "$(client_wp_vhost_file "${R[domain]}")" ]] && vhost_ok=1
  [[ $vhost_ok == 1 && "${R[container]}" == "$(client_wp_container "$SLUG")" \
     && "${R[db_container]}" == "$(client_wp_db_container "$SLUG")" && "${R[volumes]}" == "$(client_wp_volumes "$SLUG")" \
     && "${R[compose_file]}" == "$(client_wp_compose_file "$SLUG")" ]] && client_wp_valid_port "${R[port]}" 2>/dev/null \
    || deny "registry $REGISTRY: values differ from what templates/client-wp/render.sh derives for '$SLUG' -- not torn down by this script"
fi
if [[ "$MODE" == remnant ]] && (( ! PURGE )); then
  deny "$SLUG has no registry: an abandoned failed create (.env + volumes) -- removing it needs --purge-volumes --confirm-purge $SLUG"
fi

COMPOSE_FILE="${R[compose_file]}"; VHOST="${R[vhost_file]}"
LINK=""; [[ -n "$VHOST" ]] && LINK="$CLIENT_WP_NGINX_DIR/sites-enabled/$(basename "$VHOST")"
read -ra VOLUMES <<<"${R[volumes]}"
project_containers() { docker ps -aq --filter "label=com.docker.compose.project=$SLUG"; }
vol_project() { docker volume inspect -f '{{index .Labels "com.docker.compose.project"}}' "$1" 2>/dev/null; }

# A retired site's vhost went away in the teardown that kept its volumes (step 1 runs before the marker is written), so
# its domain may since serve another site from the same path: a purge never looks at, or is stopped by, that (SF-E2 #10).
[[ "$MODE" != retired ]] || { VHOST=""; LINK=""; }

# ── plan (read-only) ────────────────────────────────────────────────────────────────────────────────────────
state() { if "$@" >/dev/null 2>&1; then echo present; else echo absent; fi; }
case "$MODE" in
  live)    say "site $SLUG (${R[domain]}, ingress=${R[ingress]}) -- registry $REGISTRY" ;;
  retired) say "site $SLUG (${R[domain]}) -- already torn down; archived registry $REGISTRY" ;;
  remnant) say "site $SLUG -- no registry: abandoned failed create ($ENV_FILE present)" ;;
esac
if [[ -n "$VHOST" ]]; then
  own="NOT this site's vhost -- will stop"; client_wp_vhost_owned "$VHOST" "$SLUG" "${R[domain]}" "${R[port]}" && own="this site's"
  [[ -e "$VHOST" ]] || own="gone"
  say "  1 vhost       remove link $LINK [$(state test -L "$LINK")], nginx -t, reload; archive $VHOST [$own]"
elif [[ "$MODE" == retired ]]; then
  say "  1 vhost       removed by the earlier teardown (archive $(dirname "$REGISTRY")) -- the domain's current vhost is not touched"
else
  say "  1 vhost       none recorded (ingress=${R[ingress]}; a vhost is recorded only after this site's host-nginx-new) -- not touched"
fi
say "  2 containers  docker compose -p $SLUG down (no -v): $(project_containers | wc -l | tr -d ' ') container(s) of project $SLUG; archive $COMPOSE_FILE [$(state test -f "$COMPOSE_FILE")]"
for v in "${VOLUMES[@]}"; do
  if (( PURGE )); then act="DELETE"; else act="keep"; fi
  say "  3 volume      $act $v [$(state docker volume inspect "$v")]"
done
if (( PURGE )); then say "  3 .env        delete $ENV_FILE, the pre-plugins DB export and $SITE_DIR"
else say "  3 .env        keep $ENV_FILE (DB password of the kept volumes); mark $MARKER"; fi
case "$MODE" in
  live)    say "  4 registry    archive $REGISTRY" ;;
  retired) say "  4 registry    already archived ($REGISTRY)" ;;
  remnant) say "  4 registry    none" ;;
esac
if (( ! APPLY )); then
  say "DRY RUN -- nothing changed. Apply: $0 --slug $SLUG --apply --confirm $SLUG$( (( PURGE )) && echo " --purge-volumes --confirm-purge $SLUG")"
  exit 0
fi
trap 'say "ERROR: unexpected failure at line $LINENO (re-run is safe)"; exit 3' ERR

# ── apply; every step is skipped when already done, so a failed run is re-run as is ─────────────────────────
if [[ "$MODE" == retired ]]; then ARCHIVE="$(dirname "$REGISTRY")"
elif [[ -f "$POINTER" ]] && archive_dir_ok "$(cat "$POINTER")"; then ARCHIVE="$(realpath -e "$(cat "$POINTER")")"
else
  ARCHIVE="$ARCHIVE_ROOT_REAL/$SLUG-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p -m 0700 "$ARCHIVE_ROOT_REAL" "$SITE_DIR"; mkdir -m 0700 "$ARCHIVE" || fail "cannot create archive $ARCHIVE"
  printf '%s\n' "$ARCHIVE" >"$POINTER.tmp"; mv "$POINTER.tmp" "$POINTER"
fi
[[ "$MODE" != live ]] || cp -p "$REGISTRY" "$ARCHIVE/$SLUG.json"
say "archive: $ARCHIVE"

# 1 vhost: link first, so nginx stops serving the site before anything behind it goes away. Reload also when the link
# is already gone but the file is still here (a run killed between the rm and the reload).
if [[ -n "$VHOST" ]]; then
  if [[ -e "$VHOST" || -L "$VHOST" ]]; then
    client_wp_vhost_owned "$VHOST" "$SLUG" "${R[domain]}" "${R[port]}" \
      || fail "$VHOST is not the vhost render.sh wrote for $SLUG on port ${R[port]} -- left alone"
  fi
  had_link=0
  if [[ -L "$LINK" ]]; then
    [[ "$(readlink "$LINK")" == "$VHOST" ]] || fail "$LINK points at $(readlink "$LINK"), not $VHOST -- left alone"
    rm -f "$LINK"; had_link=1
  elif [[ -e "$LINK" ]]; then
    fail "$LINK exists but is not a link -- left alone"
  fi
  if (( had_link )) || [[ -f "$VHOST" ]]; then
    if ! nt="$(nginx -t 2>&1)"; then
      (( had_link )) && ln -s "$VHOST" "$LINK"
      fail "nginx -t failed without $LINK (link restored): $(tail -2 <<<"$nt" | tr '\n' ' ')"
    fi
    if ! systemctl reload nginx; then (( had_link )) && ln -s "$VHOST" "$LINK"; fail "nginx reload failed (link restored)"; fi
    say "1 vhost: $LINK removed, nginx reloaded"
  fi
  if [[ -f "$VHOST" ]]; then mv "$VHOST" "$ARCHIVE/"; say "1 vhost: $VHOST archived"; fi
fi

# 2 containers: by project label, not by file -- works when the compose file or its .env is already gone. Every
# container of the project must have been started from this site's dir, else it is someone else's project.
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  wd="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$id")"
  [[ "$wd" == "$SITE_DIR" ]] || fail "container $id of project $SLUG was started from '$wd', not $SITE_DIR -- left alone"
done < <(project_containers)
if [[ -n "$(project_containers)" ]]; then
  (cd "$ARCHIVE" && docker compose -p "$SLUG" down) || fail "docker compose -p $SLUG down failed"
fi
[[ -z "$(project_containers)" ]] || fail "containers of project $SLUG still present after down"
for c in "${R[container]}" "${R[db_container]}"; do
  [[ -z "$(docker ps -aq --filter "name=^/${c}\$")" ]] || fail "container $c still present (not of project $SLUG) -- left alone"
done
say "2 containers: none left for project $SLUG"
if [[ -f "$COMPOSE_FILE" ]]; then mv "$COMPOSE_FILE" "$ARCHIVE/"; say "2 containers: $COMPOSE_FILE archived"; fi

# 3 volumes
if (( PURGE )); then
  for v in "${VOLUMES[@]}"; do
    docker volume inspect "$v" >/dev/null 2>&1 || continue
    [[ "$(vol_project "$v")" == "$SLUG" ]] || fail "volume $v is not labelled com.docker.compose.project=$SLUG -- left alone"
    docker volume rm "$v" >/dev/null || fail "docker volume rm $v failed"
    say "3 volume $v deleted"
  done
  rm -f "$ENV_FILE" "$(client_wp_db_export_file "$SLUG")" "$(client_wp_db_export_file "$SLUG")".?????? "$MARKER" "$POINTER"   # + an export temp a killed run left
  rmdir "$SITE_DIR" 2>/dev/null || [[ ! -e "$SITE_DIR" ]] || say "3 warn: $SITE_DIR not empty, left in place"
else
  # The marker is the only pointer to the archived registry once step 4 runs, so it is written even without a site dir.
  mkdir -p -m 0700 "$SITE_DIR"
  printf 'deprovisioned_at=%s\nregistry=%s\nvolumes=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARCHIVE/$SLUG.json" "${VOLUMES[*]}" >"$MARKER.tmp"
  mv "$MARKER.tmp" "$MARKER"
  say "3 volumes kept: ${VOLUMES[*]} (marker $MARKER)"
fi

# 4 registry last
if [[ "$MODE" == live ]]; then rm -f "$REGISTRY"; say "4 registry: $REGISTRY removed (copy in $ARCHIVE)"; fi
say "done: $SLUG torn down$( (( PURGE )) && echo ', volumes deleted' || echo ', volumes kept')"
