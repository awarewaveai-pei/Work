# shellcheck shell=bash
# render.sh -- renderer for client WordPress sites on this host. SOURCE it; it defines functions and constants only.
#
#   client_wp_render_compose  <slug> <domain> <port> <same_host_products 0|1>   -> docker-compose.yml on stdout
#   client_wp_render_vhost    <slug> <domain> <port> <cert_dir>                 -> nginx vhost on stdout
#   client_wp_render_registry <slug> <domain> <port> <ingress> <vhost_live 0|1> [created_at] -> sites.d/<slug>.json
#   client_wp_write_registry  (same args)  writes it atomically   |   client_wp_read_registry <slug>  validated key=value
# A bad parameter prints the reason on stderr, nothing on stdout, and returns 1. Container names, volumes, file paths
# are derived from the slug here (client_wp_* helpers below), never taken from a caller.
# Output goes to `safe-infra-patch.sh compose-new` / `host-nginx-new` on stdin; nothing here touches the host.
#
# Host registry /etc/awarewave/sites.d/<slug>.json (written by the hosting gate after compose-new succeeds; read by
# backup (SF-F), the gate and deprovision-site.sh). One object, exactly these keys:
#   slug          = file name without .json
#   domain        public host name
#   ingress       host-vhost (this host's nginx vhost) | product-gateway (an existing product gateway routes it)
#   container     <slug>-wp            db_container  <slug>-db
#   volumes       ["<slug>_wordpress_data", "<slug>_db_data"]
#   port          127.0.0.1 port of <slug>-wp, 8100-8199
#   compose_file  /root/sites/<slug>/docker-compose.yml   (.env with the DB passwords sits next to it, 0600)
#   vhost_file    /etc/nginx/sites-available/<domain>.conf once THIS site's host-nginx-new exited 0 (vhost_live=1);
#                 null before that and always for product-gateway. A path here is a claim of ownership that teardown
#                 acts on, so it is never written for a vhost this flow did not create (the domain may be served by
#                 another file: SITE-FLOW §1 row 6 blocks the vhost step but not container creation).
#   created_at    UTC, 2026-11-22T10:00:00Z
# deprovision-site.sh refuses a registry whose values differ from what these helpers derive from its slug, and a vhost
# file whose first line / proxy_pass is not what client_wp_render_vhost produced for this slug and port.
#
# Caller contract (implemented by scripts/aw-hosting-gate.sh site-create/site-vhost/site-wp; grep "contract N" there):
#  1. Lock: `client_wp_lock_dir_ready` first (refuse when it fails), then hold `flock` on "$(client_wp_lock_file <slug>)"
#     for the whole of site-create / site-vhost / every site-wp sub-verb; deprovision-site.sh takes the same lock.
#     Read-only verbs (site-preflight, site-job) take none. Choosing a free port additionally holds
#     "$CLIENT_WP_PORT_LOCK" until the registry is written. safe-infra-patch.sh has no lock of its own.
#  2. Image: compose-new runs `up --no-build`, so build first when missing:
#     docker image inspect "$CLIENT_WP_IMAGE" >/dev/null 2>&1 || docker build -t "$CLIENT_WP_IMAGE" "$CLIENT_WP_TEMPLATE_DIR"
#  3. .env: create it only when absent (umask 077; SITE_DB_PASSWORD, SITE_DB_ROOT_PASSWORD, hex only -- compose
#     interpolates `$`). Never regenerate it while the volumes exist: MariaDB keeps the first start's password.
#  3b. wp-cron-runner: touch /var/lib/wp-cron-runner/paused.<slug>-wp BEFORE compose-new and remove it only after
#     `site-wp install` succeeded. Until WordPress is installed the runner's probe fails on this container
#     (wp-cron-runner.sh:79-82) and withholds the host-wide heartbeat for every site.
#  4. Volumes -- data never disappears through a retry or a default teardown; deleting it is a separate confirmation:
#     - none of "$(client_wp_volumes <slug>)" exists                                  -> compose-new
#     - they exist, no registry, no "$(client_wp_retired_marker <slug>)", .env present,
#       both labelled com.docker.compose.project=<slug>  (= an earlier failed create)   -> retry: SAFE_PATCH_REUSE_VOLUMES=1
#     - the retired marker exists (deprovision-site.sh kept them)                       -> refuse; the operator either
#       purges (deprovision-site.sh --purge-volumes) or deletes the marker by hand to bring the old data back
#     - anything else (other labels, no .env)                                           -> refuse; not ours
#     An abandoned failed create (the retry case, never retried) is removed by
#     `deprovision-site.sh --slug <slug> --apply --confirm <slug> --purge-volumes --confirm-purge <slug>`.
#  5. Write the registry atomically (temp file in sites.d + mv) after compose-new exits 0 with vhost_live=0; rewrite
#     it with vhost_live=1 only after host-nginx-new for this domain exits 0.

CLIENT_WP_TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_WP_IMAGE="awarewave-client-wp:php8.2.35-wpcli2.12.0-r1"   # = Dockerfile in this directory
CLIENT_WP_SLUG_RE='^[a-z0-9][a-z0-9-]{0,39}$'                     # = aw-hosting-gate.sh SLUG_RE
CLIENT_WP_DOMAIN_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'   # + length <= 253 (SITE-FLOW §1-3)
CLIENT_WP_PATH_RE='^/[A-Za-z0-9._/-]+$'
CLIENT_WP_PORT_MIN=8100
CLIENT_WP_PORT_MAX=8199
# Path overrides (CLIENT_WP_SITES_ROOT/_REGISTRY_DIR/_NGINX_DIR/_LOCK_DIR) are for throwaway tests only and count only
# with CLIENT_WP_TEST_PATHS=1: a variable left in a root shell must not give a real run another lock or registry (SF-E2 #9).
if [[ "${CLIENT_WP_TEST_PATHS-}" == 1 ]]; then
  CLIENT_WP_SITES_ROOT="${CLIENT_WP_SITES_ROOT:-/root/sites}"
  CLIENT_WP_REGISTRY_DIR="${CLIENT_WP_REGISTRY_DIR:-/etc/awarewave/sites.d}"
  CLIENT_WP_NGINX_DIR="${CLIENT_WP_NGINX_DIR:-/etc/nginx}"
  CLIENT_WP_LOCK_DIR="${CLIENT_WP_LOCK_DIR:-/run/awarewave/site-locks}"
else
  CLIENT_WP_SITES_ROOT=/root/sites
  CLIENT_WP_REGISTRY_DIR=/etc/awarewave/sites.d
  CLIENT_WP_NGINX_DIR=/etc/nginx
  # Under /run (root 0755), not /run/lock (1777): nobody but root can create or replace it (SF-E2 #1).
  CLIENT_WP_LOCK_DIR=/run/awarewave/site-locks
fi
CLIENT_WP_PORT_LOCK="$CLIENT_WP_LOCK_DIR/_ports.lock"   # `_` cannot start a slug

client_wp__err() { echo "client-wp: $*" >&2; return 1; }
client_wp_valid_slug() { [[ "$1" =~ $CLIENT_WP_SLUG_RE ]] || client_wp__err "bad slug: '$1'"; }
client_wp_valid_domain() {
  [[ ${#1} -le 253 && "$1" =~ $CLIENT_WP_DOMAIN_RE ]] || client_wp__err "bad domain: '$1'"
}
client_wp_valid_port() {
  [[ "$1" =~ ^[0-9]{4}$ ]] && (( 10#$1 >= CLIENT_WP_PORT_MIN && 10#$1 <= CLIENT_WP_PORT_MAX )) \
    || client_wp__err "bad port: '$1' (${CLIENT_WP_PORT_MIN}-${CLIENT_WP_PORT_MAX})"
}
client_wp_valid_path() {  # absolute, no `..` segment, no character nginx/YAML would read as syntax
  [[ "$1" =~ $CLIENT_WP_PATH_RE && "/$1/" != *"/../"* && "/$1/" != *"/./"* ]] || client_wp__err "bad path: '$1'"
}

client_wp_container()      { echo "$1-wp"; }
client_wp_db_container()   { echo "$1-db"; }
client_wp_volumes()        { echo "$1_wordpress_data $1_db_data"; }
client_wp_site_dir()       { echo "$CLIENT_WP_SITES_ROOT/$1"; }
client_wp_compose_file()   { echo "$CLIENT_WP_SITES_ROOT/$1/docker-compose.yml"; }
client_wp_env_file()       { echo "$CLIENT_WP_SITES_ROOT/$1/.env"; }
client_wp_retired_marker() { echo "$CLIENT_WP_SITES_ROOT/$1/DEPROVISIONED"; }
client_wp_registry_file()  { echo "$CLIENT_WP_REGISTRY_DIR/$1.json"; }
client_wp_vhost_file()     { echo "$CLIENT_WP_NGINX_DIR/sites-available/$1.conf"; }   # $1 = domain
client_wp_lock_file()      { echo "$CLIENT_WP_LOCK_DIR/$1.lock"; }
client_wp_db_export_file() { echo "$CLIENT_WP_SITES_ROOT/$1/pre-plugins.sql.gz"; }   # site-wp plugins, 0600, latest only
# Lock dir (slug locks + port lock): created root-only when missing; one that exists must be a real directory owned by
# root and not group/world-writable, and so must its parent -- else return 1 and the caller refuses (never reuses it).
client_wp_lock_dir_ready() {
  local d="$CLIENT_WP_LOCK_DIR" x st
  [[ -e "$d" || -L "$d" ]] || mkdir -p -m 0700 "$d" 2>/dev/null || client_wp__err "cannot create lock dir $d" || return 1
  for x in "$d" "$(dirname "$d")"; do
    [[ -d "$x" && ! -L "$x" ]] || client_wp__err "lock dir $x is not a plain directory -- refusing" || return 1
    st="$(stat -c '%u %a' "$x" 2>/dev/null)" || client_wp__err "cannot stat lock dir $x" || return 1
    [[ "${st%% *}" == 0 ]] && (( (8#${st#* } & 8#022) == 0 )) \
      || client_wp__err "lock dir $x must be root-owned and not group/world-writable (uid ${st%% *}, mode ${st#* }) -- refusing" || return 1
  done
}
# <file> <slug> <domain> <port>: 0 only if the file is a vhost client_wp_render_vhost wrote for exactly this site.
client_wp_vhost_owned() {
  [[ -f "$1" && ! -L "$1" ]] || return 1
  [[ "$(head -n 1 "$1")" == "# $3 -- client WordPress site $2. Rendered by templates/client-wp/render.sh, created with" ]] \
    && grep -qxF "        proxy_pass http://127.0.0.1:$((10#$4));" "$1"
}

# <template> <same_host_products 0|1> <@@KEY@@=value>... ; values are validated by the callers (no & or \ in them).
client_wp__fill() {
  local tmpl="$CLIENT_WP_TEMPLATE_DIR/$1" shp="$2" line out="" kv marker='  # @@same_host_products@@'
  shift 2
  [[ -f "$tmpl" ]] || client_wp__err "template missing: $tmpl" || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == *"$marker" ]]; then
      [[ "$shp" == 1 ]] || continue
      line="${line%"$marker"}"
    fi
    out+="$line"$'\n'
  done <"$tmpl"
  for kv in "$@"; do out="${out//"${kv%%=*}"/"${kv#*=}"}"; done
  [[ "$out" != *@@* ]] || client_wp__err "unfilled placeholder in $1: $(grep -o '@@[A-Za-z_]*@@' <<<"$out" | sort -u | tr '\n' ' ')" || return 1
  printf '%s' "$out"
}

client_wp_render_compose() {
  [[ $# -eq 4 ]] || client_wp__err "usage: client_wp_render_compose <slug> <domain> <port> <same_host_products 0|1>" || return 1
  client_wp_valid_slug "$1" && client_wp_valid_domain "$2" && client_wp_valid_port "$3" || return 1
  [[ "$4" == 0 || "$4" == 1 ]] || client_wp__err "same_host_products must be 0 or 1: '$4'" || return 1
  client_wp_valid_path "$CLIENT_WP_TEMPLATE_DIR" || return 1
  client_wp__fill docker-compose.yml.tmpl "$4" "@@SLUG@@=$1" "@@DOMAIN@@=$2" "@@PORT@@=$((10#$3))" \
    "@@IMAGE@@=$CLIENT_WP_IMAGE" "@@BUILD_CONTEXT@@=$CLIENT_WP_TEMPLATE_DIR"
}

client_wp_render_vhost() {
  [[ $# -eq 4 ]] || client_wp__err "usage: client_wp_render_vhost <slug> <domain> <port> <cert_dir>" || return 1
  client_wp_valid_slug "$1" && client_wp_valid_domain "$2" && client_wp_valid_port "$3" && client_wp_valid_path "$4" \
    || return 1
  client_wp__fill vhost.conf.tmpl 0 "@@SLUG@@=$1" "@@DOMAIN@@=$2" "@@PORT@@=$((10#$3))" "@@CERT_DIR@@=${4%/}"
}

client_wp_render_registry() {
  [[ $# -eq 5 || $# -eq 6 ]] \
    || client_wp__err "usage: client_wp_render_registry <slug> <domain> <port> <ingress> <vhost_live 0|1> [created_at]" || return 1
  local slug="$1" domain="$2" port="$3" ingress="$4" live="$5" at="${6:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" vhost=null v vols=()
  client_wp_valid_slug "$slug" && client_wp_valid_domain "$domain" && client_wp_valid_port "$port" || return 1
  [[ "$at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || client_wp__err "bad created_at: '$at'" || return 1
  case "$ingress:$live" in
    host-vhost:1)                       vhost="\"$(client_wp_vhost_file "$domain")\"" ;;
    host-vhost:0|product-gateway:0)     ;;
    product-gateway:1) client_wp__err "product-gateway has no vhost on this host"; return 1 ;;
    *) client_wp__err "ingress must be host-vhost|product-gateway and vhost_live 0|1: '$ingress' '$live'"; return 1 ;;
  esac
  for v in $(client_wp_volumes "$slug"); do vols+=("\"$v\""); done
  printf '{\n  "slug": "%s",\n  "domain": "%s",\n  "ingress": "%s",\n  "container": "%s",\n  "db_container": "%s",\n  "volumes": [%s],\n  "port": %d,\n  "compose_file": "%s",\n  "vhost_file": %s,\n  "created_at": "%s"\n}\n' \
    "$slug" "$domain" "$ingress" "$(client_wp_container "$slug")" "$(client_wp_db_container "$slug")" \
    "$(IFS=,; echo "${vols[*]}" | sed 's/,/, /g')" "$((10#$port))" "$(client_wp_compose_file "$slug")" "$vhost" "$at"
}

# Same arguments as client_wp_render_registry: writes sites.d/<slug>.json atomically (caller contract 5). The temp file
# starts with `.` and does not end in .json, so a reader globbing sites.d/*.json never sees a half-written registry.
client_wp_write_registry() {
  local f tmp out
  out="$(client_wp_render_registry "$@")" || return 1
  f="$(client_wp_registry_file "$1")"
  mkdir -p "$CLIENT_WP_REGISTRY_DIR" || return 1
  tmp="$(mktemp "$CLIENT_WP_REGISTRY_DIR/.$1.json.XXXXXX")" || return 1
  if printf '%s\n' "$out" >"$tmp" && chmod 0644 "$tmp" && mv -f "$tmp" "$f"; then return 0; fi
  rm -f "$tmp"; client_wp__err "cannot write $f"
}

# <slug>: prints domain= ingress= port= vhost_file= created_at= (one per line) from sites.d/<slug>.json, or returns 1
# with the reason on stderr when the file is missing, malformed, or any name/path differs from what this file derives
# from the slug. Readers act on these values (container names, paths), so a hand-edited registry is never trusted.
client_wp_read_registry() {
  client_wp_valid_slug "$1" || return 1
  local f; f="$(client_wp_registry_file "$1")"
  [[ -f "$f" && ! -L "$f" ]] || client_wp__err "no registry $f" || return 1
  python3 - "$f" "$1" "$CLIENT_WP_DOMAIN_RE" "$(client_wp_container "$1")" "$(client_wp_db_container "$1")" \
    "$(client_wp_volumes "$1")" "$(client_wp_compose_file "$1")" "$CLIENT_WP_NGINX_DIR" \
    "$CLIENT_WP_PORT_MIN" "$CLIENT_WP_PORT_MAX" <<'PY'
import json, re, sys
path, slug, domain_re, wp, db, vols, compose, nginx_dir, pmin, pmax = sys.argv[1:11]
def bad(why):
    sys.exit(f"client-wp: registry {path}: {why}")
try:
    with open(path, encoding="utf-8") as f:
        r = json.load(f)
except (OSError, ValueError) as e:
    bad(f"unreadable: {e}")
keys = {"slug", "domain", "ingress", "container", "db_container", "volumes", "port", "compose_file", "vhost_file", "created_at"}
if not isinstance(r, dict) or set(r) != keys:
    bad("keys differ from the template")
d = r["domain"]
if r["slug"] != slug or not isinstance(d, str) or len(d) > 253 or not re.fullmatch(domain_re.strip("^$"), d):
    bad("slug or domain invalid")
if r["ingress"] not in ("host-vhost", "product-gateway"):
    bad("ingress invalid")
if r["container"] != wp or r["db_container"] != db or r["volumes"] != vols.split() or r["compose_file"] != compose:
    bad("container/volume/compose names differ from what render.sh derives for this slug")
if type(r["port"]) is not int or not int(pmin) <= r["port"] <= int(pmax):
    bad("port invalid")
v = r["vhost_file"]
if not (v is None or (r["ingress"] == "host-vhost" and v == f"{nginx_dir}/sites-available/{d}.conf")):
    bad("vhost_file is not this site's own vhost path")
if not isinstance(r["created_at"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", r["created_at"]):
    bad("created_at invalid")
print(f"domain={d}\ningress={r['ingress']}\nport={r['port']}\nvhost_file={v or ''}\ncreated_at={r['created_at']}")
PY
}
