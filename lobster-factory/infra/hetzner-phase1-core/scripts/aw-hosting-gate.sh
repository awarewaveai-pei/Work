#!/bin/bash
# aw-hosting-gate.sh -- SSH forced command for next-admin's hosting-bridge key (root on this host).
#
# root authorized_keys, one line:
#   restrict,from="172.16.0.0/12",command="/usr/bin/env -u BASH_ENV -u ENV /root/lobster-phase1/scripts/aw-hosting-gate.sh" ssh-ed25519 AAAA... aw-hosting@next-admin
# Installed by sync-host-scripts.sh (sg-deploy step 1.8). Caller: apps/next-admin/app/api/internal/hosting/provision-staging/route.ts
# Contract test: apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts
# BASH_ENV/ENV exposure: same analysis and wrapper as aw-autorepair-gate.sh (header there).
#
# Verbs (SSH_ORIGINAL_COMMAND, single spaces, nothing else; anything else exits 126):
#   staging-prepare <slug> <db>   dir + DB + DB account named <db> + wp core + wp-config. Idempotent.
#                                 Existing site on the main WP account -> migrated to its own account.
#   staging-wp <slug>             stdin (<= 1 MiB) = bash script, run as www-data in lobster-wordpress.
# Authority this key gets: create/repair one staging site's dir, DB and DB account; www-data code in
# lobster-wordpress (wp-cli eval = PHP anyway). Never root in a container shell, never host shell,
# never a DB password on any argv (SQL and passwords travel on stdin).
#
# Invariant: one staging site <-> one DB <-> one DB account (deprovision-staging.sh drops both).
#
# Modes: (no args) forced command | --check  grammar only, ALLOW/DENY, exit 0/126, never executes
#        --list  print the grammar
set -u
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

WP_CT=lobster-wordpress
DB_CT=lobster-wordpress-db
ROOT=/var/www/html/staging
SLUG_RE='^[a-z0-9][a-z0-9-]{0,39}$'
DB_RE='^wp_[a-z0-9_]{1,60}$'
MAX_SCRIPT=1048576

log() {
  local msg="${2//[^[:print:]]/?}"
  command -v logger >/dev/null 2>&1 && logger -t aw-hosting-gate -p "auth.$1" -- "${msg:0:240}"
  return 0
}
die() { echo "aw-hosting-gate: $2" >&2; log warning "FAIL $2"; exit "$1"; }

cmd="${SSH_ORIGINAL_COMMAND-}"
read -r -a argv <<<"$cmd"
parse() {
  [[ "${argv[*]-}" == "$cmd" ]] || return 1   # rejects tabs, double/trailing spaces, newlines
  case "${argv[0]-}" in
    staging-prepare) [[ ${#argv[@]} -eq 3 && "${argv[1]}" =~ $SLUG_RE && "${argv[2]}" =~ $DB_RE ]] ;;
    staging-wp)      [[ ${#argv[@]} -eq 2 && "${argv[1]}" =~ $SLUG_RE ]] ;;
    *) return 1 ;;
  esac
}

case "${1-}" in
  --check) if parse; then echo "ALLOW ${argv[0]}"; exit 0; fi; echo "DENY"; exit 126 ;;
  --list)  printf '%s\n' "staging-prepare $SLUG_RE $DB_RE" "staging-wp $SLUG_RE"; exit 0 ;;
  "") ;;
  *) echo "aw-hosting-gate: unknown argument" >&2; exit 2 ;;
esac

src="${SSH_CLIENT:-local}"; src="${src%% *}"
if ! parse; then
  log warning "DENY from $src: $cmd"
  echo "aw-hosting-gate: command not allowed" >&2
  exit 126
fi
log info "ALLOW from $src: $cmd"

wpc() { docker exec -u www-data "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --path="$DIR/" "$@"; }
# SQL on stdin; root password from the DB container's own env, never on an argv.
sql() { docker exec -i "$DB_CT" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mariadb -uroot --batch --skip-column-names'; }
newpw() { tr -dc 'a-f0-9' </dev/urandom | head -c 48; }
# Makes the DB and the account named $DB exist with password $1 (ALTER keeps a retry consistent).
ensure_account() {
  printf "CREATE DATABASE IF NOT EXISTS \`%s\`;\nCREATE USER IF NOT EXISTS '%s'@'%%' IDENTIFIED BY '%s';\nALTER USER '%s'@'%%' IDENTIFIED BY '%s';\nGRANT ALL PRIVILEGES ON \`%s\`.* TO '%s'@'%%';\n" \
    "$DB" "$DB" "$1" "$DB" "$1" "$DB" "$DB" | sql
}
# Connects with the given credentials (stdin), exit 0 = login works on $DB.
can_login() {
  printf '%s\n%s\n%s\n' "$1" "$2" "$DB" | docker exec -i "$WP_CT" php -r \
    '$l=explode("\n",stream_get_contents(STDIN)); mysqli_report(MYSQLI_REPORT_OFF); exit(@mysqli_connect("lobster-wordpress-db",$l[0],$l[1],$l[2]) ? 0 : 1);'
}
# Sets wp-config constant $1 to $2 with the value on stdin (`wp config set` has no stdin form; wp-cli 2.11
# rejects --prompt=value). The file path is explicit AND re-checked in PHP: on 2026-09-24 a test of this
# transformer without a path resolved getcwd() = /var/www/html and rewrote the MAIN site's DB_PASSWORD
# (80 s outage, WORKLOG 2026-09-24). Never let a wp-config write depend on the working directory.
config_set() {
  [[ "$1" =~ ^DB_(USER|PASSWORD)$ ]] || die 3 "config_set: constant not allowed: $1"
  printf '%s\n' "$2" | docker exec -i -u www-data -w "$DIR" "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --skip-wordpress eval "
    \$f = realpath('$DIR/wp-config.php');
    if (\$f === false || strpos(\$f, '$ROOT/') !== 0 || dirname(\$f) !== '$DIR') { fwrite(STDERR, 'config_set: refusing path'); exit(3); }
    \$v = rtrim(fgets(STDIN), \"\\n\");
    exit((new WPConfigTransformer(\$f))->update('constant', '$1', \$v) ? 0 : 3);" >/dev/null
}

prepare() {
  SLUG="${argv[1]}"; DB="${argv[2]}"; DIR="$ROOT/$SLUG"
  local main_db main_user state pw cfg_db cfg_user old_pw others
  main_db="$(docker exec "$WP_CT" printenv WORDPRESS_DB_NAME)" || true
  main_user="$(docker exec "$WP_CT" printenv WORDPRESS_DB_USER)" || true
  [[ -n "$main_db" && -n "$main_user" ]] || die 3 "cannot read the main site's DB name/user -- refusing (cannot prove the target is not prod)"
  [[ "$DB" != "$main_db" && "$DB" != "$main_user" ]] || die 3 "target is the main site's DB/account"

  docker exec "$WP_CT" bash -c 'mkdir -p "$1" && chown www-data:www-data "$1"' _ "$DIR" || die 3 "mkdir failed"
  others="$(docker exec "$WP_CT" bash -c 'grep -lF -- "$1" '"$ROOT"'/*/wp-config.php 2>/dev/null | grep -vxF -- "$2/wp-config.php"' \
            _ "'DB_NAME', '$DB'" "$DIR")" || true
  [[ -z "$others" ]] || die 3 "DB $DB already belongs to another site: $others"

  if docker exec "$WP_CT" test -f "$DIR/wp-config.php"; then
    cfg_db="$(wpc config get DB_NAME 2>/dev/null)"; cfg_user="$(wpc config get DB_USER 2>/dev/null)"
    [[ "$cfg_db" == "$DB" ]] || die 3 "wp-config DB_NAME is '$cfg_db', not $DB"
    if [[ "$cfg_user" == "$DB" ]]; then
      pw="$(wpc config get DB_PASSWORD 2>/dev/null)"; [[ -n "$pw" ]] || die 3 "wp-config has no DB_PASSWORD"
      ensure_account "$pw" || die 3 "DB account repair failed"
      state=reused
    elif [[ "$cfg_user" == "$main_user" ]]; then
      old_pw="$(wpc config get DB_PASSWORD 2>/dev/null)"
      pw="$(newpw)"
      ensure_account "$pw" || die 3 "DB account create failed (site untouched)"
      can_login "$DB" "$pw" || die 3 "new account cannot log in (site untouched)"
      # Verified by reading wp-config back and logging in with it (not `core is-installed`: a site whose
      # install step never ran must still migrate).
      if config_set DB_PASSWORD "$pw" && config_set DB_USER "$DB" \
         && [[ "$(wpc config get DB_USER 2>/dev/null)" == "$DB" ]] \
         && can_login "$DB" "$(wpc config get DB_PASSWORD 2>/dev/null)"; then
        state=migrated
      else
        config_set DB_USER "$main_user"; config_set DB_PASSWORD "$old_pw"
        die 3 "migration failed; wp-config restored to the main account"
      fi
    else
      die 3 "wp-config DB_USER '$cfg_user' is neither $DB nor the main account -- not touching it"
    fi
  else
    if ! docker exec "$WP_CT" test -f "$DIR/wp-includes/version.php"; then
      wpc core download --quiet >/dev/null 2>&1 || die 3 "wp core download failed"
    fi
    pw="$(newpw)"
    ensure_account "$pw" || die 3 "DB account create failed"
    printf '%s\n' "$pw" | docker exec -i -u www-data "$WP_CT" php -d memory_limit=256M /usr/local/bin/wp --path="$DIR/" \
      config create --dbname="$DB" --dbuser="$DB" --dbhost=lobster-wordpress-db --prompt=dbpass --quiet >/dev/null \
      || die 3 "wp config create failed"
    state=created
  fi
  echo "AW_PREPARE_OK state=$state"
  log info "prepare $SLUG $DB state=$state"
}

run_wp() {
  SLUG="${argv[1]}"; DIR="$ROOT/$SLUG"
  docker exec "$WP_CT" test -d "$DIR" || die 3 "no such staging site: $SLUG"
  # Script -> temp file inside the container, then run with stdin=/dev/null so a command in it
  # that reads stdin cannot swallow the rest of the script.
  head -c $((MAX_SCRIPT + 1)) | docker exec -i -u www-data -w "$DIR" "$WP_CT" bash -c '
    f=$(mktemp) || exit 1
    cat >"$f"
    if [ "$(wc -c <"$f")" -gt "$1" ]; then rm -f "$f"; echo "aw-hosting-gate: script over $1 bytes" >&2; exit 125; fi
    bash "$f" </dev/null; rc=$?; rm -f "$f"; exit $rc' _ "$MAX_SCRIPT"
}

case "${argv[0]}" in
  staging-prepare) prepare ;;
  staging-wp)      run_wp ;;
esac
